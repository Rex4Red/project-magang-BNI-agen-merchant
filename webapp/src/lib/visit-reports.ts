import { displayCategory, type Visit, type VisitList } from './canvasing';

export const FOLLOW_UP_STATUSES = [
  { key: 'closing', label: 'Closing', color: '#3d6654' },
  { key: 'pending', label: 'Perlu tindak lanjut', color: '#a94e25' },
  { key: 'none', label: 'Tidak ada tindak lanjut', color: '#6b6155' },
  { key: 'unknown', label: 'Belum ditentukan', color: '#896946' },
] as const;
export type FollowUpStatus = typeof FOLLOW_UP_STATUSES[number]['key'];
export interface ReportEntry {
  key: string;
  listId: string;
  listName: string;
  area: string;
  category: string;
  prospect: string;
  followUpStatus: FollowUpStatus;
  store: Visit;
}
export interface ReportGroup { key: string; label: string; count: number }

const normalized = (value?: string) => (value || '').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
const noAction = new Set(['tidak ada tindak lanjut', 'tidak perlu tindak lanjut', 'tidak ada', '-', 'selesai']);
const rejected = new Set(['tidak tertarik', 'tidak memenuhi kriteria', 'tidak berminat', 'ditolak']);
const pending = new Set(['belum ditindaklanjuti', 'tertarik', 'perlu pertimbangan', 'proses pendaftaran', 'pic tidak ditemui']);
const successful = new Set(['closing', 'berhasil menjadi agen', 'berhasil menjadi merchant', 'berhasil mendaftar']);

export function followUpStatus(visit: Visit): FollowUpStatus {
  const action = normalized(visit.followUp), potential = normalized(visit.potential), result = normalized(visit.prospectResult);
  if (action === 'closing' || potential === 'closing' || successful.has(result)) return 'closing';
  if (noAction.has(action)) return 'none';
  if (action) return 'pending';
  if (rejected.has(result)) return 'none';
  return pending.has(result) ? 'pending' : 'unknown';
}

export function reportEntries(lists: VisitList[]): ReportEntry[] {
  return lists.flatMap(list => list.stores.filter(store => store.status === 'visited').map(store => ({
    key: JSON.stringify([list.id, store.visitId]), listId: list.id, listName: list.name,
    area: store.visitArea?.trim() || list.area.trim() || 'Belum diisi',
    category: store.category?.trim() ? displayCategory(store) : 'Belum diisi',
    prospect: store.prospectResult?.trim() || 'Belum diisi', followUpStatus: followUpStatus(store), store,
  })));
}

export function groupReports(entries: ReportEntry[], field: 'area' | 'category' | 'prospect'): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const entry of entries) {
    const label = entry[field], key = normalized(label);
    const current = groups.get(key);
    if (current) current.count++;
    else groups.set(key, { key, label, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'id-ID'));
}

export function filterReports(entries: ReportEntry[], filters: { area: string; category: string; status: string }): ReportEntry[] {
  return entries.filter(entry => (!filters.area || normalized(entry.area) === filters.area)
    && (!filters.category || normalized(entry.category) === filters.category)
    && (!filters.status || entry.followUpStatus === filters.status));
}

export function hasReportCoordinates(store: Visit): boolean {
  return Number.isFinite(store.lat) && Number.isFinite(store.lng) && Math.abs(store.lat) <= 90 && Math.abs(store.lng) <= 180
    && (store.lat !== 0 || store.lng !== 0);
}

export function reportLists(lists: VisitList[], entries: ReportEntry[]): VisitList[] {
  const keys = new Set(entries.map(entry => entry.key));
  return lists.map(list => ({ ...list, stores: list.stores.filter(store => keys.has(JSON.stringify([list.id, store.visitId]))) }))
    .filter(list => list.stores.length);
}

export const reportPercent = (count: number, total: number) => total ? Math.round(count / total * 100) : 0;

export function reportInsights(entries: ReportEntry[]): { heading: string; text: string }[] {
  if (!entries.length) return [];
  const total = entries.length, areas = groupReports(entries, 'area'), categories = groupReports(entries, 'category');
  const closing = entries.filter(entry => entry.followUpStatus === 'closing').length;
  const followUp = entries.filter(entry => entry.followUpStatus === 'pending');
  const unknown = entries.filter(entry => entry.followUpStatus === 'unknown').length;
  const missingLocation = entries.filter(entry => !hasReportCoordinates(entry.store)).length;
  const insights = [
    { heading: 'Hasil kunjungan', text: `${closing} dari ${total} usaha (${reportPercent(closing, total)}%) tercatat Closing. ${followUp.length} usaha masih perlu tindak lanjut.` },
  ];
  if (categories[0]?.key !== 'belum diisi') {
    const leaders = categories.filter(group => group.count === categories[0].count);
    insights.push({ heading: 'Kategori terbanyak', text: leaders.length === 1
      ? `${leaders[0].label}: ${leaders[0].count} usaha (${reportPercent(leaders[0].count, total)}% dari kunjungan yang ditampilkan).`
      : `${leaders.slice(0, 3).map(group => group.label).join(', ')}${leaders.length > 3 ? ` dan ${leaders.length - 3} kategori lain` : ''} memiliki jumlah tertinggi yang sama, masing-masing ${leaders[0].count} usaha.` });
  }
  if (areas.length > 1) {
    const leaders = areas.filter(group => group.count === areas[0].count);
    insights.push({ heading: 'Persebaran area', text: leaders.length === 1
      ? `${leaders[0].label} memiliki kunjungan terbanyak: ${leaders[0].count} dari ${total} usaha.`
      : `${leaders.length} area memiliki jumlah kunjungan tertinggi yang sama: ${leaders[0].count} usaha per area.` });
  }
  if (followUp.length) {
    const withContact = followUp.filter(entry => entry.store.phone?.trim()).length;
    insights.push({ heading: 'Kontak tindak lanjut', text: `${withContact} dari ${followUp.length} usaha yang perlu tindak lanjut sudah memiliki nomor telepon. ${followUp.length - withContact} belum memiliki nomor telepon.` });
  }
  if (unknown || missingLocation) insights.push({ heading: 'Data belum lengkap', text: `${unknown} usaha belum memiliki status tindak lanjut yang dapat ditentukan. ${missingLocation} usaha belum memiliki koordinat yang valid untuk peta.` });
  return insights;
}
