'use client';

import { useRef, useState } from 'react';
import { importExcelVisits } from '@/lib/canvasing';
import type { ExcelVisitPreview } from '@/lib/visit-excel-import';
import { Icon } from '@/components/Icon';
import styles from './page.module.css';

export default function ImportVisitData({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [preview, setPreview] = useState<ExcelVisitPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const commandId = useRef(crypto.randomUUID());
  async function selectFile(file?: File) {
    setPreview(null); setError(''); setFilename(file?.name || '');
    commandId.current = crypto.randomUUID();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Pilih file Excel dengan ekstensi .xlsx.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Ukuran file maksimal 15 MB.'); return; }
    setBusy(true);
    try { setPreview(await (await import('@/lib/visit-excel-import')).readVisitExcel(await file.arrayBuffer())); }
    catch (error) { setError(error instanceof Error ? error.message : 'File Excel gagal dibaca.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || busy) return;
    setBusy(true); setError('');
    try {
      const result = await importExcelVisits(preview.groups, commandId.current);
      onImported(`Impor selesai: ${result.added} usaha ditambahkan, ${result.skipped} data duplikat dilewati.`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Impor belum berhasil. Coba lagi.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="import-visit-title" aria-busy={busy}>
    <header className={styles.panelHeading}><h2 id="import-visit-title">Import Data Excel</h2><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onClose} aria-label="Tutup impor"><Icon name="close" /></button></header>
    <p className={styles.chartHint}>Pilih file .xlsx dari “Ekspor data laporan” (maksimal 15 MB dan 10.000 usaha). Semua sheet akan dibaca. Data disimpan sebagai “Sudah dikunjungi” dan langsung masuk laporan. Data yang sama dilewati tanpa mengubah catatan yang tersimpan.</p>
    <label className={styles.fileField}>Pilih file Excel<input aria-label="File Excel laporan kunjungan" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={event => void selectFile(event.target.files?.[0])} /></label>
    {busy && <p role="status">Sedang memproses data…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && <>
      <p className={styles.chartHint}>{filename}: {preview.total.toLocaleString('id-ID')} usaha dalam {preview.groups.length} daftar. Foto yang tertanam pada kolom Foto Kunjungan ikut diimpor.</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pratinjau impor Excel"><table className={styles.table}><thead><tr><th>Nama usaha</th><th>Area</th><th>Hasil prospek</th></tr></thead><tbody>{preview.groups.flatMap(group => group.stores).slice(0, 5).map((store, index) => <tr key={index}><td data-label="Nama usaha">{store.name}</td><td data-label="Area">{store.visitArea}</td><td data-label="Hasil prospek">{store.prospectResult || 'Belum diisi'}</td></tr>)}</tbody></table></div>
      <p className={styles.chartHint}>Pratinjau menampilkan maksimal 5 usaha. Jumlah data baru dan duplikat ditentukan saat penyimpanan.</p>
      <p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}><Icon name="database" />{busy ? 'Menyimpan…' : 'Import Data'}</button></p>
    </>}
  </section>;
}
