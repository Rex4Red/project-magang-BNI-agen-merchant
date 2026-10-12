"use client";
import { useVisitLists, refreshVisits, retryLegacyImport, dismissDatabaseNotice } from "@/lib/canvasing";
import type { ReactNode } from "react";
import styles from "./VisitDataWorkspace.module.css";

export default function VisitDataWorkspace({ children }: { children: ReactNode }) {
  const { loading, error, migrationError, notice } = useVisitLists();
  if (loading) return <p className={styles.status} role="status">Memuat data dari database laptop…</p>;
  return <>
    {error && <div className={styles.error} role="alert"><p>{error}</p><button className="btn btn-secondary" onClick={() => void refreshVisits(true)}>Coba lagi</button></div>}
    {migrationError && <div className={styles.error} role="alert"><p>Data lama di browser belum berhasil dipindahkan. {migrationError} Salinan browser tetap tersedia.</p><button className="btn btn-secondary" onClick={() => void retryLegacyImport()}>Coba pindahkan lagi</button></div>}
    {notice && <div className={styles.status} role="status"><p>{notice}</p><button className="btn btn-secondary" onClick={dismissDatabaseNotice}>Tutup pemberitahuan</button></div>}
    {children}
  </>;
}
