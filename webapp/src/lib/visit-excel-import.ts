import ExcelJS from 'exceljs';
import type { Visit } from './visit-types';
import { VISIT_EXCEL_HEADERS } from './visit-template';

export interface ExcelVisitGroup { name: string; area: string; stores: Visit[] }
export interface ExcelVisitPreview { groups: ExcelVisitGroup[]; total: number }
const normalized = (value: string) => value.trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');

export async function loadVisitWorkbook(bytes: ArrayBuffer, readImagesSeparately = false): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
    if (workbook.worksheets.length) return workbook;
  } catch { /* Some valid XLSX producers use XML namespaces ExcelJS cannot read. */ }

  // Read cell values with the compatibility reader. Keep ExcelJS as the primary
  // reader so native visit photos continue to be imported on the normal path.
  const XLSX = await import('xlsx');
  let compatible: ReturnType<typeof XLSX.read> & { keys?: string[] };
  try {
    compatible = XLSX.read(bytes, { type: 'array', bookFiles: true });
    if (!compatible.SheetNames.length) throw new Error('No worksheets');
  } catch {
    throw new Error('Isi file Excel tidak dapat dibaca. File mungkin rusak atau dilindungi kata sandi. Buka di Excel lalu simpan ulang sebagai .xlsx.');
  }
  if (!readImagesSeparately && compatible.keys?.some(name => /^xl\/(media|drawings)\//i.test(name))) {
    throw new Error('File ini membutuhkan pembaca kompatibilitas dan berisi gambar. Agar foto tidak hilang, buka di Microsoft Excel lalu gunakan Simpan Sebagai .xlsx sebelum mengimpor kembali.');
  }
  const result = new ExcelJS.Workbook();
  for (const name of compatible.SheetNames) {
    const sheet = compatible.Sheets[name];
    if (sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']).e.r > 10000)
      throw new Error(`Sheet “${name}” melebihi 10.000 baris.`);
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, { header: 1, raw: true, defval: null });
    result.addWorksheet(name).addRows(rows);
  }
  return result;
}

export async function readVisitExcel(bytes: ArrayBuffer): Promise<ExcelVisitPreview> {
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Ukuran file maksimal 15 MB.');
  if (new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength)).join(',') !== '80,75')
    throw new Error('File tidak dapat dibaca sebagai .xlsx. Buka di Excel lalu gunakan Simpan Sebagai .xlsx, bukan hanya mengganti ekstensi file.');
  const workbook = await loadVisitWorkbook(bytes);
  const groups: ExcelVisitGroup[] = [];
  let total = 0, payloadSize = 0;
  for (const sheet of workbook.worksheets) {
    if (!sheet.actualRowCount) continue;
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, col) => columns.set(normalized(cell.text), col));
    const missing = VISIT_EXCEL_HEADERS.filter(header => !columns.has(normalized(header)));
    if (missing.length) throw new Error(`Sheet “${sheet.name}”: kolom ${missing.join(', ')} belum tersedia. Gunakan format Ekspor data laporan.`);
    if (sheet.rowCount > 10001) throw new Error(`Sheet “${sheet.name}” melebihi 10.000 baris.`);
    const photos = new Map<number, string[]>();
    for (const image of sheet.getImages()) {
      const anchor = image.range.tl;
      if (anchor.nativeCol + 1 !== columns.get(normalized('Foto Kunjungan'))) continue;
      const row = anchor.nativeRow + 1, media = workbook.getImage(Number(image.imageId));
      if (!media || !['jpeg', 'png'].includes(media.extension)) throw new Error(`Sheet “${sheet.name}”, baris ${row}: foto harus JPEG atau PNG.`);
      let base64 = media.base64 || '';
      if (!base64 && media.buffer) {
        const data = new Uint8Array(media.buffer);
        let binary = '';
        for (let offset = 0; offset < data.length; offset += 8192) binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
        base64 = btoa(binary);
      }
      if (!base64) throw new Error(`Sheet “${sheet.name}”, baris ${row}: foto tidak dapat dibaca.`);
      const photo = base64.startsWith('data:') ? base64 : `data:image/${media.extension};base64,${base64}`;
      const items = photos.get(row) || [];
      if (items.length >= 3 || photo.length > 650000) throw new Error(`Sheet “${sheet.name}”, baris ${row}: maksimal 3 foto, masing-masing sekitar 475 KB.`);
      items.push(photo); photos.set(row, items);
    }
    const byArea = new Map<string, ExcelVisitGroup>();
    for (let number = 2; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number);
      const value = (header: typeof VISIT_EXCEL_HEADERS[number]) => columns.has(normalized(header)) ? row.getCell(columns.get(normalized(header))!).text.trim() : '';
      if (VISIT_EXCEL_HEADERS.filter(header => header !== 'No').every(header => !value(header)) && !photos.has(number)) continue;
      const fail = (message: string): never => { throw new Error(`Sheet “${sheet.name}”, baris ${number}: ${message}`); };
      const name = value('Nama Usaha'), area = value('Area Kunjungan');
      if (!name || !area) fail('Nama Usaha dan Area Kunjungan wajib diisi.');
      if (name.length > 1000 || area.length > 1000) fail('nama usaha atau area terlalu panjang.');
      const latitude = value('Latitude'), longitude = value('Longitude');
      if (Boolean(latitude) !== Boolean(longitude)) fail('Latitude dan Longitude harus diisi berpasangan atau keduanya kosong.');
      const coordinate = (raw: string, max: number) => {
        if (!raw) return 0;
        const result = Number(raw.replace(',', '.'));
        if (!Number.isFinite(result) || Math.abs(result) > max) return fail('koordinat tidak valid.');
        return result;
      };
      for (const header of VISIT_EXCEL_HEADERS) if (value(header).length > 65536) fail(`isian ${header} terlalu panjang.`);
      const store: Visit = {
        id: '', visitId: '', name, address: value('Alamat'), category: value('kategori'),
        pic: value('Nama PIC'), url: value('Gmaps'),
        product: value('Produk'), financialInstitutions: value('LJK'), potential: value('Potensi'),
        followUpNotes: value('Follow up'), notes: value('Catatan'), followUp: value('Tindak Lanjut'),
        prospectResult: value('Hasil Prospek'), businessId: value('ID Usaha'), visitArea: area,
        lat: coordinate(latitude, 90), lng: coordinate(longitude, 180),
        rating: 0, reviewCount: 0, photoUrl: null, status: 'visited', visitPhotos: photos.get(number) || [],
      };
      payloadSize += JSON.stringify(store).length * 3;
      if (++total > 10000 || payloadSize > 20 * 1024 * 1024) fail('data terlalu banyak untuk satu impor. Pisahkan menjadi beberapa file.');
      let group = byArea.get(area);
      if (!group) {
        group = { name: `Impor ${sheet.name}`.slice(0, 1000), area, stores: [] };
        byArea.set(area, group); groups.push(group);
      }
      group.stores.push(store);
    }
  }
  if (!total) throw new Error('File tidak berisi data kunjungan.');
  return { groups, total };
}
