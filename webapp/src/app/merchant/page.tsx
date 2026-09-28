"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { distance, pathLength, type Point } from '@/lib/road-geometry';
import { displayAddress, displayCategory, saveVisitList, useVisitLists, type Prospect } from '@/lib/canvasing';
import styles from './page.module.css';
interface Merchant extends Prospect { distanceFromRoad: number; distanceFromStart: number }
export default function MerchantPage() {
 const container=useRef<HTMLDivElement>(null), map=useRef<Leaflet.Map|null>(null), library=useRef<typeof Leaflet|null>(null), layers=useRef<Leaflet.LayerGroup|null>(null);
 const drawingRef=useRef(false);
 const locked=useRef(false), requestRef=useRef<AbortController|null>(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [segment,setSegment]=useState<Point[]>([]),[drawing,setDrawing]=useState(false),[width,setWidth]=useState(50);
 const [results,setResults]=useState<Merchant[]>([]),[searched,setSearched]=useState(false),[chosen,setChosen]=useState<string[]>([]),[category,setCategory]=useState(''),[area,setArea]=useState(''),[moving,setMoving]=useState(false);
 const [saveOpen,setSaveOpen]=useState(false),[listName,setListName]=useState(''),[target,setTarget]=useState('');
 const {lists,error:storageError}=useVisitLists();
 const routeName=area.trim() || 'Jalur manual';
 const routeLength=pathLength(segment);
 const validRoute=segment.length>1 && routeLength>=5 && routeLength<=1000;
 function setDrawingMode(value:boolean){drawingRef.current=value;setDrawing(value);}
 const actualLength=Math.round(pathLength(segment));
 const shown=results.filter(r=>!category || displayCategory(r)===category);
 function clearResults(){setResults([]);setChosen([]);setSearched(false);setSaveOpen(false);setNotice('');setCategory('');}
 useEffect(()=>{
  let disposed=false;let observer:ResizeObserver|undefined;
  import('leaflet').then(L=>{
   if(disposed||!container.current)return;
   library.current=L;
   const m=L.map(container.current).setView([-7.773,110.408],16);map.current=m;
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
   layers.current=L.layerGroup().addTo(m);observer=new ResizeObserver(()=>m.invalidateSize());observer.observe(container.current);setReady(true);
   m.doubleClickZoom.disable();
   m.on('click',(event:Leaflet.LeafletMouseEvent)=>{
    if(locked.current||!drawingRef.current)return;
    const p:Point=[event.latlng.lat,event.latlng.lng];
    setSegment(current=>current.length>=100 || (current.length>0 && distance(current[current.length-1],p)<1) ? current : [...current,p]);
    setResults([]);setChosen([]);setSearched(false);setSaveOpen(false);setNotice('');setError('');setCategory('');
   });
  }).catch(()=>{if(!disposed)setError('Peta gagal dimuat. Muat ulang halaman.');});
  return()=>{disposed=true;requestRef.current?.abort();observer?.disconnect();map.current?.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  const L=library.current,group=layers.current;if(!ready||!L||!group)return;
  group.clearLayers();
  if(segment.length>1)L.polyline(segment,{color:routeLength>1000?'#b42318':'#bc572a',weight:6,interactive:false}).addTo(group);
  segment.forEach((point,index)=>{
   const label=index===0?'Awal':index===segment.length-1?'Akhir':String(index+1);
   const marker=L.marker(point,{draggable:drawing&&!busy,bubblingMouseEvents:false,
    icon:L.divIcon({className:styles.vertex,html:`<span>${label}</span>`,iconSize:[42,28],iconAnchor:[21,14]})}).addTo(group);
   marker.on('dragend',()=>{
    if(locked.current)return;
    const p=marker.getLatLng();setSegment(current=>current.map((value,i)=>i===index?[p.lat,p.lng]:value));
    setResults([]);setChosen([]);setSearched(false);setSaveOpen(false);setNotice('');setError('');setCategory('');
   });
  });
  for(const r of results.filter(item=>!category||displayCategory(item)===category)){
   const label=document.createElement('span');label.textContent=r.name;
   L.circleMarker([r.lat,r.lng],{radius:7,color:'#12656b',fillColor:'#fff',fillOpacity:1,bubblingMouseEvents:false}).bindTooltip(label).addTo(group).on('click',()=>map.current?.setView([r.lat,r.lng],18));
  }
 },[ready,segment,results,category,drawing,busy,routeLength]);
 async function search(){
  if(!validRoute||locked.current)return;
  setDrawingMode(false);
  locked.current=true;setBusy(true);setError('');clearResults();
  const controller=new AbortController();requestRef.current=controller;
  try{const response=await fetch('/api/v1/merchant/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:segment,width,roadName:'Jalur manual'}),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error);setResults(data.results);setSearched(true);setNotice(data.warning || `Pencarian selesai di ${data.coverage?.length || 1} titik sepanjang jalur. Hasil mengikuti usaha yang tersedia di Google Maps.`);}
  catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Pencarian gagal.');}
  finally{locked.current=false;setBusy(false);}
 }
 return <div className={styles.page}><header><h1>Cari merchant</h1><p>Gambar jalur dari titik awal sampai titik akhir, lalu cari merchant di sepanjang garis.</p></header>
 <form className={styles.areaSearch} onSubmit={async e=>{e.preventDefault();if(!area.trim()||busy)return;setMoving(true);setError('');try{const response=await fetch(`/api/v1/merchant/area?area=${encodeURIComponent(area)}`);const data=await response.json();if(!response.ok)throw Error(data.error);map.current?.setView([data.lat,data.lng],16);}catch(err){setError(err instanceof Error?err.message:'Daerah tidak ditemukan.');}finally{setMoving(false);}}}><label htmlFor="merchant-area">Pindah ke daerah</label><input id="merchant-area" placeholder="Contoh: Seturan, Yogyakarta" value={area} onChange={e=>setArea(e.target.value)}/><button className="btn btn-secondary" disabled={!ready||busy||moving||!area.trim()}>{moving?'Mencari…':'Tampilkan peta'}</button></form>
 {error&&<p role="alert" className={styles.message}>{error}</p>}{notice&&<p role="status" className={styles.message}>{notice}</p>}
 <div className={styles.layout}><section className={styles.mapPanel}><div ref={container} className={styles.map}/><div className={styles.mapCaption}><span>● Titik awal</span><span>Garis oranye: ruas pencarian</span><span>○ Merchant</span></div><p>Klik “Gambar jalur”, lalu klik titik awal, belokan, dan titik akhir. Geser titik untuk memperbaiki garis, lalu tekan tombol oranye “Selesai & cari merchant”. Garis tidak otomatis mengikuti jalan.</p></section>
 <section className={styles.controls} aria-label="Pengaturan ruas jalan"><h2>Ruas pencarian</h2>{busy&&<p role="status">Menelusuri beberapa titik sepanjang jalur. Proses dapat memerlukan beberapa menit…</p>}
 <p>{drawing?'Mode gambar aktif: klik peta untuk menambahkan titik. Tarik titik yang sudah ada untuk mengubah posisi.':'Peta bisa digeser seperti biasa. Aktifkan gambar untuk menentukan jalur.'}</p>
 <div className={styles.drawActions}>
  <button className="btn btn-secondary" disabled={!ready||busy||moving||(drawing&&!validRoute)} onClick={()=>{setDrawingMode(!drawing);if(!drawing)clearResults();}}>{drawing?'Selesai menggambar':segment.length?'Edit jalur':'Gambar jalur'}</button>
  <button className="btn btn-secondary" disabled={busy||!segment.length} onClick={()=>{setSegment(current=>current.slice(0,-1));setDrawingMode(true);clearResults();}}>Urungkan titik</button>
  <button className="btn btn-secondary" disabled={busy||!segment.length} onClick={()=>{setSegment([]);setDrawingMode(true);clearResults();setError('');}}>Gambar ulang</button>
 </div>
 <label>Jarak pencarian dari garis<select disabled={busy} value={width} onChange={e=>{setWidth(Number(e.target.value));clearResults();}}>{[25,50,100].map(n=><option key={n} value={n}>{n} meter ke tiap sisi</option>)}</select></label>
 <p><strong>{actualLength} m</strong> panjang jalur · {segment.length} titik · maksimal 1.000 m.</p>
 {routeLength>1000&&<p role="alert">Jalur melebihi 1 km. Geser titik atau urungkan titik terakhir untuk memperpendeknya.</p>}
 {segment.length>=100&&<p role="status">Maksimal 100 titik. Geser titik yang ada untuk menyesuaikan jalur.</p>}
 {segment.length>1&&routeLength<5&&<p>Jalur terlalu pendek. Buat garis minimal 5 meter.</p>}
 <button className="btn btn-secondary" disabled={busy||segment.length<2} onClick={()=>map.current?.fitBounds(segment,{padding:[35,35],maxZoom:18})}>Lihat seluruh jalur</button>
 {drawing&&validRoute&&!busy&&<p role="status">Jalur siap dicari. Tekan tombol oranye di bawah untuk menyelesaikan gambar dan mencari merchant.</p>}
 <button className="btn btn-primary" disabled={busy||!validRoute} onClick={search}>{busy?'Mencari merchant…':drawing?'Selesai & cari merchant':'Cari merchant di jalur ini'}</button>
 <small>Pencarian dilakukan dari awal sampai akhir jalur, dengan jarak antartitik maksimal 250 m. Tidak semua usaha tercatat atau muncul di Google Maps. Jarak ke ruas dihitung dari koordinat usaha, bukan akses pintu masuk. Merchant tidak dinilai oleh model.</small>
 </section></div>
 {searched&&<section className={styles.results}><div className={styles.resultHeader}><h2>{results.length} merchant ditemukan</h2><label>Kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Semua kategori</option>{Array.from(new Set(results.map(displayCategory))).map(c=><option key={c}>{c}</option>)}</select></label><button className="btn btn-secondary" disabled={!shown.length} onClick={()=>setChosen(Array.from(new Set([...chosen,...shown.map(r=>r.id)])))}>Pilih yang tampil</button><button className="btn btn-primary" disabled={!chosen.length} onClick={()=>{setSaveOpen(true);setListName(`Merchant ${routeName}`);setTarget('');}}>Simpan {chosen.length} pilihan</button></div>
 {!results.length&&<p>Tidak ditemukan usaha berkoordinat dalam batas ini. Edit jalur atau ubah jarak pencarian dari garis.</p>}
 {saveOpen&&<form className={styles.save} onSubmit={e=>{e.preventDefault();try{const saved=saveVisitList({listId:target||undefined,name:listName,area:routeName,source:{mode:'road',selection:'manual',road:routeName,bounds:JSON.stringify(segment),lengthMeters:actualLength,corridorMeters:width},stores:results.filter(r=>chosen.includes(r.id))});setNotice(`${saved.added} merchant disimpan. ${saved.skipped} duplikat dilewati.`);setSaveOpen(false);setChosen([]);}catch(err){setError(err instanceof Error?err.message:'Gagal menyimpan.');}}}><label>Daftar tujuan<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Daftar baru</option>{lists.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>{!target&&<label>Nama daftar<input required maxLength={100} value={listName} onChange={e=>setListName(e.target.value)}/></label>}<button className="btn btn-primary" disabled={!!storageError||!chosen.length}>Simpan daftar merchant</button><button type="button" className="btn btn-secondary" onClick={()=>setSaveOpen(false)}>Batal</button>{storageError&&<p role="alert">{storageError}</p>}</form>}
 <div className={styles.cards}>{shown.map(r=><article key={r.id}><label><input type="checkbox" checked={chosen.includes(r.id)} onChange={e=>setChosen(current=>e.target.checked?[...current,r.id]:current.filter(id=>id!==r.id))}/><strong>{r.name}</strong></label><p>{displayAddress(r.address)}</p><small>{displayCategory(r)} · {r.distanceFromStart} m dari awal · {r.distanceFromRoad} m dari ruas</small><a className="btn btn-secondary btn-sm" href={/^https:\/\/(www\.)?google\.com\/maps\//i.test(r.url || '') ? r.url : `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer">Lihat di Google Maps</a></article>)}</div>
 </section>}
 <Link href="/merchant/canvasing" className="btn btn-secondary">Buka kunjungan merchant</Link><small>Daftar merchant tersimpan terpisah di browser ini untuk akun merchant.</small>
 </div>;
}



