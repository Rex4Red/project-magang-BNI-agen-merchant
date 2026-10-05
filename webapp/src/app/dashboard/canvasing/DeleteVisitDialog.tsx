'use client';

import { useEffect, useRef, type RefObject } from 'react';
import styles from './page.module.css';

export default function DeleteVisitDialog({ storeName, listName, error, onCancel, onConfirm, fallbackFocus }: {
  storeName: string; listName: string; error: string;
  onCancel: () => void; onConfirm: () => void; fallbackFocus: RefObject<HTMLButtonElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallback = fallbackFocus.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      (opener?.isConnected ? opener : fallback?.isConnected ? fallback : null)?.focus({ preventScroll: true });
    };
  }, [fallbackFocus]);
  const outside = (event: { target: EventTarget | null; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) => {
    if (event.target !== event.currentTarget) return false;
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };

  return <dialog ref={ref} className={styles.deleteDialog} role="alertdialog" aria-labelledby="delete-visit-title" aria-describedby="delete-visit-description"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onPointerDown={event => { backdropPressed.current = outside(event); }}
    onClick={event => {
      const cancel = backdropPressed.current && outside(event);
      backdropPressed.current = false;
      if (cancel) onCancel();
    }}>
    <div className={styles.deleteDialogBody}>
      <h2 id="delete-visit-title">Hapus toko?</h2>
      <div className={styles.deleteTarget}><strong>{storeName}</strong><span>Daftar: {listName}</span></div>
      <p id="delete-visit-description">Toko ini beserta catatan dan foto kunjungannya akan dihapus dari daftar.</p>
      {error && <p role="alert" className={styles.deleteDialogError}>{error}</p>}
    </div>
    <footer className={styles.deleteDialogActions}>
      <button type="button" className="btn btn-secondary" onClick={onCancel} autoFocus>Batal</button>
      <button type="button" className={`btn ${styles.confirmDelete}`} onClick={onConfirm}>Hapus toko</button>
    </footer>
  </dialog>;
}
