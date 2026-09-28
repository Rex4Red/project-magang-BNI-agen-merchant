import { Icon } from "@/components/Icon";
import styles from "./page.module.css";
const metrics=[["384","Toko ditemukan"],["208","Usaha potensial"],["87","Sudah dikunjungi"],["34","Menjadi agen"]];
const activities=[
 ["Toko Sembako Barokah","Tertarik","2 jam lalu"],
 ["Warung Goyang Indah Mulia","Belum tertarik","3 jam lalu"],
 ["Toko KAFA 2 Seturan","Menjadi agen","5 jam lalu"],
 ["Grosir Sembako Manja","Dijadwalkan","Kemarin"],
 ["Toko Ansoruna","Ditolak","Kemarin"],
];
export default function DashboardPage(){return <div className={styles.dashboard}>
 <div className={styles.heading}><div><h1>Ringkasan</h1></div><p>Data toko dan kunjungan canvasing.</p></div>
 <section className={styles.overview}>
  <a className={styles.explore} href="/dashboard/search"><span className={styles.featureTop}><Icon name="search"/> PENCARIAN TOKO <span>↗</span></span><div><h2>Cari toko</h2><p>Cari toko kelontong dan sembako berdasarkan area.</p></div><span className={styles.featureButton}>Buka pencarian <span>→</span></span></a>
  <div className={styles.metrics}><div className={styles.panelHeading}><h2>Statistik canvasing</h2><span>DATA CONTOH</span></div><div className={styles.metricGrid}>{metrics.map(([value,label],i)=><div key={label} className={styles.metric}><span className={styles.metricIndex}>0{i+1}</span><strong>{value}</strong><span>{label}</span></div>)}</div></div>
 </section>
 <section className={styles.lower}>
  <div className={styles.activity}><div className={styles.panelHeading}><h2>Catatan aktivitas</h2><span>DATA CONTOH</span></div><div className={styles.tableHeader}><span>USAHA</span><span>HASIL</span><span>WAKTU</span></div>{activities.map(([name,status,time])=><div className={styles.activityRow} key={name}><strong>{name}</strong><span className={styles.status}>{status}</span><time>{time}</time></div>)}</div>
  <div className={styles.followup}><h2>Kunjungan dan laporan</h2><p>Kelola daftar toko dan hasil kunjungan.</p><a href="/dashboard/canvasing"><Icon name="clipboard"/><span>Daftar kunjungan</span><span>↗</span></a><a href="/dashboard/reports"><Icon name="chart"/><span>Laporan aktivitas</span><span>↗</span></a></div>
 </section>
 </div>}

