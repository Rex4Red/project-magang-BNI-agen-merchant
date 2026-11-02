"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useVisitLists, unlockVisitList, lockVisitList } from "@/lib/canvasing";
import { useSession } from "@/lib/session";
import { Icon } from "./Icon";
import styles from "./ProtectedLists.module.css";

type Access = { openList: (id: string) => void; showManager: () => void };
const ListAccess = createContext<Access | null>(null);
export function useListAccess() {
  const context = useContext(ListAccess);
  if (!context) throw new Error("ListAccessProvider belum tersedia.");
  return context;
}

function AccessDialog({ children, title, onClose, busy }: { children: ReactNode; title: string; onClose: () => void; busy: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLInputElement>('input[autofocus]')?.focus({ preventScroll: true });
    return () => { element?.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="list-access-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.header}><div className={styles.heading}><span className={styles.icon}><Icon name="lock" /></span><h2 id="list-access-title">{title}</h2></div>
      <button type="button" aria-label="Tutup dialog" className={styles.close} disabled={busy} onClick={onClose}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}

export function ListAccessProvider({ children }: { children: ReactNode }) {
  const { lists } = useVisitLists();
  const [dialog, setDialog] = useState<{ listId?: string } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const protectedLists = lists.filter(list => list.protected);
  const selected = lists.find(list => list.id === dialog?.listId);
  function close() { setDialog(null); setPassword(""); setError(""); }
  function openList(listId: string) { setPassword(""); setError(""); setDialog({ listId }); }
  return <ListAccess.Provider value={{ openList, showManager: () => { setError(""); setDialog({}); } }}>
    {children}
    {dialog && <AccessDialog title={selected ? "Buka daftar kunjungan" : "Akses daftar"} onClose={close} busy={busy}>
      {selected ? <form onSubmit={async event => {
        event.preventDefault(); if (busy) return; setBusy(true); setError("");
        try { await unlockVisitList(selected.id, password); close(); }
        catch (e) { setError(e instanceof Error ? e.message : "Gagal membuka daftar."); }
        finally { setBusy(false); }
      }}>
        <div className={styles.body}><p className={styles.description}>Masukkan password untuk melihat isi daftar ini.</p>
          <div className={styles.target}><strong>{selected.name}</strong><span>{selected.area}</span></div>
          <label className={styles.field}>Password daftar<input autoFocus type="password" autoComplete="off" required maxLength={200} value={password} onChange={event => setPassword(event.target.value)} placeholder="Masukkan password" aria-invalid={!!error} aria-describedby={error ? "list-access-error" : undefined} /></label>
          {error && <p id="list-access-error" role="alert" className={styles.error}>{error}</p>}
          <p className={styles.hint}>Akses terbuka selama 15 menit di perangkat ini.</p>
        </div><footer className={styles.footer}><button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>Batal</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Memeriksa…" : "Buka daftar"}</button></footer>
      </form> : <><div className={styles.body}><p className={styles.description}>Kelola akses daftar untuk kunjungan dan laporan.</p>
        <div className={styles.list}>{protectedLists.map(list => <div className={styles.row} key={list.id}>
          <Icon name={list.locked ? "lock" : "unlock"} /><div className={styles.rowText}><strong>{list.name}</strong><span>{list.area} · {list.locked ? "Terkunci" : "Akses terbuka"}</span></div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => {
            if (list.locked) { openList(list.id); return; }
            setBusy(true); setError("");
            try { await lockVisitList(list.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal mengunci daftar."); } finally { setBusy(false); }
          }}>{list.locked ? "Buka" : "Kunci"}</button>
        </div>)}</div>{error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.hint}>Daftar terkunci belum disertakan di laporan dan ekspor.</p>
      </div><footer className={styles.footer}><button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Selesai</button></footer></>}
    </AccessDialog>}
  </ListAccess.Provider>;
}

export default function ProtectedLists() {
  const { lists } = useVisitLists(), { user } = useSession(), { showManager } = useListAccess();
  const protectedLists = lists.filter(list => list.protected);
  if (!protectedLists.length || user?.role === "admin") return null;
  const locked = protectedLists.filter(list => list.locked).length;
  return <button type="button" className={styles.trigger} onClick={showManager} aria-label={`Akses daftar, ${locked} terkunci`} title="Kelola akses daftar berpassword"><Icon name="lock" /><span>Akses daftar</span>{locked > 0 && <small>{locked}</small>}</button>;
}
