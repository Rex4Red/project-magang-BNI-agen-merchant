"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import styles from "./page.module.css";
import { Icon } from "@/components/Icon";

import Link from "next/link";
import { polygonError } from "@/lib/search-polygon";
import { saveVisitList, useVisitLists, displayCategory, displayAddress, type Prospect as SearchResult } from "@/lib/canvasing";

import { useAgentSearchSession, useAgentSearchField } from "@/lib/agent-search-session";

const isPotensial = (store: SearchResult): boolean =>
  store.classification?.label === "potensial";

const hasCoordinates = (store: SearchResult): boolean =>
  Number.isFinite(store.lat) && Number.isFinite(store.lng) &&
  Math.abs(store.lat) <= 90 && Math.abs(store.lng) <= 180 &&
  (store.lat !== 0 || store.lng !== 0);

const classificationText = (store: SearchResult): string => {
  if (store.classification?.source === "business_type") {
    const label = store.classification.label === "potensial" ? "Potensial" : "Non-Potensial";
    return `${label} (jenis usaha: ${store.classification.businessReason})`;
  }
  if (store.classification?.label === "potensial") return "Potensial (AI)";
  if (store.classification?.label === "non_potensial") return "Non-Potensial (AI)";
  if (store.classification?.reason === "low_confidence") return "Perlu ditinjau: model belum yakin";
  if (store.classification?.reason === "business_unknown") return "Perlu verifikasi jenis usaha";
  if (!store.photoUrl || store.classification?.reason === "no_photo") return "Tanpa foto";
  if (store.classification?.reason === "image_error") return "Foto gagal dibaca";
  if (store.classification?.reason === "request_failed") return "Klasifikasi gagal";
  return "Menunggu klasifikasi";
};

const classificationSummary = (store: SearchResult): string => {
  if (store.classification?.source === "business_type") {
    return store.classification.label === "potensial"
      ? `Sesuai: ${store.classification.businessReason}`
      : `Di luar target: ${store.classification.businessReason}`;
  }
  return classificationText(store);
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);

function StoreThumbnail({ name, url, className }: { name: string; url: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={className}>
    {url && !failed
      ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <span className={styles.photoPlaceholder} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>}
  </div>;
}

type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletLibrary = typeof import("leaflet");

let L: LeafletLibrary | null = null;

export default function SearchPage() {
  const { startSearch } = useAgentSearchSession();
  const [query, setQuery] = useAgentSearchField('query');
  const { lists: visitLists, error: storageError } = useVisitLists();
  const [chosen, setChosen] = useAgentSearchField('chosen');
  const [saveOpen, setSaveOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [visitArea, setVisitArea] = useState("");
  const [targetList, setTargetList] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [searchContext] = useAgentSearchField('searchContext');
  const [searchMode, setSearchMode] = useAgentSearchField('searchMode');
  const [polygon, setPolygon] = useAgentSearchField('polygon');
  const [drawing, setDrawing] = useAgentSearchField('drawing');
  const areaError = polygonError(polygon);
  const [results] = useAgentSearchField('results');
  const [isSearching] = useAgentSearchField('isSearching');
  const [isClassifying] = useAgentSearchField('isClassifying');
  const [hasSearched] = useAgentSearchField('hasSearched');
  const [error, setError] = useAgentSearchField('error');
  const [classificationError] = useAgentSearchField('classificationError');
  const [coverageNotice] = useAgentSearchField('coverageNotice');
  const [searchProgress] = useAgentSearchField('searchProgress');
  const [filterPotensial, setFilterPotensial] = useAgentSearchField('filterPotensial');
  const [selectedStore, setSelectedStore] = useAgentSearchField('selectedStore');
  const [mapView, setMapView] = useAgentSearchField('mapView');
  const initialMapView = useRef(mapView);
  const [focusRequest, setFocusRequest] = useState(0);
  const fitNextResults = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const selectStore = useCallback((store: SearchResult) => {
    setSelectedStore(store);
    setFocusRequest((request) => request + 1);
  }, [setSelectedStore]);

  const selectedLat = selectedStore?.lat;
  const selectedLng = selectedStore?.lng;
  useLayoutEffect(() => {
    const map = leafletMap.current;
    if (!map || selectedLat == null || selectedLng == null ||
      !Number.isFinite(selectedLat) || !Number.isFinite(selectedLng) ||
      Math.abs(selectedLat) > 90 || Math.abs(selectedLng) > 180 ||
      (selectedLat === 0 && selectedLng === 0)) return;
    // The detail panel changes the map's height. Measure after React commits,
    // then apply center and zoom together, without competing pan animations.
    map.stop();
    map.invalidateSize({ pan: false });
    map.setView([selectedLat, selectedLng], 17, { animate: false });
  }, [selectedLat, selectedLng, focusRequest, mapReady]);

  // Load Leaflet
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load Leaflet CSS
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    if (!document.getElementById("leaflet-js")) {
      const script = document.createElement("script");
      script.id = "leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = () => {
        L = (window as typeof window & { L?: LeafletLibrary }).L || null;
        setMapReady(true);
      };
      document.head.appendChild(script);
    } else {
      const existingScript = document.getElementById("leaflet-js");
      const onLoad = () => {
        L = (window as typeof window & { L?: LeafletLibrary }).L || null;
        setMapReady(Boolean(L));
      };
      if ((window as typeof window & { L?: LeafletLibrary }).L) {
        queueMicrotask(onLoad);
      } else {
        existingScript?.addEventListener("load", onLoad, { once: true });
      }
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapReady || !mapRef.current || leafletMap.current || !L) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
    }).setView(initialMapView.current ? [initialMapView.current.lat, initialMapView.current.lng] : [-7.7713, 110.3771], initialMapView.current?.zoom ?? 13);

    // OpenStreetMap tile layer
    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }
    ).addTo(map);

    leafletMap.current = map;
    const rememberView = () => {
      const center = map.getCenter();
      setMapView({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };
    map.on('moveend', rememberView);
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off('moveend', rememberView);
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, [mapReady, setMapView]);

  useEffect(() => {
    const map = leafletMap.current;
    if (!mapReady || !map || !mapView) return;
    const center = map.getCenter();
    if (Math.abs(center.lat - mapView.lat) > 1e-7 || Math.abs(center.lng - mapView.lng) > 1e-7 || map.getZoom() !== mapView.zoom) {
      map.setView([mapView.lat, mapView.lng], mapView.zoom, { animate: false });
    }
  }, [mapReady, mapView]);

  // Update markers when results change
  const updateMarkers = useCallback(
    (stores: SearchResult[]) => {
      const leaflet = L || (window as typeof window & { L?: LeafletLibrary }).L || null;
      if (leaflet) L = leaflet;
      const map = leafletMap.current;
      if (!leaflet || !map) return;

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (stores.length === 0) return;

      const bounds = leaflet.latLngBounds([]);

      const visibleStores = filterPotensial ? stores.filter(isPotensial) : stores;
      const potentialBounds = leaflet.latLngBounds([]);
      visibleStores.forEach((store) => {
        if (!hasCoordinates(store)) return;

        const potensial = isPotensial(store);
        const iconColor = store.classification?.label === "unavailable" || !store.classification
          ? "#958b7d" : potensial ? "#bc572a" : "#bbb2a5";
        const iconSymbol = !store.classification || store.classification.label === "unavailable"
          ? "?" : potensial ? "P" : "–";

        const icon = leaflet.divIcon({
          className: styles.customMarker,
          html: `<div style="
            background: ${iconColor};
            width: ${potensial ? 32 : 24}px;
            height: ${potensial ? 32 : 24}px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 1px 5px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: ${potensial ? 13 : 11}px;
          ">${iconSymbol}</div>`,
          iconSize: potensial ? [32, 32] : [24, 24],
          iconAnchor: potensial ? [16, 16] : [12, 12],
        });

        const marker = leaflet.marker([store.lat, store.lng], { icon, title: store.name })
          .addTo(map)
          .bindTooltip(escapeHtml(store.name), { direction: "top", offset: [0, -12] });

        marker.on("click", () => {
          selectStore(store);
        });

        markersRef.current.push(marker);
        bounds.extend([store.lat, store.lng]);
        if (potensial) potentialBounds.extend([store.lat, store.lng]);
      });

      const focusBounds = potentialBounds.isValid() ? potentialBounds : bounds;
      if (fitNextResults.current && focusBounds.isValid()) {
        fitNextResults.current = false;
        map.fitBounds(focusBounds, { padding: [40, 40], maxZoom: 15 });
      }
    },
    [filterPotensial, selectStore]
  );

  useEffect(() => {
    if (mapReady) updateMarkers(results);
  }, [mapReady, results, updateMarkers]);

  useEffect(() => {
    const map = leafletMap.current;
    if (!mapReady || !map || !L || searchMode !== "map") return;
    const group = L.layerGroup().addTo(map);
    const locked = isSearching || isClassifying;
    if (polygon.length >= 3) L.polygon(polygon, { color: areaError ? '#b42318' : '#bc572a', fillOpacity: .15, interactive: false }).addTo(group);
    else if (polygon.length > 1) L.polyline(polygon, { color: '#bc572a', interactive: false }).addTo(group);
    polygon.forEach((point, index) => {
      const marker = L!.marker(point, { draggable: drawing && !locked, icon: L!.divIcon({ className: styles.areaVertex, html: `<span>${index + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(group);
      marker.on('dragend', () => { const position = marker.getLatLng(); setPolygon(current => current.map((p, i) => i === index ? [position.lat, position.lng] : p)); });
    });
    const click = (event: import('leaflet').LeafletMouseEvent) => {
      if (!drawing || locked) return;
      setPolygon(current => current.length >= 100 ? current : [...current, [event.latlng.lat, event.latlng.lng]]);
    };
    map.on('click', click);
    if (drawing) map.doubleClickZoom.disable();
    return () => { map.off('click', click); group.remove(); map.doubleClickZoom.enable(); };
  }, [mapReady, searchMode, drawing, polygon, areaError, isSearching, isClassifying, setPolygon]);

  const showAllPotentialStores = () => {
    const map = leafletMap.current;
    const leaflet = L || (window as typeof window & { L?: LeafletLibrary }).L;
    if (!map || !leaflet) return;
    const locations = results.filter((store) => isPotensial(store) && hasCoordinates(store));
    if (locations.length === 0) return;
    const bounds = leaflet.latLngBounds(locations.map((store) => [store.lat, store.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  };

  const handleSearch = async () => {
    if (isSearching || isClassifying || (searchMode === "area" && !query.trim())) return;
    const params = new URLSearchParams({ mode: searchMode });
    let requestedBounds: string | null = null;
    if (searchMode === "map") {
      const map = leafletMap.current;
      if (!map) return;
      if (areaError || !L) { setError(areaError || "Peta belum siap."); return; }
      const bounds = L.latLngBounds(polygon);
      params.set("polygon", JSON.stringify(polygon));
      setDrawing(false);
      if (bounds.getNorth() - bounds.getSouth() > 0.5 || bounds.getEast() - bounds.getWest() > 0.5) {
        setError("Area peta terlalu luas. Perbesar peta untuk mempersempit pencarian.");
        return;
      }
      requestedBounds = bounds.toBBoxString();
      params.set("south", String(bounds.getSouth()));
      params.set("north", String(bounds.getNorth()));
      params.set("west", String(bounds.getWest()));
      params.set("east", String(bounds.getEast()));
      params.set("zoom", String(map.getZoom()));
    } else {
      params.set("area", query.trim());
    }
    setSaveOpen(false);
    setSaveNotice("");
    fitNextResults.current = searchMode === 'area';
    await startSearch(params, { mode: searchMode, area: searchMode === 'area' ? query.trim() : '',
      bounds: requestedBounds || undefined, polygon: searchMode === 'map' ? polygon : undefined });
  };

  const filteredResults = filterPotensial
    ? results.filter((r) => isPotensial(r))
    : results;

  const potensialCount = results.filter((r) => isPotensial(r)).length;
  const mappedPotentialCount = results.filter((r) => isPotensial(r) && hasCoordinates(r)).length;
  const withPhotoCount = results.filter((r) => r.photoUrl).length;
  const classifiedCount = results.filter((r) => r.classification).length;
  const withoutPhotoCount = results.length - withPhotoCount;

  return (
    <div className={styles.searchPage}>
      <div className={styles.pageHeader}>
        <span className={styles.pageEyebrow}>WORKSPACE / EKSPLORASI</span>
        <h1>Pencarian toko</h1>
        <p>Cari kelontong dan sembako berdasarkan nama daerah atau area yang Anda gambar di peta.</p>
      </div>

      {/* Search Bar */}
      <div className={`${styles.searchPanel} ${searchMode === 'map' ? styles.mapSearchPanel : ''}`}>
      <div className={styles.modeSwitch} role="group" aria-label="Mode pencarian">
        <button type="button" aria-pressed={searchMode === "area"} disabled={isSearching || isClassifying}
          onClick={() => { setSearchMode("area"); setDrawing(false); setError(""); }}>Nama daerah</button>
        <button type="button" aria-pressed={searchMode === "map"} disabled={isSearching || isClassifying}
          onClick={() => { setSearchMode("map"); setError(""); }}>Area peta</button>
      </div>
      {searchMode === "area" ? <>
      <label htmlFor="search-area" className={styles.searchLabel}>Daerah pencarian</label>
      <div className={styles.searchBar}>
        <div className={styles.searchInputWrapper}>
          <span className={styles.searchIcon}><Icon name="search" /></span>
          <input
            id="search-area"
            type="text"
            className={styles.searchInput}
            placeholder="Masukkan daerah, misalnya Seturan atau Sleman"
            aria-label="Daerah pencarian"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSearch}
          disabled={isSearching || isClassifying || !query.trim()}
        >
          {isSearching ? (
            "Mencari..."
          ) : (
            "Cari"
          )}
        </button>
      </div>
      <p className={styles.searchHint}>Contoh: Babarsari, Seturan, atau Sleman</p>
      </> : <div className={styles.mapSearchControls}>
        <div><strong>Batas area canvasing</strong><p>Klik minimal 3 titik untuk menggambar area. Geser titik untuk mengubah batas.</p>
          <div className={styles.drawActions}>
            <button type="button" className="btn btn-secondary" disabled={!mapReady || isSearching || isClassifying} onClick={() => { setDrawing(!drawing); setSelectedStore(null); }}>{drawing ? 'Selesai menggambar' : polygon.length ? 'Edit area' : 'Gambar area'}</button>
            <button type="button" className="btn btn-secondary" disabled={!polygon.length || isSearching || isClassifying} onClick={() => { setPolygon(current => current.slice(0, -1)); setDrawing(true); }}>Urungkan titik</button>
            <button type="button" className="btn btn-secondary" disabled={!polygon.length || isSearching || isClassifying} onClick={() => { setPolygon([]); setDrawing(true); setError(''); }}>Gambar ulang</button>
          </div>
          <p role="status">{polygon.length} titik · {polygon.length >= 3 && areaError ? areaError : drawing ? 'Mode gambar aktif.' : !areaError ? 'Area siap dicari.' : 'Gambar area untuk mulai mencari.'}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleSearch}
          disabled={!mapReady || isSearching || isClassifying || !!areaError}>
          {isSearching ? "Mencari..." : isClassifying ? "Memproses hasil..." : drawing ? "Selesai & cari toko" : "Cari di area ini"}
        </button>
      </div>}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBox}>
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleSearch}>
            Coba lagi
          </button>
        </div>
      )}
      {searchProgress && <p className={styles.searchHint} role="status">{searchProgress}</p>}
      {coverageNotice && <p className={styles.searchHint} role="status">{coverageNotice}</p>}
      {classificationError && <div className={styles.errorBox}>{classificationError}</div>}
      {saveNotice && <div className={styles.saveNotice} role="status">{saveNotice} <Link href="/dashboard/canvasing">Buka Kunjungan →</Link></div>}
      {saveOpen && <section className={styles.savePanel} aria-label="Simpan daftar canvasing">
        <div><h2>Simpan ke daftar canvasing</h2><p>{chosen.length} toko dipilih. Daftar tersimpan di browser ini, sesuai akun yang masuk.</p></div>
        <label>Tujuan penyimpanan<select value={targetList} onChange={(event) => setTargetList(event.target.value)}>
          <option value="">Buat daftar baru</option>
          {visitLists.map((list) => <option value={list.id} key={list.id}>{list.name} · {list.area}</option>)}
        </select></label>
        {!targetList && <><label>Nama daftar<input maxLength={100} value={listName} onChange={(event) => setListName(event.target.value)} placeholder="Contoh: Kunjungan Seturan Senin" /></label>
          <label>Area kunjungan<input maxLength={100} value={visitArea} onChange={(event) => setVisitArea(event.target.value)} placeholder="Contoh: Seturan" /></label></>}
        {targetList && <p>Toko ditambahkan ke daftar terpilih. Toko yang sudah ada akan dilewati.</p>}
        {(saveError || storageError) && <p role="alert">{saveError || storageError}</p>}
        <div className={styles.saveActions}><button className="btn btn-secondary" onClick={() => setSaveOpen(false)}>Batal</button>
          <button className="btn btn-primary" disabled={!chosen.length || !!storageError || (!targetList && (!listName.trim() || !visitArea.trim()))} onClick={() => {
            try {
              const saved = saveVisitList({ listId: targetList || undefined, name: listName, area: visitArea,
                source: { mode: searchContext.mode, bounds: searchContext.bounds, polygon: searchContext.polygon }, stores: results.filter((store) => chosen.includes(store.id)) });
              setSaveNotice(`${saved.added} toko disimpan ke “${saved.name}”.${saved.skipped ? ` ${saved.skipped} toko sudah ada dan dilewati.` : ""}`);
              setSaveOpen(false); setChosen([]);
            } catch (err) { setSaveError(err instanceof Error ? err.message : "Gagal menyimpan daftar."); }
          }}>Simpan daftar</button></div>
      </section>}

      {/* Map + Results Layout */}
      <div className={styles.mapResultsLayout}>
        {/* Map */}
        <div className={styles.mapSection}>
          <div ref={mapRef} className={styles.mapContainer}>
            {!mapReady && (
              <div className={styles.mapLoading}>
                <div className={styles.mapLoadingBar} />
                <span>Menyiapkan peta...</span>
              </div>
            )}
          </div>
          {mappedPotentialCount > 0 && (
            <button type="button" className={styles.mapLegend} onClick={showAllPotentialStores}
              title="Tampilkan semua toko potensial di peta">
              <span className={styles.mapLegendDot} />
              {mappedPotentialCount} toko potensial · Lihat semua
            </button>
          )}

          {/* Selected Store Info */}
          {selectedStore && (
            <div className={styles.storePopup}>
              <button
                className={styles.popupClose}
                onClick={() => setSelectedStore(null)}
              >
                <Icon name="close" />
              </button>
              <StoreThumbnail name={selectedStore.name} url={selectedStore.photoUrl} className={styles.popupPhoto} />
              <h3>{selectedStore.name}</h3>
              <p>{displayAddress(selectedStore.address)}</p>
              <div className={styles.popupMeta}>
                {selectedStore.rating > 0 && (
                  <span>Rating {selectedStore.rating} · {selectedStore.reviewCount} ulasan</span>
                )}
                <span>{displayCategory(selectedStore)}</span>
                <span
                  className={`badge ${selectedStore.classification?.label === "potensial"
                    ? "badge-success" : selectedStore.classification?.label === "non_potensial"
                      ? "badge-error" : ""}`}
                >
                  {classificationText(selectedStore)}
                  {selectedStore.classification?.confidence != null &&
                    ` · ${(selectedStore.classification.confidence * 100).toFixed(0)}%`}
                </span>
              </div>
              <a
                href={selectedStore.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
              >
                <Icon name="external" /> Buka di Google Maps
              </a>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className={styles.resultsList}>
          {/* Loading */}
          {isSearching && (
            <div className={styles.loadingResults}>
              <span className={styles.loadingTitle}>Menelusuri toko di area ini</span>
              <span className={styles.loadingHint}>Area ditelusuri dari beberapa titik. Proses dapat memerlukan beberapa menit.</span>
              <div className={styles.loadingRow} />
              <div className={styles.loadingRow} />
              <div className={styles.loadingRow} />
            </div>
          )}

          {/* Results */}
          {!isSearching && hasSearched && results.length > 0 && (
            <>
              <div className={styles.selectionBar}>
                <span>{chosen.length} toko dipilih</span>
                <button className="btn btn-secondary btn-sm" disabled={!potensialCount || isClassifying} onClick={() => setChosen(results.filter(isPotensial).map((store) => store.id))}>Pilih semua potensial</button>
                {chosen.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setChosen([])}>Kosongkan</button>}
                <button className="btn btn-primary btn-sm" disabled={!chosen.length || isClassifying} onClick={() => {
                  setListName(searchContext.area ? `Kunjungan ${searchContext.area}` : ""); setVisitArea(searchContext.area);
                  setTargetList(""); setSaveError(""); setSaveOpen(true);
                }}>Simpan pilihan</button>
                {isClassifying && <small>Penyimpanan tersedia setelah pencarian selesai.</small>}
              </div>
              <div className={styles.resultsHeader}>
                <div className={styles.resultsInfo}>
                  <span className={styles.resultCount}>
                    {results.length} toko
                  </span>
                  <span className={styles.potensialCount}>
                    {potensialCount} potensial
                  </span>
                  <span>{classifiedCount}/{results.length} toko diproses
                    {isClassifying ? " · sedang diproses" : ""}
                  </span>
                  {withoutPhotoCount > 0 && <span>{withoutPhotoCount} tanpa foto</span>}
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={filterPotensial}
                    onChange={(e) => setFilterPotensial(e.target.checked)}
                  />
                  <span className={styles.toggleSlider} />
                  <span className={styles.toggleLabel}>Potensial</span>
                </label>
              </div>

              <div className={styles.storeList}>
                {filteredResults.map((result, index) => (
                  <div
                    key={result.id}
                    className={`${styles.storeCard} ${
                      result.classification?.label === "potensial"
                        ? styles.cardPotensial
                        : result.classification?.label === "non_potensial"
                          ? styles.cardNonPotensial : ""
                    } ${
                      selectedStore?.id === result.id ? styles.cardSelected : ""
                    }`}
                    style={{ animationDelay: `${index * 0.03}s` }}
                    onClick={() => selectStore(result)}
                  >
                    <input type="checkbox" className={styles.storeCheckbox} aria-label={`Pilih ${result.name}`} checked={chosen.includes(result.id)}
                      onClick={(event) => event.stopPropagation()} onChange={(event) => setChosen((current) => event.target.checked ? [...current, result.id] : current.filter((id) => id !== result.id))} />
                    <StoreThumbnail name={result.name} url={result.photoUrl} className={styles.storePhoto} />
                    <div className={styles.storeInfo}>
                      <div className={styles.storeHeader}>
                        <h3>{result.name}</h3>
                        <span
                          className={`badge ${result.classification?.label === "potensial"
                            ? "badge-success" : result.classification?.label === "non_potensial"
                              ? "badge-error" : ""}`}
                          title={classificationText(result)}
                        >
                          {result.classification?.label === "potensial" ? "Potensial" :
                            result.classification?.label === "non_potensial" ? "Tidak sesuai" : "Tinjau"}
                        </span>
                      </div>
                      <p className={styles.storeAddress}>{displayAddress(result.address)}</p>
                      <div className={styles.storeMeta}>
                        {result.rating > 0 && (
                          <span>
                            Rating {result.rating} · {result.reviewCount} ulasan
                          </span>
                        )}
                        <span>{displayCategory(result)}</span>
                        <span>{classificationSummary(result)}
                          {result.classification?.confidence != null &&
                            ` · ${(result.classification.confidence * 100).toFixed(0)}%`}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty states */}
          {!isSearching && hasSearched && results.length === 0 && !error && (
            <div className="empty-state">
              <span className="empty-title">Tidak ada toko ditemukan</span>
              <span className="empty-desc">
                {searchMode === "area" ? "Coba masukkan nama daerah lain" : "Coba gambar ulang batas area, lalu cari lagi"}
              </span>
            </div>
          )}

          {!hasSearched && !isSearching && (
            <div className="empty-state">
              <span className="empty-title">Mulai Pencarian</span>
              <span className="empty-desc">
                {searchMode === "area" ? "Ketik nama daerah untuk mencari toko kelontong dan sembako"
                  : "Gambar batas area tujuan, lalu tekan Selesai & cari toko"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



