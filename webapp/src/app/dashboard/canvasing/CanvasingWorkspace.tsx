"use client";
import { useState } from "react";
import Link from "next/link";
import { useVisitLists, displayCategory, displayAddress } from "@/lib/canvasing";
import VisitEditor from "./VisitEditor";
import styles from "./page.module.css";

export default function CanvasingPage({ workspace = "agen" }: { workspace?: "agen" | "merchant" }) {
  const merchant = workspace === "merchant";
  const searchLink = merchant ? "/merchant" : "/dashboard/search";
  const { lists, error } = useVisitLists();
  const [activeId, setActiveId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const active = lists.find((list) => list.id === activeId) || lists[0];
  const store = active?.stores.find((item) => item.visitId === editing);
  const done = active?.stores.filter((item) => item.status === "visited").length || 0;
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>WORKSPACE / KUNJUNGAN</span><h1>{merchant ? "Kunjungan merchant" : "Daftar canvasing."}</h1><p>Siapkan daftar toko dan catat progres kunjungan Anda.</p></div><Link className="btn btn-primary" href={searchLink}>{merchant ? "Cari merchant" : "Cari toko"}</Link></header>
    <p className={styles.storageNote}>Tersimpan di browser ini untuk akun yang sedang masuk. Belum tersinkron antarperangkat.</p>
    {error && <p role="alert" className={styles.empty}>{error}</p>}
    {!error && !lists.length && <section className={styles.empty}><h2>Belum ada daftar kunjungan</h2><p>Pilih toko dari hasil pencarian, lalu tekan “Simpan pilihan” untuk membuat daftar canvasing pertama.</p><Link className="btn btn-secondary" href={searchLink}>Buka pencarian toko</Link></section>}
    {active && <div className={styles.layout}>
      <aside className={styles.lists} aria-label="Daftar canvasing"><h2>Daftar tersimpan <span>{lists.length}</span></h2>
        {lists.map((list) => <button key={list.id} className={list.id === active.id ? styles.active : ""} aria-pressed={list.id === active.id} onClick={() => { setActiveId(list.id); setEditing(null); }}>
          <strong>{list.name}</strong><span>{list.area}</span><small>{list.stores.length} toko · {list.stores.filter((item) => item.status === "visited").length} dikunjungi</small>
        </button>)}
      </aside>
      <section className={styles.detail}>
        <div className={styles.listHeading}><span className={styles.eyebrow}>{active.source.mode === "road" ? "DARI RUAS JALAN" : active.source.mode === "map" ? "DARI AREA PETA" : "DARI NAMA DAERAH"}</span><h2>{active.name}</h2><p>{active.area} · {done}/{active.stores.length} toko dikunjungi</p><small>Disimpan {new Date(active.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small></div>
        <div style={{padding: "16px 24px"}}><button className="btn btn-secondary" onClick={() => setEditing("new")}>Tambah toko lapangan</button></div><div className={styles.stores}>{active.stores.map((item, index) => <article key={item.visitId} className={styles.store}>
          <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.storeInfo}><h3>{item.name || "Toko belum diberi nama"}</h3><p>{displayAddress(item.address)}</p><small>{displayCategory(item)}</small><div className={styles.badges}><span>{item.status === "visited" ? "Sudah dikunjungi" : "Belum dikunjungi"}</span>{!merchant && <span>{item.classification?.label === "potensial" ? "Potensial" : "Perlu tinjau"}</span>}</div>{item.pic && <p>PIC: {item.pic}{item.phone ? ` · ${item.phone}` : ""}</p>}{item.prospectResult && <p>Hasil: {item.prospectResult}</p>}{item.followUp && <p>Tindak lanjut: {item.followUp}</p>}{item.visitArea && <p>Area: {item.visitArea}</p>}{!!item.visitPhotos?.length && <p>{item.visitPhotos.length} foto kunjungan tersimpan</p>}{item.notes && <p className={styles.note}>{item.notes}</p>}</div>
          <div className={styles.actions}><button className="btn btn-secondary btn-sm" onClick={() => setEditing(editing === item.visitId ? null : item.visitId)}>Catat kunjungan</button>
            {/^https:\/\/(www\.)?google\.com\/maps\//.test(item.url) && <a href={item.url} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>}</div>
        </article>)}</div>
        {(store || editing === "new") && <VisitEditor workspace={workspace} key={editing} store={store || { id: "", visitId: "", name: "", address: "", category: "", lat: 0, lng: 0, rating: 0, reviewCount: 0, photoUrl: null, url: "", status: "planned", notes: "" }} listId={active.id} area={active.area} isNew={editing === "new"} onClose={() => setEditing(null)} />}
      </section>
    </div>}
  </div>;
}






