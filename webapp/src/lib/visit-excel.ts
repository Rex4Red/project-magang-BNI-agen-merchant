import ExcelJS from 'exceljs';
import { displayAddress, displayCategory, type VisitList } from './canvasing';
import { VISIT_EXCEL_HEADERS, PRODUCT_OPTIONS, POTENTIAL_OPTIONS, visitProduct, visitInstitutions, isGoogleMapsLink } from './visit-template';

function sheetName(label: string, used: Set<string>): string {
  const base = `Toko_${label}`.replace(/[\\/?*\[\]:\x00-\x1f]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Toko';
  let name = base.slice(0, 31), suffix = 1;
  while (used.has(name.toLowerCase())) {
    const tail = ` (${++suffix})`;
    name = base.slice(0, 31 - tail.length) + tail;
  }
  used.add(name.toLowerCase());
  return name;
}

async function photoForExcel(photo: string) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) throw new Error('Ada foto kunjungan yang tidak dapat dibaca. Periksa foto sebelum ekspor.');
  const bitmap = await createImageBitmap(await (await fetch(photo)).blob());
  try {
    const scale = Math.min(160 / bitmap.width, 120 / bitmap.height);
    if (photo.startsWith('data:image/webp')) {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Foto kunjungan gagal diproses.');
      context.drawImage(bitmap, 0, 0);
      photo = canvas.toDataURL('image/jpeg', .85);
    }
    return { base64: photo, extension: photo.startsWith('data:image/png') ? 'png' as const : 'jpeg' as const,
      width: bitmap.width * scale, height: bitmap.height * scale };
  } finally { bitmap.close(); }
}

export async function createVisitWorkbook(lists: VisitList[]) {
  if (!lists.length) throw new Error('Belum ada daftar kunjungan untuk diekspor.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BNI Canvasing';
  const usedNames = new Set<string>();
  const widths = [6, 28, 24, 35, 22, 18, 28, 20, 28, 22, 36, 45, 28, 25, 40, 16, 16, 25, 18];
  for (const list of lists) {
    const sheet = workbook.addWorksheet(sheetName(list.area || list.name, usedNames));
    sheet.columns = VISIT_EXCEL_HEADERS.map((header, index) => ({ header, width: widths[index] }));
    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `S${Math.max(1, list.stores.length + 1)}` };
    const header = sheet.getRow(1);
    header.height = 30;
    header.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EFE9' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    for (const [index, store] of list.stores.entries()) {
      const coordinates = Number.isFinite(store.lat) && Number.isFinite(store.lng)
        && Math.abs(store.lat) <= 90 && Math.abs(store.lng) <= 180 && (store.lat !== 0 || store.lng !== 0);
      const row = sheet.addRow([
        index + 1, store.name || '', store.category ? displayCategory(store) : '', displayAddress(store.address), store.pic || '', store.phone || '', store.url || '',
        visitProduct(store), visitInstitutions(store), store.potential || '', store.followUpNotes || '', store.notes || '', store.followUp || '',
        null, store.prospectResult || '', coordinates ? store.lat : null, coordinates ? store.lng : null,
        store.visitArea ?? list.area, store.businessId || '',
      ]);
      row.height = Math.min(409, Math.max(75, Math.ceil(Math.max(store.notes?.length || 0, store.followUpNotes?.length || 0, store.followUp?.length || 0, store.prospectResult?.length || 0) / 40) * 15));
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Calibri', size: 11 };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE3DED5' } } };
      });
      for (const col of [6, 19]) row.getCell(col).numFmt = '@';
      for (const col of [16, 17]) row.getCell(col).numFmt = '0.000000';
      if (isGoogleMapsLink(store.url)) {
        row.getCell(7).value = { text: store.url, hyperlink: store.url };
        row.getCell(7).font = { name: 'Calibri', size: 11, color: { argb: 'FF0563C1' }, underline: true };
        row.getCell(7).alignment = { vertical: 'top', wrapText: false };
      }
      for (const [col, values] of [[8, PRODUCT_OPTIONS], [10, POTENTIAL_OPTIONS], [13, POTENTIAL_OPTIONS]] as const) {
        row.getCell(col).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${values.join(',')}"`], showErrorMessage: false };
      }
      const photos = await Promise.all((store.visitPhotos || []).map(photoForExcel));
      if (photos.length) {
        const photoHeight = photos.length * 132 + 8;
        row.height = Math.max(row.height!, photoHeight * .75);
        photos.forEach((photo, photoIndex) => {
          const image = workbook.addImage({ base64: photo.base64, extension: photo.extension });
          // Native offsets use EMUs (9,525 per pixel); fractional row offsets can overlap photos.
          const anchor = (x: number, y: number) => ({
            nativeCol: 13, nativeColOff: Math.round(x * 9525),
            nativeRow: row.number - 1, nativeRowOff: Math.round(y * 9525),
          }) as ExcelJS.Anchor;
          const top = 4 + photoIndex * 132;
          sheet.addImage(image, {
            tl: anchor(4, top), br: anchor(4 + photo.width, top + photo.height), editAs: 'oneCell',
          });
        });
      }
    }
  }
  return workbook;
}

export async function downloadVisitExcel(lists: VisitList[], workspace: 'agen' | 'merchant') {
  const workbook = await createVisitWorkbook(lists);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  const label = (lists.length === 1 ? lists[0].name : 'Semua_daftar').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 100);
  anchor.href = url; anchor.download = `${workspace}_${label}.xlsx`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
