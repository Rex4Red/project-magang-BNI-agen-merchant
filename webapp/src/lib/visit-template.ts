import type { Visit } from './canvasing';

export const VISIT_EXCEL_HEADERS = [
  'No', 'Nama Usaha', 'kategori', 'Alamat', 'Nama PIC', 'No telp', 'Gmaps',
  'Produk', 'LJK', 'Potensi', 'Follow up', 'Catatan', 'Tindak Lanjut',
  'Foto Kunjungan', 'Hasil Prospek', 'Latitude', 'Longitude', 'Area Kunjungan', 'ID Usaha',
] as const;

export const PRODUCT_OPTIONS = ['QRIS', 'EDC', 'QR dan EDC', 'Agen', 'Merchant dan Agen'];
export const POTENTIAL_OPTIONS = [...PRODUCT_OPTIONS, 'Closing'];
export const CATEGORY_OPTIONS = [
  'Toko Kelontong', 'Toko Sembako', 'Fotokopi / ATK', 'F&B (Makanan/Minuman)',
  'Kafe', 'Kesehatan/Apotek', 'Optik/Jam/Aksesoris', 'Minimarket/Retail',
  'Hotel/Penginapan', 'Elektronik/Gadget', 'Fashion/Pakaian', 'Toko Bunga',
  'Toko Umum/Lain-Lain', 'Laundry',
];

export function visitProduct(visit: Visit): string {
  if (visit.product !== undefined) return visit.product;
  const agent = visit.agentStatus === 'yes', qris = visit.qrisStatus === 'yes', edc = visit.edcStatus === 'yes';
  return agent && (qris || edc) ? 'Merchant dan Agen' : agent ? 'Agen'
    : qris && edc ? 'QR dan EDC' : qris ? 'QRIS' : edc ? 'EDC' : '';
}

export function visitInstitutions(visit: Visit): string {
  if (visit.financialInstitutions !== undefined) return visit.financialInstitutions;
  return [
    visit.agentStatus === 'yes' && visit.agentProvider ? `Agen - ${visit.agentProvider}` : '',
    visit.qrisStatus === 'yes' && (visit.qrisProviders?.length || visit.qrisProvider)
      ? `QRIS - ${(visit.qrisProviders?.length ? visit.qrisProviders : [visit.qrisProvider]).filter(Boolean).join(', ')}` : '',
    visit.edcStatus === 'yes' && visit.edcProviders?.length ? `EDC - ${visit.edcProviders.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

export function isGoogleMapsLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'maps.app.goo.gl'
      || url.hostname === 'maps.google.com'
      || (['google.com', 'www.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps/')));
  } catch { return false; }
}
