"use client";
import { useEffect, useRef, useState } from "react";
import { useVisitLists, manageVisitList, deleteVisitList } from "@/lib/canvasing";
import type { VisitList } from "@/lib/visit-types";
import styles from "./ProtectedLists.module.css";

function ListForm({ list, onClose }: { list: VisitList; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(list.name), [mode, setMode] = useState("keep");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const opener = document.activeElement, element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="manage-list-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.header}><h2 id="manage-list-title">{deleting ? "Hapus daftar kunjungan?" : "Kelola daftar"}</h2><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onClose}>Tutup</button></header>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError("");
      try {
        if (deleting) await deleteVisitList(list.id, list.updatedAt);
        else {
          if (mode === "set" && (password.length < 6 || password !== confirm)) throw new Error("Password minimal 6 karakter dan pengulangan harus sama.");
          await manageVisitList(list.id, name.trim(), list.updatedAt, mode === "keep" ? undefined : mode === "remove" ? "" : password);
        }
        onClose();
      } catch (e) { setError(e instanceof Error ? e.message : "Daftar gagal diperbarui."); }
      finally { setBusy(false); }
    }}>
      <div className={styles.body}>
        <div className={styles.target}><strong>{list.name}</strong><span>{list.area} · {list.stores.length} toko</span></div>
        {deleting ? <p>Daftar beserta seluruh catatan dan foto di dalamnya akan dihapus. Tekan Hapus daftar untuk melanjutkan.</p> : <>
          <label className={styles.field}>Nama daftar<input autoFocus required maxLength={1000} value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>
          <label className={styles.field}>Password daftar<select value={mode} onChange={e => setMode(e.target.value)} disabled={busy}><option value="keep">Pertahankan password saat ini</option><option value="set">Pasang / ganti password</option><option value="remove">Hapus password</option></select></label>
          {mode === "set" && <><label className={styles.field}>Password baru<input type="password" autoComplete="new-password" required minLength={6} maxLength={200} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label><label className={styles.field}>Ulangi password<input type="password" autoComplete="new-password" required maxLength={200} value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></label></>}
          <p className={styles.hint}>Buat daftar terlebih dahulu, lalu pasang password ketika siap dibagikan. Mengganti password akan mengunci kembali akses canvaser pada daftar ini.</p>
        </>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <footer className={styles.footer}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setDeleting(!deleting); setError(""); }}>{deleting ? "Batal hapus" : "Hapus daftar…"}</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Menyimpan…" : deleting ? "Hapus daftar" : "Simpan perubahan"}</button>
      </footer>
    </form>
  </dialog>;
}
export default function AdminListManager() {
  const { lists } = useVisitLists();
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<VisitList | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <>
    <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>Kelola daftar</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="admin-lists-title" onCancel={() => setOpen(false)}>
      <header className={styles.header}><h2 id="admin-lists-title">Daftar kunjungan</h2><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Tutup</button></header>
      <div className={styles.body}><p className={styles.description}>Rename, ganti password, atau hapus daftar kunjungan.</p>
        {!lists.length && <p>Belum ada daftar. Simpan pilihan dari Eksplorasi toko atau impor file untuk membuat daftar.</p>}
        <div className={styles.list}>{lists.map(list => <div className={styles.row} key={list.id}><div className={styles.rowText}><strong>{list.name}</strong><span>{list.area} · {list.stores.length} toko · {list.protected ? "Berpassword" : "Tanpa password"}</span></div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(list)}>Kelola</button></div>)}</div>
      </div>
    </dialog>
    {selected && <ListForm list={selected} onClose={() => setSelected(null)} />}
  </>;
}
