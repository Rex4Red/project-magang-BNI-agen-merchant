'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { displayAddress, displayCategory, type Visit, type VisitList } from '@/lib/canvasing';
import { isGoogleMapsLink, visitInstitutions, visitProduct } from '@/lib/visit-template';
import { PhotoPreview } from './VisitEditor';
import { FOLLOW_UP_STATUSES, followUpStatus } from '@/lib/visit-reports';
import styles from './VisitedStoresMap.module.css';

interface MapVisit { key: string; listId: string; listName: string; area: string; store: Visit }
const hasCoordinates = ({ store }: MapVisit) => Number.isFinite(store.lat) && Number.isFinite(store.lng)
  && Math.abs(store.lat) <= 90 && Math.abs(store.lng) <= 180 && (store.lat !== 0 || store.lng !== 0);
const storeName = (entry: MapVisit) => entry.store.name || 'Toko belum diberi nama';
const providerStatus = (status: Visit['qrisStatus'], providers: (string | undefined)[]) => status === 'yes'
  ? ['Sudah', providers.filter(value => value?.trim()).join(', ')].filter(Boolean).join(' · ')
  : status === 'no' ? 'Belum' : 'Belum diketahui';

function MapCanvas({ entries, selectedKey, onSelect, reportMode }: {
  entries: MapVisit[]; selectedKey: string; onSelect: (key: string) => void; reportMode: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const group = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const markers = useRef(new Map<string, Leaflet.Marker>());
  const boundsKey = useRef('');
  const select = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [tileError, setTileError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    const markerMap = markers.current;
    import('leaflet').then(L => {
      if (disposed || !container.current) return;
      library.current = L;
      const instance = L.map(container.current, { scrollWheelZoom: false }).setView([-7.773, 110.408], 13);
      map.current = instance;
      tiles.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).on('tileerror', () => { if (!disposed) setTileError(true); }).addTo(instance);
      group.current = L.layerGroup().addTo(instance);
      observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(container.current);
      setReady(true);
    }).catch(() => { if (!disposed) setError('Peta gagal dimuat. Coba muat kembali.'); });
    return () => {
      disposed = true; observer?.disconnect(); map.current?.remove();
      map.current = null; group.current = null; tiles.current = null; boundsKey.current = '';
      markerMap.clear();
    };
  }, [attempt]);

  useEffect(() => {
    const L = library.current, instance = map.current, layers = group.current;
    if (!ready || !L || !instance || !layers) return;
    layers.clearLayers(); markers.current.clear();
    for (const [index, entry] of entries.entries()) {
      const followUp = FOLLOW_UP_STATUSES.find(status => status.key === followUpStatus(entry.store))!;
      const popup = document.createElement('div'); popup.className = styles.popup;
      const title = document.createElement('strong'); title.textContent = storeName(entry); popup.append(title);
      const status = document.createElement('span'); status.textContent = reportMode ? `Sudah dikunjungi · ${followUp.label}` : 'Sudah dikunjungi'; popup.append(status);
      const address = document.createElement('p'); address.textContent = displayAddress(entry.store.address) || 'Alamat belum diisi'; popup.append(address);
      for (const [label, value] of [['Hasil prospek', entry.store.prospectResult]]) {
        if (!value) continue;
        const row = document.createElement('p'); row.textContent = `${label}: ${value}`; popup.append(row);
      }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Lihat detail';
      button.addEventListener('click', () => {
        select.current(entry.key);
        document.getElementById('visit-map-details')?.focus({ preventScroll: true });
        document.getElementById('visit-map-details')?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
      popup.append(button);
      const marker = L.marker([entry.store.lat, entry.store.lng], {
        title: storeName(entry), alt: `Toko sudah dikunjungi: ${storeName(entry)}`,
        icon: L.divIcon({ className: styles.marker, html: `<span${reportMode ? ` style="--visit-status-color:${followUp.color}"` : ''}>${index + 1}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
      }).bindPopup(popup, { maxWidth: 260, maxHeight: 240, autoPanPadding: [16, 16] }).addTo(layers);
      marker.on('click', () => select.current(entry.key));
      markers.current.set(entry.key, marker);
    }
    const signature = JSON.stringify(entries.map(entry => [entry.key, entry.store.lat, entry.store.lng]));
    if (signature !== boundsKey.current) {
      instance.fitBounds(L.latLngBounds(entries.map(entry => [entry.store.lat, entry.store.lng])), { padding: [36, 36], maxZoom: 16, animate: false });
      boundsKey.current = signature;
    }
  }, [entries, ready, reportMode]);

  useEffect(() => {
    for (const [key, marker] of markers.current) {
      marker.getElement()?.classList.toggle(styles.selectedMarker, key === selectedKey);
      marker.setZIndexOffset(key === selectedKey ? 1000 : 0);
    }
    const marker = markers.current.get(selectedKey);
    if (marker) { map.current?.panTo(marker.getLatLng(), { animate: false }); marker.openPopup(); }
    else map.current?.closePopup();
  }, [selectedKey, entries, ready]);

  return <div className={styles.canvasWrap}>
    <div className={styles.mapToolbar}><button type="button" className={styles.fitButton} disabled={!ready} onClick={() => {
      const L = library.current;
      map.current?.closePopup();
      if (L) map.current?.fitBounds(L.latLngBounds(entries.map(entry => [entry.store.lat, entry.store.lng])), { padding: [36, 36], maxZoom: 16, animate: false });
    }}>Lihat semua titik</button></div>
    <div ref={container} className={styles.canvas} role="region" aria-label="Peta toko yang sudah dikunjungi" />
    {!ready && !error && <p role="status" className={styles.mapMessage}>Memuat peta…</p>}
    {error && <div role="alert" className={styles.mapMessage}><p>{error}</p><button type="button" className="btn btn-secondary" onClick={() => { setError(''); setReady(false); setAttempt(value => value + 1); }}>Muat ulang peta</button></div>}
    {tileError && <div role="status" className={styles.tileMessage}>Sebagian peta gagal dimuat. Titik dan catatan tetap tersedia.<button type="button" onClick={() => { setTileError(false); tiles.current?.redraw(); }}>Coba lagi</button></div>}
  </div>;
}

export default function VisitedStoresMap({ lists, workspace, onEdit, reportMode = false, showListFilter = true }: {
  lists: VisitList[]; workspace: 'agen' | 'merchant'; onEdit: (listId: string, visitId: string) => void;
  reportMode?: boolean; showListFilter?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [preview, setPreview] = useState<{ src: string; number: number } | null>(null);
  const validFilter = showListFilter && lists.some(list => list.id === filter) ? filter : '';
  const entries = useMemo(() => lists.filter(list => !validFilter || list.id === validFilter).flatMap(list =>
    list.stores.filter(store => store.status === 'visited').map(store => ({
      key: JSON.stringify([list.id, store.visitId]), listId: list.id, listName: list.name, area: store.visitArea || list.area, store,
    }))), [lists, validFilter]);
  const mapped = useMemo(() => entries.filter(hasCoordinates), [entries]);
  const selected = entries.find(entry => entry.key === selectedKey);
  const missing = entries.length - mapped.length;
  const details = selected ? [
    ['Nama PIC', selected.store.pic], ['No telp', selected.store.phone], ['Area kunjungan', selected.area],
    ['Produk', visitProduct(selected.store)], ['LJK', visitInstitutions(selected.store)],
    ['Agen', workspace === 'agen' ? providerStatus(selected.store.agentStatus, [selected.store.agentProvider]) : undefined],
    ['QRIS', providerStatus(selected.store.qrisStatus, selected.store.qrisProviders?.length ? selected.store.qrisProviders : [selected.store.qrisProvider])],
    ['EDC', providerStatus(selected.store.edcStatus, selected.store.edcProviders || [])],
    ['Potensi', selected.store.potential], ['Hasil prospek', selected.store.prospectResult],
    ['Status tindak lanjut', reportMode ? FOLLOW_UP_STATUSES.find(status => status.key === followUpStatus(selected.store))?.label : undefined],
    ['Follow up', selected.store.followUpNotes], ['Tindak lanjut', selected.store.followUp], ['Catatan', selected.store.notes],
  ].filter(([, value]) => value?.trim()) : [];

  return <section className={styles.section} aria-labelledby="visited-map-heading">
    <header className={styles.header}>
      <div><h2 id="visited-map-heading">Peta kunjungan</h2><p aria-live="polite">{entries.length} toko sudah dikunjungi · {mapped.length} titik di peta</p></div>
      {showListFilter && <label>Daftar kunjungan<select value={validFilter} onChange={event => { setFilter(event.target.value); setSelectedKey(''); }}><option value="">Semua daftar</option>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>}
    </header>
    {!!missing && <p className={styles.locationNote}>{missing} toko belum memiliki koordinat yang valid. Buka catatannya untuk mengambil lokasi.</p>}
    <div className={styles.layout}>
      {mapped.length ? <MapCanvas entries={mapped} selectedKey={selectedKey} onSelect={setSelectedKey} reportMode={reportMode} />
        : <div className={styles.empty}><h3>{entries.length ? 'Lokasi toko belum tersedia' : 'Belum ada toko yang sudah dikunjungi'}</h3><p>{entries.length ? 'Ambil lokasi toko dari formulir Catat kunjungan agar titiknya tampil di peta.' : 'Simpan catatan dengan status “Sudah dikunjungi” untuk menampilkan toko di peta.'}</p></div>}
      <aside className={styles.side} aria-label="Informasi kunjungan">
        <div id="visit-map-details" className={styles.details} tabIndex={-1} aria-live="polite">
          {selected ? <>
            <span className={styles.status}>Sudah dikunjungi</span><h3>{storeName(selected)}</h3>
            <p>{displayCategory(selected.store)}</p><p>{displayAddress(selected.store.address) || 'Alamat belum diisi'}</p>
            <p className={styles.listName}>Daftar: {selected.listName}</p>
            {!hasCoordinates(selected) && <p className={styles.locationNote}>Koordinat toko belum tersedia.</p>}
            <dl>{details.map(([label, value]) => <div key={label} className={['LJK', 'Follow up', 'Tindak lanjut', 'Catatan'].includes(label || '') ? styles.wideField : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            {!!selected.store.visitPhotos?.length && <div className={styles.photos}>{selected.store.visitPhotos.map((photo, index) => <button key={index} type="button" aria-label={`Buka foto kunjungan ${index + 1}`} onClick={() => setPreview({ src: photo, number: index + 1 })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Foto kunjungan ${index + 1}`} loading="lazy" />
            </button>)}</div>}
            <div className={styles.detailActions}><button type="button" className="btn btn-secondary" onClick={() => onEdit(selected.listId, selected.store.visitId)}>Catat kunjungan</button>
              {isGoogleMapsLink(selected.store.url) && <a className="btn btn-secondary" href={selected.store.url} target="_blank" rel="noopener noreferrer">Google Maps</a>}
            </div>
          </> : <><h3>Informasi toko</h3><p>Pilih titik di peta atau nama toko di bawah.</p></>}
        </div>
        {!!entries.length && <div className={styles.storeList} aria-label="Toko yang sudah dikunjungi">{entries.map(entry => {
          const index = mapped.findIndex(item => item.key === entry.key);
          return <button key={entry.key} type="button" aria-pressed={entry.key === selected?.key} onClick={() => setSelectedKey(entry.key)}>
            <span className={styles.listNumber}>{index >= 0 ? index + 1 : '–'}</span><span><strong>{storeName(entry)}</strong><small>{entry.listName}{index < 0 ? ' · Tanpa koordinat' : ''}</small></span>
          </button>;
        })}</div>}
      </aside>
    </div>
    {preview && <PhotoPreview photo={preview} onClose={() => setPreview(null)} />}
  </section>;
}
