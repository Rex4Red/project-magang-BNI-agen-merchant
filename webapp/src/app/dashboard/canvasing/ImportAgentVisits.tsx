'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { importAgentExcelVisits } from '@/lib/canvasing';
import type { AgentExcelPreview } from '@/lib/agent-visit-excel';
import { Icon } from '@/components/Icon';
import styles from './ImportAgentVisits.module.css';

export default function ImportAgentVisits({ onClose, onImported }: {
  onClose: () => void;
  onImported: (message: string, listId?: string) => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const bytes = useRef<ArrayBuffer | null>(null);
  const generation = useRef(0);
  const commandId = useRef(crypto.randomUUID());
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<AgentExcelPreview | null>(null);
  const [sheets, setSheets] = useState<AgentExcelPreview['sheets']>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [busy, setBusy] = useState<'read' | 'save' | ''>('');
  const [error, setError] = useState('');
  useEffect(() => {
    heading.current?.focus();
    return () => { generation.current = -1; bytes.current = null; };
  }, []);

  async function parse(data: ArrayBuffer, selected?: string[], version = ++generation.current) {
    setBusy('read'); setError(''); setPreview(null);
    try {
      const result = await (await import('@/lib/agent-visit-excel')).readAgentVisitExcel(data, selected);
      if (version !== generation.current) return;
      setPreview(result); setSheets(result.sheets);
      setSelection(result.sheets.filter(sheet => sheet.selected).map(sheet => sheet.name));
    } catch (error) {
      if (version === generation.current) setError(error instanceof Error ? error.message : 'File Excel belum dapat dibaca.');
    } finally { if (version === generation.current) setBusy(''); }
  }
  async function selectFile(file?: File) {
    if (!file) return;
    const version = ++generation.current;
    setError(''); setPreview(null); setSheets([]); setSelection([]); setFilename(file.name);
    bytes.current = null; commandId.current = crypto.randomUUID();
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Pilih file Excel dengan ekstensi .xlsx.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Ukuran file maksimal 15 MB.'); return; }
    setBusy('read');
    try {
      const data = await file.arrayBuffer();
      if (version !== generation.current) return;
      bytes.current = data;
      await parse(data, undefined, version);
    } catch { if (version === generation.current) { setError('File belum dapat dibuka. Pilih ulang file Excel.'); setBusy(''); } }
  }
  function changeSheet(name: string, checked: boolean) {
    const selected = checked ? [...selection, name] : selection.filter(item => item !== name);
    setSelection(selected); commandId.current = crypto.randomUUID();
    if (bytes.current) void parse(bytes.current, selected);
  }
  async function save() {
    if (!preview?.total || busy) return;
    const version = generation.current;
    setBusy('save'); setError('');
    try {
      const result = await importAgentExcelVisits(preview.groups, commandId.current);
      if (version !== generation.current) return;
      onImported(`Impor selesai: ${result.added} kunjungan ditambahkan, ${result.skipped} duplikat dilewati.`, result.listIds[0]);
    } catch (error) {
      if (version === generation.current) setError(error instanceof Error ? error.message : 'Kunjungan belum berhasil diimpor. Coba lagi.');
    } finally { if (version === generation.current) setBusy(''); }
  }
  return <section className={styles.panel} aria-labelledby={`${id}-title`} aria-busy={!!busy}
    onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); } }}>
    <header className={styles.heading}>
      <div><h2 ref={heading} tabIndex={-1} id={`${id}-title`}>Impor kunjungan agen</h2>
        <p>Kolom dibaca otomatis. Setiap daerah menjadi daftar kunjungan tersendiri.</p></div>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={onClose} aria-label="Tutup impor Excel"><Icon name="close" /></button>
    </header>
    <div className={styles.fileRow}>
      <div className={styles.fileInfo}><strong>{filename || 'Pilih template kunjungan'}</strong><span id={`${id}-file-hint`}>File .xlsx, maksimal 15 MB. Foto di dalam sel ikut dibaca.</span></div>
      <button type="button" className="btn btn-secondary" disabled={!!busy} aria-describedby={`${id}-file-hint`} onClick={() => input.current?.click()}><Icon name="clipboard" />{filename ? 'Ganti file' : 'Pilih file Excel'}</button>
      <input ref={input} hidden type="file" aria-label="Pilih file Excel kunjungan agen" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void selectFile(file); }} />
    </div>
    {!!sheets.length && <fieldset className={styles.sheets} disabled={!!busy}>
      <legend>Sheet yang diimpor</legend>
      {sheets.map(sheet => <label key={sheet.name}><input type="checkbox" checked={selection.includes(sheet.name)} onChange={event => changeSheet(sheet.name, event.target.checked)} />
        <span>{sheet.name}<small>{sheet.rows.toLocaleString('id-ID')} toko</small></span></label>)}
    </fieldset>}
    {busy && <p role="status" className={styles.status}>{busy === 'save' ? 'Menyimpan kunjungan…' : 'Membaca sheet dan foto kunjungan…'}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {preview && <>
      <p className={styles.summary} role="status">{preview.total.toLocaleString('id-ID')} kunjungan, {preview.groups.length} daerah, {preview.photoCount} foto.</p>
      {!!preview.groups.length && <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Daerah</th><th scope="col">Toko</th><th scope="col">Foto</th></tr></thead>
        <tbody>{preview.groups.map(group => <tr key={group.area}><th scope="row">{group.area}<small>{group.stores.slice(0, 2).map(store => store.name).join(', ')}{group.stores.length > 2 ? ', …' : ''}</small></th><td>{group.stores.length}</td><td>{group.stores.reduce((sum, store) => sum + (store.visitPhotos?.length || 0), 0)}</td></tr>)}</tbody>
      </table></div>}
      {!selection.length && <p className={styles.status}>Pilih minimal satu sheet untuk melanjutkan.</p>}
      {!!preview.ignoredSheets.length && <p className={styles.hint}>Sheet tanpa kolom kunjungan dilewati: {preview.ignoredSheets.join(', ')}.</p>}
      {!!preview.warnings.length && <ul className={styles.warnings}>{preview.warnings.map(message => <li key={message}>{message}</li>)}</ul>}
      <footer className={styles.footer}><p>Dicatat sebagai Sudah dikunjungi. Data duplikat dilewati, catatan tersimpan tetap dipertahankan.</p>
        <button type="button" className="btn btn-primary" disabled={!!busy || !preview.total} onClick={() => void save()}>{busy === 'save' ? 'Menyimpan…' : `Impor ${preview.total.toLocaleString('id-ID')} kunjungan`}</button>
      </footer>
    </>}
  </section>;
}
