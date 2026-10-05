'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useVisitLists, displayAddress } from '@/lib/canvasing';
import { FOLLOW_UP_STATUSES, filterReports, groupReports, reportEntries, reportInsights, reportLists, reportPercent, type FollowUpStatus } from '@/lib/visit-reports';
import { BarChart, StatusChart } from './ReportCharts';
import styles from './page.module.css';

const VisitedStoresMap = dynamic(() => import('../canvasing/VisitedStoresMap'), { ssr: false, loading: () => <p role="status">Memuat peta kunjungan…</p> });
const VisitEditor = dynamic(() => import('../canvasing/VisitEditor'), { ssr: false, loading: () => <p role="status">Memuat catatan kunjungan…</p> });
const PAGE_SIZE = 15;
const count = (value: number) => value.toLocaleString('id-ID');

export default function ReportsWorkspace({ workspace = 'agen' }: { workspace?: 'agen' | 'merchant' }) {
  const { lists, error } = useVisitLists();
  const [filters, setFilters] = useState({ area: '', category: '', status: '' });
  const [view, setView] = useState<'overview' | 'map'>('overview');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ listId: string; visitId: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const entries = useMemo(() => reportEntries(lists), [lists]);
  const areas = useMemo(() => groupReports(entries, 'area'), [entries]);
  const categories = useMemo(() => groupReports(entries, 'category'), [entries]);
  const validFilters = {
    area: areas.some(group => group.key === filters.area) ? filters.area : '',
    category: categories.some(group => group.key === filters.category) ? filters.category : '',
    status: FOLLOW_UP_STATUSES.some(status => status.key === filters.status) ? filters.status : '',
  };
  const filtered = useMemo(() => filterReports(entries, { area: validFilters.area, category: validFilters.category, status: validFilters.status }), [entries, validFilters.area, validFilters.category, validFilters.status]);
  const selectedLists = useMemo(() => reportLists(lists, filtered), [lists, filtered]);
  const insights = useMemo(() => reportInsights(filtered), [filtered]);
  const counts = { closing: 0, pending: 0, none: 0, unknown: 0 } as Record<FollowUpStatus, number>;
  for (const entry of filtered) counts[entry.followUpStatus]++;
  const activePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const shown = filtered.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE);
  const editList = editing && lists.find(list => list.id === editing.listId);
  const editStore = editList && editList.stores.find(store => store.visitId === editing?.visitId);
  const visitLink = workspace === 'agen' ? '/dashboard/canvasing' : '/merchant/canvasing';
  const hasFilters = Boolean(validFilters.area || validFilters.category || validFilters.status);
  function changeFilter(key: 'area' | 'category' | 'status', value: string) {
    setFilters(current => ({ ...current, [key]: value })); setPage(0); setExportError('');
  }
  function resetFilters() { setFilters({ area: '', category: '', status: '' }); setPage(0); setExportError(''); }
  async function exportExcel() {
    setExporting(true); setExportError('');
    try { await (await import('@/lib/visit-excel')).downloadVisitExcel(selectedLists, workspace); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'Ekspor laporan gagal. Coba lagi.'); }
    finally { setExporting(false); }
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><h1>Laporan kunjungan</h1><p>Visualisasi dan insight dari usaha yang sudah dikunjungi.</p></div>
      <div className={styles.headerActions}><Link className="btn btn-secondary" href={visitLink}>Buka kunjungan</Link><button type="button" className="btn btn-primary" disabled={exporting || !!error || !filtered.length} onClick={exportExcel}>{exporting ? 'Menyiapkan Excel…' : 'Ekspor data laporan'}</button></div>
    </header>
    <p className={styles.sourceNote}>Otomatis diperbarui dari catatan akun {workspace} di browser ini. Hanya status “Sudah dikunjungi” yang dihitung.</p>
    {error && <div role="alert" className={styles.error}><h2>Data laporan belum dapat dibaca</h2><p>{error}</p><Link className="btn btn-secondary" href={visitLink}>Periksa data kunjungan</Link></div>}
    {exportError && <p role="alert" className={styles.error}>{exportError}</p>}
    {!error && <>
      <section className={styles.filters} aria-label="Filter laporan">
        <label>Area kunjungan<select value={validFilters.area} onChange={event => changeFilter('area', event.target.value)}><option value="">Semua area</option>{areas.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
        <label>Kategori<select value={validFilters.category} onChange={event => changeFilter('category', event.target.value)}><option value="">Semua kategori</option>{categories.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label>
        <label>Status tindak lanjut<select value={validFilters.status} onChange={event => changeFilter('status', event.target.value)}><option value="">Semua status</option>{FOLLOW_UP_STATUSES.map(status => <option key={status.key} value={status.key}>{status.label}</option>)}</select></label>
        <button type="button" className="btn btn-secondary" disabled={!hasFilters} onClick={resetFilters}>Reset filter</button>
      </section>
      <p className={styles.resultCount} role="status">{count(filtered.length)} dari {count(entries.length)} usaha dikunjungi ditampilkan{hasFilters ? ' sesuai filter' : ''}.</p>
      <dl className={styles.metrics}>
        <div><dt>Total usaha dikunjungi</dt><dd data-metric="total">{count(filtered.length)}</dd><small>{count(groupReports(filtered, 'area').length)} area kunjungan</small></div>
        <div><dt>Closing</dt><dd data-metric="closing">{count(counts.closing)}</dd><small>{reportPercent(counts.closing, filtered.length)}% dari data yang ditampilkan</small></div>
        <div><dt>Perlu tindak lanjut</dt><dd data-metric="pending">{count(counts.pending)}</dd><small>{reportPercent(counts.pending, filtered.length)}% dari data yang ditampilkan</small></div>
      </dl>
      {!entries.length ? <section className={styles.empty}><h2>Belum ada kunjungan untuk dilaporkan</h2><p>Simpan catatan dengan status “Sudah dikunjungi”. Peta, grafik, dan insight akan terisi otomatis.</p><Link className="btn btn-secondary" href={visitLink}>Buka kunjungan</Link></section>
        : !filtered.length ? <section className={styles.empty}><h2>Tidak ada data yang sesuai filter</h2><p>Ubah pilihan area, kategori, atau status untuk melihat kunjungan lainnya.</p><button type="button" className="btn btn-secondary" onClick={resetFilters}>Tampilkan semua kunjungan</button></section>
        : <>
          <div className={styles.viewSwitch} role="group" aria-label="Tampilan laporan"><button type="button" aria-pressed={view === 'overview'} onClick={() => setView('overview')}>Grafik & insight</button><button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>Peta persebaran</button></div>
          {view === 'overview' ? <>
            <div className={styles.chartGrid}><BarChart title="Kategori usaha" groups={groupReports(filtered, 'category')} total={filtered.length} selected={validFilters.category} onSelect={key => changeFilter('category', key)} /><StatusChart counts={counts} total={filtered.length} selected={validFilters.status} onSelect={key => changeFilter('status', key)} /></div>
            <div className={styles.insightGrid}><BarChart title="Hasil prospek" groupLabel="hasil" groups={groupReports(filtered, 'prospect')} total={filtered.length} /><section className={`${styles.panel} ${styles.insights}`} aria-labelledby="report-insights"><h2 id="report-insights">Insight</h2><ul>{insights.map(insight => <li key={insight.heading}><h3>{insight.heading}</h3><p>{insight.text}</p></li>)}</ul></section></div>
          </> : <section className={styles.mapSection}>
            <div className={styles.mapLegend} aria-label="Warna status pada peta">{FOLLOW_UP_STATUSES.map(status => <span key={status.key}><span className={styles.swatch} aria-hidden="true" style={{ background: status.color }} />{status.label}</span>)}</div>
            <VisitedStoresMap lists={selectedLists} workspace={workspace} reportMode showListFilter={false} onEdit={(listId, visitId) => setEditing({ listId, visitId })} />
          </section>}
          <section className={styles.panel} aria-labelledby="report-data">
            <header className={styles.panelHeading}><h2 id="report-data">Data kunjungan</h2><span>{count(filtered.length)} usaha</span></header>
            <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabel data kunjungan">
              <table className={styles.table}><thead><tr><th scope="col">No</th><th scope="col">Nama usaha</th><th scope="col">Status tindak lanjut</th><th scope="col">Hasil prospek</th><th scope="col">Catatan</th><th scope="col">Detail</th></tr></thead><tbody>{shown.map((entry, index) => {
                const status = FOLLOW_UP_STATUSES.find(status => status.key === entry.followUpStatus)!;
                return <tr key={entry.key}>
                  <td data-label="No">{activePage * PAGE_SIZE + index + 1}</td>
                  <td className={styles.nameCell} data-label="Nama usaha"><strong>{entry.store.name || 'Toko belum diberi nama'}</strong><span>{entry.category} · {entry.area}</span><span>{displayAddress(entry.store.address) || 'Alamat belum diisi'}</span></td>
                  <td data-label="Status tindak lanjut"><span className={styles.statusText}><span className={styles.swatch} aria-hidden="true" style={{ background: status.color }} />{status.label}</span></td>
                  <td data-label="Hasil prospek">{entry.prospect}</td>
                  <td className={styles.notesCell} data-label="Catatan">{entry.store.notes?.trim() ? entry.store.notes.length > 160 ? `${entry.store.notes.slice(0, 160)}…` : entry.store.notes : 'Belum diisi'}</td>
                  <td className={styles.actionCell} data-label="Detail"><button type="button" className="btn btn-secondary btn-sm" aria-label={`Lihat catatan ${entry.store.name || 'toko belum diberi nama'}`} onClick={() => setEditing({ listId: entry.listId, visitId: entry.store.visitId })}>Lihat catatan</button></td>
                </tr>;
              })}</tbody></table>
            </div>
            <footer className={styles.tableFooter}><span>Menampilkan {count(activePage * PAGE_SIZE + 1)}–{count(Math.min((activePage + 1) * PAGE_SIZE, filtered.length))} dari {count(filtered.length)} usaha</span><div><button type="button" className="btn btn-secondary btn-sm" disabled={!activePage} onClick={() => setPage(activePage - 1)}>Sebelumnya</button><button type="button" className="btn btn-secondary btn-sm" disabled={(activePage + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(activePage + 1)}>Berikutnya</button></div></footer>
          </section>
        </>}
      <details className={styles.rules}><summary>Aturan perhitungan laporan</summary><div>
        <p>Setiap catatan toko berstatus “Sudah dikunjungi” dihitung sekali per daftar. Seluruh grafik, peta, tabel, insight, dan ekspor mengikuti filter yang sama. Toko tanpa koordinat tetap masuk perhitungan, tetapi tidak diberi titik di peta.</p>
        <ul><li><strong>Closing:</strong> Potensi atau Tindak Lanjut diisi “Closing”, atau Hasil Prospek diisi “Closing”, “Berhasil menjadi agen”, “Berhasil menjadi merchant”, atau “Berhasil mendaftar”. Status sudah punya agen/QRIS/EDC saja tidak menandakan Closing.</li><li><strong>Perlu tindak lanjut:</strong> Tindak Lanjut terisi selain Closing/tanpa tindak lanjut, atau hasilnya Tertarik, Perlu pertimbangan, Proses pendaftaran, PIC tidak ditemui, atau Belum ditindaklanjuti.</li><li><strong>Tidak ada tindak lanjut:</strong> catatan menyebut tidak perlu tindak lanjut/selesai, atau hasilnya Tidak tertarik, Tidak memenuhi kriteria, Tidak berminat, atau Ditolak tanpa rencana tindak lanjut.</li><li><strong>Belum ditentukan:</strong> informasi belum cukup untuk menentukan status. Nilai custom tetap muncul di kategori dan hasil prospek.</li></ul>
      </div></details>
    </>}
    {editList && editStore && editing && <VisitEditor key={JSON.stringify(editing)} listId={editList.id} store={editStore} area={editList.area} workspace={workspace} onClose={() => setEditing(null)} />}
  </div>;
}
