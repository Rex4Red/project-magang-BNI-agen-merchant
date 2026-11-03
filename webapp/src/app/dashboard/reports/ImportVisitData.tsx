'use client';
import { useRef, useState } from 'react';
import { importExcelVisits } from '@/lib/canvasing';
import { VISIT_EXCEL_HEADERS } from '@/lib/visit-template';
import type { ExcelVisitPreview, ImportSheet, ImportOptions } from '@/lib/visit-excel-import';
import { Icon } from '@/components/Icon';
import styles from './page.module.css';

export default function ImportVisitData({ onClose, onImported }: { onClose: () => void; onImported: (message: string) => void }) {
  const [preview, setPreview] = useState<ExcelVisitPreview | null>(null);
  const [filename, setFilename] = useState(''), [sheets, setSheets] = useState<ImportSheet[]>([]);
  const [options, setOptions] = useState<ImportOptions>({ defaultStatus: 'planned' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const commandId = useRef(crypto.randomUUID()), bytes = useRef<ArrayBuffer | null>(null);
  function configure(patch: Partial<ImportOptions>) { setOptions(current => ({ ...current, ...patch })); setPreview(null); setError(''); commandId.current = crypto.randomUUID(); }
  async function selectFile(file?: File) {
    setPreview(null); setSheets([]); setError(''); setFilename(file?.name || ''); bytes.current = null;
    commandId.current = crypto.randomUUID();
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Pilih file .xlsx, .xls, atau .csv.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Ukuran file maksimal 15 MB.'); return; }
    setBusy(true);
    try {
      bytes.current = await file.arrayBuffer();
      const data = await (await import('@/lib/visit-excel-import')).inspectVisitFile(bytes.current);
      if (!data.length) throw new Error('File tidak memiliki sheet berisi data.');
      setSheets(data);
      const sheet = data.find(item => item.columns['Nama Usaha']) || data[0];
      setOptions({ sheetId: sheet.id, headerRow: sheet.headerRow, columns: sheet.columns, defaultArea: '', defaultStatus: 'planned' });
    } catch (e) { setError(e instanceof Error ? e.message : 'File gagal dibaca.'); }
    finally { setBusy(false); }
  }
  const selected = sheets.find(sheet => sheet.id === options.sheetId);
  return <section className={styles.panel} aria-labelledby="import-visit-title" aria-busy={busy}>
    <header className={styles.panelHeading}><h2 id="import-visit-title">Impor data toko & kunjungan</h2><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onClose} aria-label="Tutup impor"><Icon name="close" /></button></header>
    <p className={styles.chartHint}>Gunakan Excel atau CSV dengan susunan kolom bebas. Nama Usaha wajib dipetakan; kolom lain opsional. Maksimal 15 MB dan 10.000 toko. Data duplikat dilewati tanpa mengubah catatan tersimpan.</p>
    <label className={styles.fileField}>Pilih file<input aria-label="File impor toko" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => void selectFile(event.target.files?.[0])} /></label>
    {selected && <>
      <div className={styles.filters}>
        <label>Sheet<select disabled={busy} value={options.sheetId} onChange={event => {
          const sheet = sheets.find(sheet => sheet.id === Number(event.target.value))!;
          configure({ sheetId: sheet.id, headerRow: sheet.headerRow, columns: sheet.columns });
        }}>{sheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.name}</option>)}</select></label>
        <label>Baris judul kolom<input type="number" min={1} max={100} disabled={busy} value={options.headerRow || 1} onChange={event => configure({ headerRow: Number(event.target.value), columns: {} })} /></label>
        <button type="button" className="btn btn-secondary" disabled={busy || !options.headerRow} onClick={async () => {
          if (!bytes.current) return; setBusy(true); setError('');
          try {
            const data = await (await import('@/lib/visit-excel-import')).inspectVisitFile(bytes.current, options.headerRow);
            setSheets(data); configure({ columns: data.find(sheet => sheet.id === options.sheetId)?.columns || {} });
          } catch (e) { setError(e instanceof Error ? e.message : 'Judul kolom gagal dibaca.'); }
          finally { setBusy(false); }
        }}>Baca ulang judul</button>
        <label>Area jika kosong<input maxLength={1000} disabled={busy} value={options.defaultArea || ''} placeholder={`Gunakan nama sheet: ${selected.name}`} onChange={event => configure({ defaultArea: event.target.value })} /></label>
        <label>Status jika kolom status kosong<select disabled={busy} value={options.defaultStatus} onChange={event => configure({ defaultStatus: event.target.value as 'planned' | 'visited' })}><option value="planned">Belum dikunjungi</option><option value="visited">Sudah dikunjungi</option></select></label>
      </div>
      <details open><summary>Pemetaan kolom</summary><div className={styles.filters}>{VISIT_EXCEL_HEADERS.filter(header => !['No','Foto Kunjungan'].includes(header)).map(header => <label key={header}>{header}{header === 'Nama Usaha' ? ' *' : ''}<select aria-label={`Kolom ${header}`} disabled={busy} value={options.columns?.[header] || 0} onChange={event => configure({ columns: { ...options.columns, [header]: Number(event.target.value) } })}><option value={0}>Tidak digunakan</option>{selected.headers.map((name, i) => <option key={i} value={i + 1}>{i + 1}. {name || '(tanpa judul)'}</option>)}</select></label>)}</div></details>
      <p className={styles.chartHint}>Foto pada kolom Foto Kunjungan dalam XLSX ikut dibaca jika formatnya didukung. Jika waktu kunjungan tidak tersedia, kolom waktu dibiarkan kosong.</p>
      <button type="button" className="btn btn-secondary" disabled={busy || !options.columns?.['Nama Usaha']} onClick={async () => {
        if (!bytes.current) return; setBusy(true); setError(''); setPreview(null);
        try { setPreview(await (await import('@/lib/visit-excel-import')).readVisitExcel(bytes.current, options)); }
        catch (e) { setError(e instanceof Error ? e.message : 'Data gagal dibaca.'); }
        finally { setBusy(false); }
      }}>Pratinjau data</button>
    </>}
    {busy && <p role="status">Sedang memproses data…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {preview && <>
      <p className={styles.chartHint}>{filename}: {preview.total.toLocaleString('id-ID')} toko dalam {preview.groups.length} daftar.</p>
      {preview.warnings?.map(warning => <p key={warning} role="status" className={styles.chartHint}>{warning}</p>)}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pratinjau impor"><table className={styles.table}><thead><tr><th>Nama usaha</th><th>Area</th><th>Status</th></tr></thead><tbody>{preview.groups.flatMap(group => group.stores).slice(0, 5).map((store, index) => <tr key={index}><td data-label="Nama usaha">{store.name}</td><td data-label="Area">{store.visitArea}</td><td data-label="Status">{store.status === 'visited' ? 'Sudah dikunjungi' : 'Belum dikunjungi'}</td></tr>)}</tbody></table></div>
      <p className={styles.chartHint}>Pratinjau menampilkan maksimal 5 toko. Periksa pemetaan sebelum menyimpan.</p>
      <p><button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
        if (busy) return; setBusy(true); setError('');
        try {
          const result = await importExcelVisits(preview.groups, commandId.current);
          onImported(`Impor selesai: ${result.added} toko ditambahkan, ${result.skipped} duplikat dilewati.`);
        } catch (e) { setError(e instanceof Error ? e.message : 'Impor belum berhasil. Coba lagi.'); }
        finally { setBusy(false); }
      }}><Icon name="database" />{busy ? 'Menyimpan…' : 'Simpan impor'}</button></p>
    </>}
  </section>;
}
