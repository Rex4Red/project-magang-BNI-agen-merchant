import JSZip from 'jszip';

export type PhotoSheet = { name: string; photoColumn: number; headerRow: number };
export type SheetPhotos = Map<string, Map<number, string[]>>;
const children = (element: Element, name: string) => Array.from(element.children).filter(child => child.localName === name);
const descendants = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name));
const attribute = (element: Element, name: string) => Array.from(element.attributes).find(item => item.localName === name)?.value || '';
const indexAttribute = (element: Element | undefined, name: string) => {
  const value = element?.getAttribute(name);
  return value != null && /^\d+$/.test(value) ? Number(value) : NaN;
};

function relativePart(part: string, target: string) {
  const url = new URL(target, `https://workbook.invalid/${part}`);
  if (url.origin !== 'https://workbook.invalid') throw new Error('Referensi gambar Excel tidak valid.');
  return decodeURIComponent(url.pathname.slice(1));
}

function dataUrl(bytes: Uint8Array, mime: string) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

async function photoForStorage(bytes: Uint8Array, extension: string) {
  const format = extension.toLowerCase().replace('jpg', 'jpeg');
  if (!['jpeg', 'png', 'webp'].includes(format)) throw new Error('Foto Excel harus berupa JPG, PNG, atau WebP.');
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('Satu foto Excel melebihi 15 MB.');
  const blob = new Blob([new Uint8Array(bytes)], { type: `image/${format}` });
  const image = await createImageBitmap(blob);
  try {
    if (!image.width || !image.height) throw new Error('Ukuran foto Excel tidak valid.');
    const original = dataUrl(bytes, blob.type);
    if (original.length <= 650000 && image.width <= 1200 && image.height <= 1200) return original;
    const ratio = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser belum dapat memproses foto Excel.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.8, .65, .5, .35]) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= 650000) return compressed;
    }
    throw new Error('Foto Excel terlalu besar setelah dikompresi.');
  } finally { image.close(); }
}

export async function readAgentExcelPhotos(bytes: ArrayBuffer, selected: PhotoSheet[]): Promise<SheetPhotos> {
  const zip = await JSZip.loadAsync(bytes);
  async function xml(part: string, optional = false) {
    const file = zip.file(part);
    if (!file) {
      if (optional) return null;
      throw new Error(`Bagian Excel tidak ditemukan: ${part}.`);
    }
    const content = await file.async('string');
    if (content.length > 12 * 1024 * 1024 || /<!DOCTYPE/i.test(content)) throw new Error('Struktur Excel terlalu besar atau tidak didukung.');
    const parsed = new DOMParser().parseFromString(content, 'application/xml');
    if (parsed.getElementsByTagName('parsererror').length) throw new Error('Struktur gambar Excel tidak dapat dibaca.');
    return parsed;
  }
  async function relations(part: string) {
    const pieces = part.split('/'), file = pieces.pop();
    const document = await xml([...pieces, '_rels', `${file}.rels`].join('/'), true);
    const result = new Map<string, string>();
    for (const item of document ? descendants(document, 'Relationship') : []) {
      if (item.getAttribute('TargetMode') === 'External') continue;
      result.set(item.getAttribute('Id') || '', relativePart(part, item.getAttribute('Target') || ''));
    }
    return result;
  }
  const workbook = await xml('xl/workbook.xml');
  const workbookRelations = await relations('xl/workbook.xml');
  const result: SheetPhotos = new Map();
  const compressed = new Map<string, Promise<string>>();
  async function add(sheet: string, row: number, part: string) {
    const rows = result.get(sheet) || new Map<number, string[]>();
    const photos = rows.get(row) || [];
    if (photos.length >= 3) throw new Error(`Sheet “${sheet}”, baris ${row}: maksimal 3 foto per toko.`);
    if (!compressed.has(part)) compressed.set(part, (async () => {
      const file = zip.file(part);
      if (!file) throw new Error(`Sheet “${sheet}”, baris ${row}: file foto tidak ditemukan.`);
      return photoForStorage(await file.async('uint8array'), part.split('.').pop() || '');
    })());
    photos.push(await compressed.get(part)!);
    rows.set(row, photos); result.set(sheet, rows);
  }
  const metadata = await xml('xl/metadata.xml', true);
  const richValues = await xml('xl/richData/rdrichvalue.xml', true);
  const structures = await xml('xl/richData/rdrichvaluestructure.xml', true);
  const richRelations = await xml('xl/richData/richValueRel.xml', true);
  const imageRelations = await relations('xl/richData/richValueRel.xml');
  function imageInCell(index: number): string | undefined {
    if (!metadata || !richValues || !structures || !richRelations) return undefined;
    const values = descendants(metadata, 'valueMetadata')[0];
    const record = values && children(values, 'bk')[index - 1];
    const reference = record && descendants(record, 'rc')[0];
    if (!reference) return undefined;
    const types = descendants(metadata, 'metadataTypes')[0];
    const type = types && children(types, 'metadataType')[indexAttribute(reference, 't') - 1]?.getAttribute('name');
    if (type !== 'XLRICHVALUE') return undefined;
    const future = descendants(metadata, 'futureMetadata').find(item => item.getAttribute('name') === type);
    const block = future && children(future, 'bk')[indexAttribute(reference, 'v')];
    const value = block && children(richValues.documentElement, 'rv')[indexAttribute(descendants(block, 'rvb')[0], 'i')];
    if (!value) return undefined;
    const structure = children(structures.documentElement, 's')[indexAttribute(value, 's')];
    if (structure?.getAttribute('t') !== '_localImage') return undefined;
    const imageIndex = children(structure, 'k').findIndex(key => key.getAttribute('n') === '_rvRel:LocalImageIdentifier');
    if (imageIndex < 0) return undefined;
    const relationIndex = children(value, 'v')[imageIndex]?.textContent;
    if (!relationIndex || !/^\d+$/.test(relationIndex)) return undefined;
    const rel = children(richRelations.documentElement, 'rel')[Number(relationIndex)];
    return rel ? imageRelations.get(attribute(rel, 'id')) : undefined;
  }
  for (const spec of selected) {
    const sheet = descendants(workbook!, 'sheet').find(item => item.getAttribute('name') === spec.name);
    const part = sheet && workbookRelations.get(attribute(sheet, 'id'));
    if (!part) throw new Error(`Sheet “${spec.name}” tidak ditemukan dalam file Excel.`);
    const document = await xml(part);
    for (const cell of descendants(document!, 'c')) {
      const address = cell.getAttribute('r')?.match(/^([A-Z]+)(\d+)$/i);
      if (!address || !cell.hasAttribute('vm')) continue;
      const column = [...address[1].toUpperCase()].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
      const row = Number(address[2]);
      if (column !== spec.photoColumn || row <= spec.headerRow) continue;
      const image = imageInCell(Number(cell.getAttribute('vm')));
      if (!image) throw new Error(`Sheet “${spec.name}”, baris ${row}: gambar di dalam sel belum dapat dibaca.`);
      await add(spec.name, row, image);
    }
    const sheetRelations = await relations(part);
    for (const drawing of descendants(document!, 'drawing')) {
      const drawingPart = sheetRelations.get(attribute(drawing, 'id'));
      if (!drawingPart) continue;
      const drawingXml = await xml(drawingPart);
      const drawingRelations = await relations(drawingPart);
      for (const anchor of Array.from(drawingXml!.documentElement.children)) {
        const from = children(anchor, 'from')[0];
        if (!from) continue;
        const row = Number(children(from, 'row')[0]?.textContent) + 1;
        const column = Number(children(from, 'col')[0]?.textContent) + 1;
        if (column !== spec.photoColumn || row <= spec.headerRow) continue;
        for (const image of descendants(anchor, 'blip')) {
          const imagePart = drawingRelations.get(attribute(image, 'embed'));
          if (!imagePart) throw new Error(`Sheet “${spec.name}”, baris ${row}: foto harus disisipkan ke file Excel, bukan ditautkan ke file luar.`);
          await add(spec.name, row, imagePart);
        }
      }
    }
  }
  return result;
}
