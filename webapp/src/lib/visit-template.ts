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

export function visitPaymentDetails(visit: Visit): { product: string; financialInstitutions: string } {
  const agent = visit.agentStatus === 'yes', qris = visit.qrisStatus === 'yes', edc = visit.edcStatus === 'yes';
  const product = agent && (qris || edc) ? 'Merchant dan Agen' : agent ? 'Agen'
    : qris && edc ? 'QR dan EDC' : qris ? 'QRIS' : edc ? 'EDC' : '';
  const providers = (values: string[]) => values.map(value => value.trim())
    .filter((value, index, all) => value && all.findIndex(other => other.toLowerCase() === value.toLowerCase()) === index)
    .join(', ');
  const agentProvider = visit.agentProvider?.trim();
  const qrisProviders = providers(visit.qrisProviders ?? (visit.qrisProvider ? [visit.qrisProvider] : []));
  const edcProviders = providers(visit.edcProviders ?? []);
  const financialInstitutions = [
    agent && agentProvider ? `Agen - ${agentProvider}` : '',
    qris && qrisProviders ? `QRIS - ${qrisProviders}` : '',
    edc && edcProviders ? `EDC - ${edcProviders}` : '',
  ].filter(Boolean).join('\n');
  return { product, financialInstitutions };
}

export function visitProduct(visit: Visit): string {
  return visit.product ?? visitPaymentDetails(visit).product;
}

export function visitInstitutions(visit: Visit): string {
  return visit.financialInstitutions ?? visitPaymentDetails(visit).financialInstitutions;
}

export function isGoogleMapsLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'maps.app.goo.gl'
      || url.hostname === 'maps.google.com'
      || (['google.com', 'www.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps/')));
  } catch { return false; }
}
