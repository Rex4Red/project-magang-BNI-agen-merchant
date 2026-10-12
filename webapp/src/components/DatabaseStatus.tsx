"use client";
import { useVisitLists } from "@/lib/canvasing";
import styles from "@/app/dashboard/layout.module.css";
export default function DatabaseStatus() {
  const { loading, error } = useVisitLists();
  return <span className={styles.databaseStatus} data-state={loading ? "loading" : error ? "error" : "ready"}
    title={error || "Data kunjungan disimpan di database laptop. Server perlu menyala untuk mengaksesnya."}>
    <i aria-hidden="true" />{loading ? "Memuat database" : error ? "Database terputus" : "Database laptop aktif"}
  </span>;
}
