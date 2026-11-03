"use client";
import { useState } from "react";
import Link from "next/link";
import { formatVisitTime } from "@/lib/visit-time";
import { Icon } from "@/components/Icon";
import { useVisitLists, refreshVisits, displayCategory } from "@/lib/canvasing";
import { dashboardSummary } from "@/lib/dashboard-summary";
import { followUpStatus } from "@/lib/visit-reports";
import styles from "./page.module.css";

const number = new Intl.NumberFormat("id-ID");


export default function DashboardPage() {
  const { lists, error } = useVisitLists();
  const [refreshing, setRefreshing] = useState(false);
  const summary = dashboardSummary(lists);
  const metrics = [
    { key: "saved", value: summary.total, label: "Toko tersimpan", icon: "store" as const },
    { key: "potential", value: summary.potential, label: "Potensial tersimpan", icon: "search" as const },
    { key: "visited", value: summary.visited, label: "Sudah dikunjungi", icon: "pin" as const },
    { key: "agents", value: summary.agents, label: "Memiliki QRIS / EDC", icon: "check" as const },
  ];
  return <div className={styles.dashboard}>
    <header className={styles.heading}>
      <h1>Ringkasan</h1>
      <div className={styles.headingActions}>
        <button className="btn btn-secondary" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await refreshVisits(true); } finally { setRefreshing(false); } }}><Icon name="refresh" />{refreshing ? "Memuat data…" : "Perbarui data"}</button>
        <Link className="btn btn-primary" href="/merchant"><Icon name="search" />Cari toko</Link>
      </div>
    </header>
    {error && <div className={styles.error} role="alert"><strong>Data ringkasan belum dapat dibaca</strong><p>{error}</p></div>}
    <section className={styles.metrics} aria-label="Statistik canvasing">
      {metrics.map(({ key, value, label, icon }) => <div key={key} className={styles.metric}>
        <div className={styles.metricLabel}><span>{label}</span><Icon name={icon} /></div>
        <div className={styles.metricValue}><strong data-summary-metric={key}>{error ? "–" : number.format(value)}</strong><span>toko</span></div>
      </div>)}
    </section>
    <section className={styles.activity}>
        <div className={styles.panelHeading}><h2>Kunjungan terbaru</h2><span className="badge badge-info">{number.format(summary.visited)} catatan</span></div>
        {summary.recentVisits.length > 0 ? <>
          <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Nama usaha</th><th scope="col">Area</th><th scope="col">Hasil kunjungan</th><th scope="col">Waktu kunjungan</th></tr></thead>
            <tbody>{summary.recentVisits.map(({ key, store, area, updatedAt }) => {
              const status = followUpStatus(store);
              return <tr key={key}>
                <td data-label="Nama usaha"><strong>{store.name || "Toko belum diberi nama"}</strong><span>{displayCategory(store)}</span></td>
                <td data-label="Area">{area}</td>
                <td data-label="Hasil kunjungan"><span className={`badge ${status === "closing" ? "badge-success" : status === "pending" ? "badge-warning" : "badge-info"}`}>{store.prospectResult?.trim() || store.potential?.trim() || "Hasil belum diisi"}</span></td>
                <td data-label="Waktu kunjungan">{updatedAt ? <time dateTime={updatedAt}>{formatVisitTime(updatedAt)}</time> : <span>Waktu belum tercatat</span>}</td>
              </tr>;
            })}</tbody>
          </table></div>
          <div className={styles.activityFooter}><p>{summary.recentVisits.length} dari {number.format(summary.visited)} catatan kunjungan.</p><Link href="/merchant/canvasing">Lihat semua kunjungan <span aria-hidden="true">→</span></Link></div>
        </> : <div className={styles.empty}><Icon name="clipboard" /><h3>{error ? "Catatan belum dapat ditampilkan" : "Belum ada kunjungan"}</h3>{error && <p>Coba perbarui data.</p>}{!error && <Link className="btn btn-secondary" href="/merchant/canvasing">Buka kunjungan</Link>}</div>}
    </section>
  </div>;
}
