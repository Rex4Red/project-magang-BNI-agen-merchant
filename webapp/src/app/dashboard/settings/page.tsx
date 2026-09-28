"use client";
import styles from "../placeholder.module.css";

export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Pengaturan</h1>
        <p>Konfigurasi sistem dan preferensi pengguna.</p>
      </div>
      <div className={styles.empty}>
        <h2>Pengaturan belum tersedia</h2>
        <p>
          Halaman pengaturan akan segera tersedia
        </p>
      </div>
    </div>
  );
}
