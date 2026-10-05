"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useVisitLists, deleteVisit, displayCategory, displayAddress } from "@/lib/canvasing";
import { isGoogleMapsLink } from "@/lib/visit-template";
import type { Visit, VisitList } from "@/lib/canvasing";
import VisitEditor from "./VisitEditor";
import DeleteVisitDialog from "./DeleteVisitDialog";
import styles from "./page.module.css";

const VisitedStoresMap = dynamic(() => import('./VisitedStoresMap'), {
  ssr: false, loading: () => <p role="status">Menyiapkan peta kunjungan…</p>,
});

export default function CanvasingPage({ workspace = "agen" }: { workspace?: "agen" | "merchant" }) {
  const merchant = workspace === "merchant";
  const searchLink = merchant ? "/merchant" : "/dashboard/search";
  const { lists, error } = useVisitLists();
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<'list' | 'map'>('list');
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ listId: string; listName: string; visitId: string; storeName: string } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const addStoreButton = useRef<HTMLButtonElement>(null);
  async function exportExcel(selected: VisitList[]) {
    setExporting(true); setActionError('');
    try { await (await import('@/lib/visit-excel')).downloadVisitExcel(selected, workspace); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Ekspor Excel gagal. Coba lagi.'); }
    finally { setExporting(false); }
  }
  const active = lists.find((list) => list.id === activeId) || lists[0];
  const store = active?.stores.find((item) => item.visitId === editing);
  const done = active?.stores.filter((item) => item.status === "visited").length || 0;
  function removeStore(item: Visit) {
    if (!active || exporting) return;
    setDeleteError('');
    setPendingDelete({ listId: active.id, listName: active.name, visitId: item.visitId, storeName: item.name || 'Toko belum diberi nama' });
  }
  function confirmDelete() {
    if (!pendingDelete || exporting) return;
    setActionError(''); setNotice('');
    setDeleteError('');
    try {
      deleteVisit(pendingDelete.listId, pendingDelete.visitId);
      if (editing === pendingDelete.visitId) setEditing(null);
      setNotice(`${pendingDelete.storeName} dihapus dari daftar “${pendingDelete.listName}”.`);
      setPendingDelete(null);
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Toko gagal dihapus. Coba lagi.'); }
  }
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.eyebrow}>WORKSPACE / KUNJUNGAN</span><h1>{merchant ? "Kunjungan merchant" : "Daftar canvasing."}</h1><p>Siapkan daftar toko dan catat progres kunjungan Anda.</p></div><Link className="btn btn-primary" href={searchLink}>{merchant ? "Cari merchant" : "Cari toko"}</Link></header>
    <p className={styles.storageNote}>Tersimpan di browser ini untuk akun yang sedang masuk. Belum tersinkron antarperangkat.</p>
    {actionError && <p role="alert" className={styles.exportError}>{actionError}</p>}
    {notice && <p role="status" className={styles.actionNotice}>{notice}</p>}
    {error && <p role="alert" className={styles.empty}>{error}</p>}
    {!error && <div className={styles.viewSwitch} role="group" aria-label="Tampilan kunjungan">
      <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Daftar toko</button>
      <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>Peta kunjungan</button>
    </div>}
    {!error && view === 'map' && <VisitedStoresMap lists={lists} workspace={workspace} onEdit={(listId, visitId) => { setActiveId(listId); setEditing(visitId); }} />}
    {!error && view === 'list' && !lists.length && <section className={styles.empty}><h2>Belum ada daftar kunjungan</h2><p>Pilih toko dari hasil pencarian, lalu tekan “Simpan pilihan” untuk membuat daftar canvasing pertama.</p><Link className="btn btn-secondary" href={searchLink}>Buka pencarian toko</Link></section>}
    {active && view === 'list' && <div className={styles.layout}>
      <aside className={styles.lists} aria-label="Daftar canvasing"><h2>Daftar tersimpan <span>{lists.length}</span></h2>
        {lists.map((list) => <button key={list.id} className={list.id === active.id ? styles.active : ""} aria-pressed={list.id === active.id} onClick={() => { setActiveId(list.id); setEditing(null); setActionError(''); setNotice(''); }}>
          <strong>{list.name}</strong><span>{list.area}</span><small>{list.stores.length} toko · {list.stores.filter((item) => item.status === "visited").length} dikunjungi</small>
        </button>)}
      </aside>
      <section className={styles.detail}>
        <div className={styles.listHeading}><span className={styles.eyebrow}>{active.source.mode === "road" ? "DARI RUAS JALAN" : active.source.mode === "map" ? "DARI AREA PETA" : "DARI NAMA DAERAH"}</span><h2>{active.name}</h2><p>{active.area} · {done}/{active.stores.length} toko dikunjungi</p><small>Disimpan {new Date(active.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</small></div>
        <div className={styles.listTools}>
          <button ref={addStoreButton} className="btn btn-secondary" onClick={() => setEditing("new")}>Tambah toko lapangan</button>
          <button className="btn btn-secondary" disabled={exporting || !!error || !active.stores.length} onClick={() => exportExcel([active])}>{exporting ? 'Menyiapkan Excel...' : 'Ekspor daftar ini'}</button>
          {lists.length > 1 && <button className="btn btn-secondary" disabled={exporting || !!error} onClick={() => exportExcel(lists)}>Ekspor semua daftar</button>}
        </div>
        {!active.stores.length && <div className={styles.emptyList}><h3>Daftar ini belum memiliki toko</h3><p>Tambah toko lapangan atau pilih toko dari pencarian.</p><Link className="btn btn-secondary btn-sm" href={searchLink}>{merchant ? 'Cari merchant' : 'Cari toko'}</Link></div>}
        <div className={styles.stores}>{active.stores.map((item, index) => <article key={item.visitId} className={styles.store}>
          <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.storeInfo}><h3>{item.name || "Toko belum diberi nama"}</h3><p>{displayAddress(item.address)}</p><small>{displayCategory(item)}</small><div className={styles.badges}><span>{item.status === "visited" ? "Sudah dikunjungi" : "Belum dikunjungi"}</span>{!merchant && <span>{item.classification?.label === "potensial" ? "Potensial" : "Perlu tinjau"}</span>}</div>{item.pic && <p>PIC: {item.pic}{item.phone ? ` · ${item.phone}` : ""}</p>}{item.prospectResult && <p>Hasil: {item.prospectResult}</p>}{item.followUp && <p>Tindak lanjut: {item.followUp}</p>}{item.visitArea && <p>Area: {item.visitArea}</p>}{!!item.visitPhotos?.length && <p>{item.visitPhotos.length} foto kunjungan tersimpan</p>}{item.notes && <p className={styles.note}>{item.notes}</p>}</div>
          <div className={styles.actions}><button className="btn btn-secondary btn-sm" onClick={() => setEditing(editing === item.visitId ? null : item.visitId)}>Catat kunjungan</button>
            <button type="button" className={`btn btn-secondary btn-sm ${styles.deleteButton}`} aria-label={`Hapus toko ${item.name || 'Toko belum diberi nama'}`} disabled={exporting || !!error} onClick={() => removeStore(item)}>Hapus toko</button>
            {isGoogleMapsLink(item.url) && <a href={item.url} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>}</div>
        </article>)}</div>
      </section>
    </div>}
    {active && (store || editing === "new") && <VisitEditor workspace={workspace} key={editing} store={store || { id: "", visitId: "", name: "", address: "", category: "", lat: 0, lng: 0, rating: 0, reviewCount: 0, photoUrl: null, url: "", status: "planned", notes: "" }} listId={active.id} area={active.area} isNew={editing === "new"} onClose={() => setEditing(null)} />}
    {pendingDelete && <DeleteVisitDialog storeName={pendingDelete.storeName} listName={pendingDelete.listName} error={deleteError}
      onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} fallbackFocus={addStoreButton} />}
  </div>;
}






