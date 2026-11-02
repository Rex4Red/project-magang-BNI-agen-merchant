import type ExcelJS from 'exceljs';
import type { Visit } from './visit-types';
import { VISIT_EXCEL_HEADERS, isGoogleMapsLink } from './visit-template';
import { loadVisitWorkbook } from './visit-excel-import';
import { readAgentExcelPhotos } from './agent-excel-images';

type Header = typeof VISIT_EXCEL_HEADERS[number];
export interface AgentExcelGroup { name: string; area: string; sheets: string[]; stores: Visit[] }
export interface AgentExcelPreview {
  groups: AgentExcelGroup[];
  total: number;
  photoCount: number;
  sheets: { name: string; rows: number; columns: number; selected: boolean }[];
  ignoredSheets: string[];
  warnings: string[];
}
const key = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g, '');
const aliases: Partial<Record<Header, string[]>> = {
  'Nama Usaha': ['Nama Toko', 'Nama Merchant'], kategori: ['Kategori Usaha', 'Jenis Usaha', 'Kategori Toko'],
  Alamat: ['Alamat Toko', 'Alamat Usaha'], 'Nama PIC': ['PIC', 'Penanggung Jawab'],
  'No telp': ['No Telepon', 'Nomor Telepon', 'No HP', 'Telepon', 'Nomor HP', 'WhatsApp'],
  Gmaps: ['Google Maps', 'Link Gmaps', 'Link Maps', 'URL Google Maps'],
  LJK: ['Lembaga Jasa Keuangan', 'Penyedia'], 'Follow up': ['Catatan Follow Up'],
  'Tindak Lanjut': ['Tindaklanjut'], 'Foto Kunjungan': ['Foto', 'Dokumentasi Kunjungan'],
  Latitude: ['Lat', 'Lintang'], Longitude: ['Lng', 'Lon', 'Bujur'],
  'Area Kunjungan': ['Area', 'Daerah', 'Wilayah', 'Daerah Kunjungan'], 'ID Usaha': ['ID Toko'],
};
const headers = new Map(VISIT_EXCEL_HEADERS.flatMap(header =>
  [header, ...(aliases[header] || [])].map(alias => [key(alias), header] as const)));

function detectHeader(sheet: ExcelJS.Worksheet) {
  for (let number = 1; number <= Math.min(30, sheet.rowCount); number++) {
    const columns = new Map<Header, number>();
    sheet.getRow(number).eachCell((cell, column) => {
      const header = headers.get(key(cell.text));
      if (header && !columns.has(header)) columns.set(header, column);
    });
    if (columns.has('Nama Usaha') && columns.size >= 3) return { number, columns };
  }
  return null;
}

function paymentDetails(product: string, institutions: string): Partial<Visit> {
  const providers: Record<'agent' | 'qris' | 'edc', string[]> = { agent: [], qris: [], edc: [] };
  const found = [...institutions.matchAll(/\b(qris|qr|edc|agen\s*46|agen|brilink)\b\s*[-:]?\s*/gi)];
  for (const [index, match] of found.entries()) {
    const family = /qr/i.test(match[1]) ? 'qris' : /edc/i.test(match[1]) ? 'edc' : 'agent';
    const value = institutions.slice(match.index! + match[0].length, found[index + 1]?.index)
      .replace(/^[\s,;]+|[\s,;]+$/g, '');
    providers[family].push(...value.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean));
    if (/brilink/i.test(match[1]) && !value) providers.agent.push('BRILink');
  }
  const content = `${product} ${institutions}`;
  const present = { agent: /\bagen(?:\s*46)?\b|\bbrilink\b/i.test(content),
    qris: /\bqris\b|\bqr\b/i.test(content), edc: /\bedc\b/i.test(content) };
  if (!found.length && institutions.trim()) {
    const families = (Object.keys(present) as (keyof typeof present)[]).filter(family => present[family]);
    if (families.length === 1) providers[families[0]] = institutions.split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
  }
  const unique = (items: string[]) => items.filter((item, index) => items.findIndex(other => key(other) === key(item)) === index);
  return {
    agentStatus: present.agent ? 'yes' : 'unknown', agentProvider: unique(providers.agent).join(', '),
    qrisStatus: present.qris ? 'yes' : 'unknown', qrisProviders: unique(providers.qris),
    qrisProvider: unique(providers.qris)[0] || '',
    edcStatus: present.edc ? 'yes' : 'unknown', edcProviders: unique(providers.edc),
  };
}

function coordinatesFromLink(value: string) {
  if (!isGoogleMapsLink(value)) return null;
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Keep the original link if it has an invalid escape. */ }
  const point = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
    || decoded.match(/[?&](?:query|q|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!point) return null;
  const lat = Number(point[1]), lng = Number(point[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export async function readAgentVisitExcel(bytes: ArrayBuffer, selectedSheets?: string[]): Promise<AgentExcelPreview> {
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Ukuran file maksimal 15 MB.');
  const signature = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  if (signature[0] !== 80 || signature[1] !== 75) throw new Error('Pilih file .xlsx yang disimpan dari Excel, bukan file yang hanya diganti ekstensinya.');
  const workbook = await loadVisitWorkbook(bytes, true);
  const supported = workbook.worksheets.flatMap(sheet => {
    const header = detectHeader(sheet);
    if (!header) return [];
    if (sheet.rowCount > 10030) throw new Error(`Sheet “${sheet.name}” melebihi 10.000 baris.`);
    let rows = 0;
    for (let number = header.number + 1; number <= sheet.rowCount; number++)
      if (sheet.getRow(number).getCell(header.columns.get('Nama Usaha')!).text.trim()) rows++;
    return [{ sheet, header, rows }];
  });
  if (!supported.length) throw new Error('Kolom Nama Usaha belum ditemukan. Gunakan template kunjungan dengan nama usaha dan alamat atau area.');
  const widest = Math.max(...supported.map(item => item.header.columns.size));
  const selection = selectedSheets ?? supported.filter(item => item.header.columns.size === widest).map(item => item.sheet.name);
  if (selection.some(name => !supported.some(item => item.sheet.name === name))) throw new Error('Sheet yang dipilih belum memiliki kolom kunjungan yang dapat dibaca.');
  const active = supported.filter(item => selection.includes(item.sheet.name));
  const images = await readAgentExcelPhotos(bytes, active.filter(item => item.header.columns.has('Foto Kunjungan')).map(item => ({
    name: item.sheet.name, photoColumn: item.header.columns.get('Foto Kunjungan')!, headerRow: item.header.number,
  })));
  const groups = new Map<string, AgentExcelGroup>();
  const warnings: string[] = [];
  let total = 0, photoCount = 0, payloadBytes = 0;
  for (const { sheet, header } of active) {
    let lastArea = '', fallbackRows = 0;
    const photoRows = images.get(sheet.name);
    for (let number = header.number + 1; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number);
      const fail = (message: string): never => { throw new Error(`Sheet “${sheet.name}”, baris ${number}: ${message}`); };
      const value = (label: Header) => {
        const column = header.columns.get(label);
        if (!column) return '';
        const cell = row.getCell(column);
        if (cell.value && typeof cell.value === 'object' && 'error' in cell.value)
          return fail(`kolom ${label} berisi ${cell.text}. Perbaiki nilainya di Excel.`);
        let text = cell.text.trim();
        if (label === 'Gmaps') text = cell.hyperlink || cell.formula?.match(/^HYPERLINK\(\s*"([^"]+)"/i)?.[1] || text;
        if (label === 'No telp' && typeof cell.value === 'number' && Number.isInteger(cell.value)) {
          text = cell.value.toFixed(0);
          if (/^0{2,}$/.test(cell.numFmt)) text = text.padStart(cell.numFmt.length, '0');
        }
        if (text.length > (label === 'Nama Usaha' || label === 'Area Kunjungan' ? 1000 : 65536)) fail(`isian ${label} terlalu panjang.`);
        return text;
      };
      const name = value('Nama Usaha');
      const photos = photoRows?.get(number) || [];
      const hasContent = [...header.columns.keys()].filter(label => !['No', 'Foto Kunjungan'].includes(label)).some(label => !!value(label));
      if (!hasContent && !photos.length) continue;
      if (headers.get(key(name)) === 'Nama Usaha') continue;
      if (!name) fail('Nama Usaha wajib diisi.');
      const explicitArea = value('Area Kunjungan').replace(/\s+/g, ' ').trim();
      const area = explicitArea || lastArea || sheet.name.replace(/^(?:toko|data)[_\s-]+/i, '').trim();
      if (!area || area.length > 1000) fail('Area Kunjungan belum dapat ditentukan.');
      if (!explicitArea) fallbackRows++;
      lastArea = area;
      const latitude = value('Latitude'), longitude = value('Longitude');
      if (Boolean(latitude) !== Boolean(longitude)) fail('Latitude dan Longitude harus diisi berpasangan atau keduanya kosong.');
      let coordinates = coordinatesFromLink(value('Gmaps')) || { lat: 0, lng: 0 };
      if (latitude && longitude) {
        coordinates = { lat: Number(latitude.replace(',', '.')), lng: Number(longitude.replace(',', '.')) };
        if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng) || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) fail('koordinat tidak valid.');
      }
      const photoColumn = header.columns.get('Foto Kunjungan');
      if (photoColumn && row.getCell(photoColumn).text.trim() && !photos.length)
        fail('isi Foto Kunjungan belum dapat dibaca sebagai gambar. Sisipkan foto langsung pada sel atau di atas sel foto.');
      const product = value('Produk'), financialInstitutions = value('LJK');
      const store: Visit = {
        id: '', visitId: '', name, address: value('Alamat'), category: value('kategori'),
        pic: value('Nama PIC'), phone: value('No telp'), url: value('Gmaps'),
        product, financialInstitutions, ...paymentDetails(product, financialInstitutions),
        potential: value('Potensi'), followUpNotes: value('Follow up'), notes: value('Catatan'),
        followUp: value('Tindak Lanjut'), prospectResult: value('Hasil Prospek'), businessId: value('ID Usaha'),
        visitArea: area, ...coordinates, rating: 0, reviewCount: 0, photoUrl: null,
        status: 'visited', visitPhotos: photos,
      };
      payloadBytes += new TextEncoder().encode(JSON.stringify(store)).length;
      if (++total > 10000 || payloadBytes > 20 * 1024 * 1024) fail('data terlalu banyak untuk satu impor. Pilih lebih sedikit sheet atau pisahkan file.');
      photoCount += photos.length;
      const areaKey = area.toLocaleLowerCase('id-ID');
      let group = groups.get(areaKey);
      if (!group) { group = { name: area, area, sheets: [], stores: [] }; groups.set(areaKey, group); }
      if (!group.sheets.includes(sheet.name)) group.sheets.push(sheet.name);
      group.stores.push(store);
    }
    if (fallbackRows) warnings.push(`Sheet “${sheet.name}”: ${fallbackRows} baris memakai area sebelumnya atau nama sheet karena Area Kunjungan kosong.`);
  }
  if (active.length && !total) throw new Error('Sheet yang dipilih belum berisi data kunjungan.');
  return {
    groups: [...groups.values()], total, photoCount, warnings,
    sheets: supported.map(item => ({ name: item.sheet.name, rows: item.rows, columns: item.header.columns.size, selected: selection.includes(item.sheet.name) })),
    ignoredSheets: workbook.worksheets.filter(sheet => !supported.some(item => item.sheet === sheet)).map(sheet => sheet.name),
  };
}
