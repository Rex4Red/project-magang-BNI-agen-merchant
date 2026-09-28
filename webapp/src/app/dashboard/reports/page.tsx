"use client";
import styles from "../placeholder.module.css";

export default function ReportsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Laporan</h1>
        <p>Rekap data canvasing untuk analisis dan pelaporan.</p>
      </div>
      <div className={styles.empty}>
        <h2>Belum ada data laporan</h2>
        <p>
          Data laporan akan tersedia setelah ada aktivitas canvasing
        </p>
      </div>
    </div>
  );
}
