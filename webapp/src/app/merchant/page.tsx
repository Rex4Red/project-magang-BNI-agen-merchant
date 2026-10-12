"use client";

import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import Link from "next/link";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

import { distance, pathLength, type Point } from "@/lib/road-geometry";
import { polygonError } from "@/lib/search-polygon";
import { displayAddress, displayCategory, saveVisitList, useVisitLists } from "@/lib/canvasing";
import { Icon } from "@/components/Icon";
import {
  useMerchantSearchSession,
  useMerchantSearchField,
} from "@/lib/merchant-search-session";
import type { MerchantStore } from "@/lib/merchant-search";
import styles from "./page.module.css";

type LeafletLibrary = typeof Leaflet;
let L: LeafletLibrary | null = null;

function StoreThumbnail({ name, url, className }: { name: string; url: string | null | undefined; className: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={className}>
      {url && !failed ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.photoPlaceholder} aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);

export default function MerchantPage() {
  const { startSearch } = useMerchantSearchSession();

  // Session fields
  const [query, setQuery] = useMerchantSearchField("query");
  const [searchMode, setSearchMode] = useMerchantSearchField("searchMode");
  const [polygon, setPolygon] = useMerchantSearchField("polygon");
  const [segment, setSegment] = useMerchantSearchField("segment");
  const [width, setWidth] = useMerchantSearchField("width");
  const [roadName, setRoadName] = useMerchantSearchField("roadName");
  const [drawing, setDrawing] = useMerchantSearchField("drawing");
  const [results] = useMerchantSearchField("results");
  const [chosen, setChosen] = useMerchantSearchField("chosen");
  const [selectedStore, setSelectedStore] = useMerchantSearchField("selectedStore");
  const [categoryFilter, setCategoryFilter] = useMerchantSearchField("category");
  const [searchContext] = useMerchantSearchField("searchContext");
  const [mapView, setMapView] = useMerchantSearchField("mapView");
  const [isSearching] = useMerchantSearchField("isSearching");
  const [hasSearched] = useMerchantSearchField("hasSearched");
  const [error, setError] = useMerchantSearchField("error");
  const [searchProgress] = useMerchantSearchField("searchProgress");
  const [coverageNotice] = useMerchantSearchField("coverageNotice");

  // Local UI states
  const [mapReady, setMapReady] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [visitArea, setVisitArea] = useState("");
  const [targetList, setTargetList] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const { lists: visitLists, error: storageError } = useVisitLists();

  const mapContainer = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<Leaflet.LayerGroup | null>(null);
  const markersRef = useRef<Leaflet.Layer[]>([]);
  const initialMapView = useRef(mapView);
  const drawingRef = useRef(drawing);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Geometry calculations
  const routeLength = pathLength(segment);
  const actualLength = Math.round(routeLength);
  const validRoute = segment.length > 1 && routeLength >= 5 && routeLength <= 1000;
  const areaError = polygonError(polygon);

  // Filtered results by category
  const filteredResults = results.filter(
    (store) => !categoryFilter || displayCategory(store) === categoryFilter
  );

  const availableCategories = Array.from(new Set(results.map(displayCategory))).filter(Boolean);

  const selectStore = useCallback((store: MerchantStore) => {
    setSelectedStore(store);
    setFocusRequest((count) => count + 1);
  }, [setSelectedStore]);

  // Handle map recentering on selected store
  const selectedLat = selectedStore?.lat;
  const selectedLng = selectedStore?.lng;
  useLayoutEffect(() => {
    const map = leafletMap.current;
    if (
      !map ||
      selectedLat == null ||
      selectedLng == null ||
      !Number.isFinite(selectedLat) ||
      !Number.isFinite(selectedLng) ||
      Math.abs(selectedLat) > 90 ||
      Math.abs(selectedLng) > 180 ||
      (selectedLat === 0 && selectedLng === 0)
    )
      return;

    map.stop();
    map.invalidateSize({ pan: false });
    map.setView([selectedLat, selectedLng], 17, { animate: false });
  }, [selectedLat, selectedLng, focusRequest, mapReady]);

  // Load Leaflet
  useEffect(() => {
    let disposed = false;
    import("leaflet").then((leafletLib) => {
      if (disposed) return;
      L = leafletLib;
      setMapReady(true);
    }).catch(() => {
      if (!disposed) setError("Peta gagal dimuat. Periksa koneksi internet.");
    });

    return () => {
      disposed = true;
    };
  }, [setError]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapReady || !mapContainer.current || leafletMap.current || !L) return;

    const initialCenter: [number, number] = initialMapView.current
      ? [initialMapView.current.lat, initialMapView.current.lng]
      : [-7.773, 110.408];
    const initialZoom = initialMapView.current?.zoom ?? 15;

    const map = L.map(mapContainer.current, {
      zoomControl: true,
    }).setView(initialCenter, initialZoom);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layersRef.current = layerGroup;
    leafletMap.current = map;

    const rememberView = () => {
      const center = map.getCenter();
      setMapView({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };
    map.on("moveend", rememberView);

    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(mapContainer.current);

    map.doubleClickZoom.disable();

    return () => {
      resizeObserver.disconnect();
      map.off("moveend", rememberView);
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, [mapReady, setMapView]);

  // Handle map click drawing based on mode
  useEffect(() => {
    const map = leafletMap.current;
    if (!mapReady || !map) return;

    const handleClick = (event: Leaflet.LeafletMouseEvent) => {
      if (!drawingRef.current || isSearching) return;
      const point: Point = [event.latlng.lat, event.latlng.lng];

      if (searchMode === "road") {
        setSegment((current) =>
          current.length >= 100 || (current.length > 0 && distance(current[current.length - 1], point) < 1)
            ? current
            : [...current, point]
        );
      } else if (searchMode === "map") {
        setPolygon((current) =>
          current.length >= 100 ? current : [...current, point]
        );
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [mapReady, searchMode, isSearching, setSegment, setPolygon]);

  // Render shapes (road polyline or area polygon)
  useEffect(() => {
    const map = leafletMap.current;
    const group = layersRef.current;
    if (!mapReady || !map || !L || !group) return;

    group.clearLayers();

    if (searchMode === "road") {
      if (segment.length > 1) {
        L.polyline(segment, {
          color: routeLength > 1000 ? "#9d352e" : "#a84d27",
          weight: 6,
          interactive: false,
        }).addTo(group);
      }

      segment.forEach((point, index) => {
        const label = index === 0 ? "Awal" : index === segment.length - 1 ? "Akhir" : String(index + 1);
        const marker = L!.marker(point, {
          draggable: drawing && !isSearching,
          icon: L!.divIcon({
            className: styles.routeVertex,
            html: `<span>${label}</span>`,
            iconSize: [42, 28],
            iconAnchor: [21, 14],
          }),
        }).addTo(group);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setSegment((current) => current.map((p, i) => (i === index ? [pos.lat, pos.lng] : p)));
        });
      });
    } else if (searchMode === "map") {
      if (polygon.length >= 3) {
        L.polygon(polygon, {
          color: areaError ? "#9d352e" : "#a84d27",
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(group);
      } else if (polygon.length > 1) {
        L.polyline(polygon, {
          color: "#a84d27",
          weight: 3,
          interactive: false,
        }).addTo(group);
      }

      polygon.forEach((point, index) => {
        const marker = L!.marker(point, {
          draggable: drawing && !isSearching,
          icon: L!.divIcon({
            className: styles.areaVertex,
            html: `<span>${index + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        }).addTo(group);

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          setPolygon((current) => current.map((p, i) => (i === index ? [pos.lat, pos.lng] : p)));
        });
      });
    }
  }, [mapReady, searchMode, segment, polygon, drawing, isSearching, routeLength, areaError, setSegment, setPolygon]);

  // Render Merchant Markers
  useEffect(() => {
    const map = leafletMap.current;
    if (!mapReady || !map || !L) return;

    // Clear old merchant markers
    markersRef.current.forEach((m) => (m as Leaflet.Layer).remove());
    markersRef.current = [];

    const visibleStores = filteredResults;
    if (visibleStores.length === 0) return;

    const bounds = L.latLngBounds([]);

    visibleStores.forEach((store) => {
      if (!Number.isFinite(store.lat) || !Number.isFinite(store.lng)) return;

      const isSelected = selectedStore?.id === store.id;

      const marker = L!.circleMarker([store.lat, store.lng], {
        radius: isSelected ? 9 : 7,
        color: isSelected ? "#a84d27" : "#12656b",
        fillColor: isSelected ? "#a84d27" : "#ffffff",
        fillOpacity: 1,
        weight: isSelected ? 3 : 2,
        bubblingMouseEvents: false,
      })
        .addTo(map)
        .bindTooltip(escapeHtml(store.name), { direction: "top", offset: [0, -10] });

      marker.on("click", () => {
        selectStore(store);
      });

      markersRef.current.push(marker);
      bounds.extend([store.lat, store.lng]);
    });
  }, [mapReady, filteredResults, selectedStore, selectStore]);

  const handleSearch = async () => {
    if (isSearching) return;
    setDrawing(false);
    setError("");
    setSaveOpen(false);
    setSaveNotice("");

    if (searchMode === "road") {
      if (!validRoute) {
        setError(routeLength > 1000 ? "Panjang jalur maksimal 1.000 meter." : "Tentukan jalur minimal 5 meter.");
        return;
      }
      const rName = roadName.trim() || "Jalur manual";
      await startSearch(
        { mode: "road", path: segment, width, roadName: rName },
        { mode: "road", path: segment, width, road: rName, roadName: rName, length: actualLength }
      );
    } else if (searchMode === "area") {
      if (!query.trim()) {
        setError("Masukkan nama daerah pencarian.");
        return;
      }
      await startSearch(
        { mode: "area", area: query.trim() },
        { mode: "area", area: query.trim() }
      );
    } else if (searchMode === "map") {
      if (areaError || polygon.length < 3) {
        setError(areaError || "Gambar area polygon minimal 3 titik.");
        return;
      }
      await startSearch(
        { mode: "map", polygon },
        { mode: "map", polygon }
      );
    }
  };

  const handleFitRoute = () => {
    if (segment.length >= 2 && leafletMap.current) {
      leafletMap.current.fitBounds(segment, { padding: [40, 40], maxZoom: 18 });
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <span className={styles.pageEyebrow}>Canvasing merchant</span>
        <h1>Cari merchant</h1>
        <p>Cari semua toko dan merchant untuk canvasing BNI berdasarkan nama daerah, area peta, atau jalur rute jalan.</p>
      </header>

      {/* Mode Switcher and Controls */}
      <div className={`${styles.searchPanel} ${searchMode !== "area" ? styles.mapSearchPanel : ""}`}>
        <div className={styles.modeSwitch} role="group" aria-label="Mode pencarian merchant">
          <button
            type="button"
            aria-pressed={searchMode === "area"}
            disabled={isSearching}
            onClick={() => {
              setSearchMode("area");
              setDrawing(false);
              setError("");
            }}
          >
            Nama daerah
          </button>
          <button
            type="button"
            aria-pressed={searchMode === "map"}
            disabled={isSearching}
            onClick={() => {
              setSearchMode("map");
              setError("");
            }}
          >
            Area peta
          </button>
          <button
            type="button"
            aria-pressed={searchMode === "road"}
            disabled={isSearching}
            onClick={() => {
              setSearchMode("road");
              setError("");
            }}
          >
            Jalur rute
          </button>
        </div>

        {/* Area Mode */}
        {searchMode === "area" && (
          <>
            <label htmlFor="merchant-area-input" className={styles.searchLabel}>
              Daerah pencarian
            </label>
            <div className={styles.searchBar}>
              <div className={styles.searchInputWrapper}>
                <span className={styles.searchIcon}>
                  <Icon name="search" />
                </span>
                <input
                  id="merchant-area-input"
                  type="text"
                  className={styles.searchInput}
                  placeholder="Masukkan daerah, misalnya Seturan, Malioboro, atau Sleman"
                  aria-label="Daerah pencarian merchant"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSearch}
                disabled={isSearching || !query.trim()}
              >
                {isSearching ? "Mencari..." : "Cari merchant"}
              </button>
            </div>
            <p className={styles.searchHint}>
              Mencari semua toko, resto, kafe, apotek, dan usaha di area ini. Contoh: Seturan, Babarsari, Gejayan, atau Kotagede.
            </p>
          </>
        )}

        {/* Map Mode (Polygon) */}
        {searchMode === "map" && (
          <div className={styles.modeControls}>
            <div>
              <strong>Batas area polygon</strong>
              <p>Klik minimal 3 titik di peta untuk menggambar area polygon. Geser titik untuk mengubah batas.</p>
              <div className={styles.drawActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!mapReady || isSearching}
                  onClick={() => {
                    setDrawing(!drawing);
                    setSelectedStore(null);
                  }}
                >
                  {drawing ? "Selesai menggambar" : polygon.length ? "Edit area" : "Gambar area"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!polygon.length || isSearching}
                  onClick={() => {
                    setPolygon((cur) => cur.slice(0, -1));
                    setDrawing(true);
                  }}
                >
                  Urungkan titik
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!polygon.length || isSearching}
                  onClick={() => {
                    setPolygon([]);
                    setDrawing(true);
                    setError("");
                  }}
                >
                  Gambar ulang
                </button>
              </div>
              <p role="status">
                {polygon.length} titik ·{" "}
                {polygon.length >= 3 && areaError
                  ? areaError
                  : drawing
                  ? "Mode gambar aktif: klik peta untuk menambah titik."
                  : !areaError
                  ? "Area siap dicari."
                  : "Gambar area polygon untuk mulai mencari."}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={!mapReady || isSearching || !!areaError || polygon.length < 3}
            >
              {isSearching ? "Mencari..." : drawing ? "Selesai & cari merchant" : "Cari di area ini"}
            </button>
          </div>
        )}

        {/* Road Mode (Polyline) */}
        {searchMode === "road" && (
          <div className={styles.modeControls}>
            <div>
              <strong>Ruas pencarian jalur</strong>
              <p>Klik titik awal, belokan, sampai titik akhir di sepanjang jalan. Geser titik untuk menyesuaikan jalur.</p>
              <div className={styles.drawActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!mapReady || isSearching}
                  onClick={() => {
                    setDrawing(!drawing);
                    setSelectedStore(null);
                  }}
                >
                  {drawing ? "Selesai menggambar" : segment.length ? "Edit jalur" : "Gambar jalur"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!segment.length || isSearching}
                  onClick={() => {
                    setSegment((cur) => cur.slice(0, -1));
                    setDrawing(true);
                  }}
                >
                  Urungkan titik
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!segment.length || isSearching}
                  onClick={() => {
                    setSegment([]);
                    setDrawing(true);
                    setError("");
                  }}
                >
                  Gambar ulang
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSearching || segment.length < 2}
                  onClick={handleFitRoute}
                >
                  Lihat seluruh jalur
                </button>
              </div>

              <div className={styles.widthSelector}>
                <label htmlFor="corridor-width">Jarak pencarian dari garis:</label>
                <select
                  id="corridor-width"
                  disabled={isSearching}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} meter ke tiap sisi
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.widthSelector}>
                <label htmlFor="road-name-input">Nama jalan / ruas (opsional):</label>
                <input
                  id="road-name-input"
                  type="text"
                  disabled={isSearching}
                  value={roadName}
                  onChange={(e) => setRoadName(e.target.value)}
                  placeholder="Contoh: Jl. Seturan Raya"
                  style={{
                    minHeight: 38,
                    padding: "6px 12px",
                    border: "1px solid #86868f",
                    borderRadius: 6,
                    fontSize: 13,
                    background: "#fff",
                    color: "#27272a",
                    maxWidth: 240,
                  }}
                />
              </div>

              <div className={styles.pathStats}>
                <span>
                  <strong>{actualLength} m</strong> panjang jalur · {segment.length} titik · maksimal 1.000 m.
                </span>
                {routeLength > 1000 && <span role="alert" style={{ color: "#9d352e" }}>Melebihi 1 km!</span>}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={!mapReady || isSearching || !validRoute}
            >
              {isSearching ? "Mencari..." : drawing ? "Selesai & cari merchant" : "Cari merchant di jalur ini"}
            </button>
          </div>
        )}
      </div>

      {/* Error and Progress Status Banners */}
      {error && (
        <div className={styles.errorBox} role="alert">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleSearch}>
            Coba lagi
          </button>
        </div>
      )}

      {searchProgress && (
        <p className={styles.searchHint} role="status">
          <Icon name="refresh" /> {searchProgress}
        </p>
      )}

      {coverageNotice && (
        <p className={styles.searchHint} role="status">
          {coverageNotice}
        </p>
      )}

      {saveNotice && (
        <div className={styles.saveNotice} role="status">
          {saveNotice} <Link href="/merchant/canvasing">Buka Kunjungan merchant →</Link>
        </div>
      )}

      {/* Save to Visit List Form */}
      {saveOpen && (
        <section className={styles.savePanel} aria-label="Simpan daftar canvasing merchant">
          <div>
            <h2>Simpan ke daftar canvasing merchant</h2>
            <p>{chosen.length} merchant dipilih. Daftar tersimpan di database laptop khusus akun merchant.</p>
          </div>

          <label>
            Tujuan penyimpanan
            <select value={targetList} onChange={(e) => setTargetList(e.target.value)}>
              <option value="">Buat daftar baru</option>
              {visitLists.map((list) => (
                <option value={list.id} key={list.id}>
                  {list.name} · {list.area}
                </option>
              ))}
            </select>
          </label>

          {!targetList && (
            <>
              <label>
                Nama daftar
                <input
                  maxLength={100}
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="Contoh: Merchant Seturan Senin"
                />
              </label>
              <label>
                Area kunjungan
                <input
                  maxLength={100}
                  value={visitArea}
                  onChange={(e) => setVisitArea(e.target.value)}
                  placeholder="Contoh: Seturan"
                />
              </label>
            </>
          )}

          {targetList && <p>Merchant ditambahkan ke daftar terpilih. Merchant yang sudah ada akan dilewati.</p>}
          {(saveError || storageError) && <p role="alert">{saveError || storageError}</p>}

          <div className={styles.saveActions}>
            <button className="btn btn-secondary" disabled={saving} onClick={() => setSaveOpen(false)}>
              Batal
            </button>
            <button
              className="btn btn-primary"
              disabled={
                saving ||
                !chosen.length ||
                !!storageError ||
                (!targetList && (!listName.trim() || !visitArea.trim()))
              }
              onClick={async () => {
                if (saving) return;
                setSaving(true);
                setSaveError("");
                try {
                  const saved = await saveVisitList({
                    listId: targetList || undefined,
                    name: listName,
                    area: visitArea,
                    source: {
                      mode: searchContext.mode,
                      road: searchContext.road,
                      bounds: searchContext.bounds,
                      polygon: searchContext.polygon ? (searchContext.polygon as [number, number][]) : undefined,
                      lengthMeters: searchContext.length,
                      corridorMeters: searchContext.width,
                    },
                    stores: results.filter((s) => chosen.includes(s.id)),
                  });
                  setSaveNotice(
                    `${saved.added} merchant disimpan ke “${saved.name}”.${
                      saved.skipped ? ` ${saved.skipped} duplikat dilewati.` : ""
                    }`
                  );
                  setSaveOpen(false);
                  setChosen([]);
                } catch (err) {
                  setSaveError(err instanceof Error ? err.message : "Gagal menyimpan daftar.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Menyimpan…" : "Simpan daftar"}
            </button>
          </div>
        </section>
      )}

      {/* Map & Results Layout */}
      <div className={styles.mapResultsLayout}>
        {/* Map Section */}
        <section className={styles.mapSection} aria-label="Peta interaktif merchant">
          <div ref={mapContainer} className={styles.mapContainer}>
            {!mapReady && (
              <div className={styles.mapLoading}>
                <div className={styles.mapLoadingBar} />
                <span>Menyiapkan peta...</span>
              </div>
            )}
          </div>

          <div className={styles.mapCaption}>
            <span>● Titik kontrol</span>
            <span>Garis/Area oranye: cakupan pencarian</span>
            <span>○ Titik merchant</span>
          </div>

          {/* Selected Store Popup Overlay */}
          {selectedStore && (
            <div className={styles.storePopup}>
              <button
                className={styles.popupClose}
                aria-label="Tutup detail merchant"
                onClick={() => setSelectedStore(null)}
              >
                <Icon name="close" />
              </button>
              <StoreThumbnail name={selectedStore.name} url={selectedStore.photoUrl} className={styles.popupPhoto} />
              <h3>{selectedStore.name}</h3>
              <p>{displayAddress(selectedStore.address)}</p>
              <div className={styles.popupMeta}>
                <span className="badge badge-info">{displayCategory(selectedStore)}</span>
                {selectedStore.rating > 0 && (
                  <span>
                    Rating {selectedStore.rating} · {selectedStore.reviewCount} ulasan
                  </span>
                )}
                {selectedStore.distanceFromRoad != null && (
                  <span>{selectedStore.distanceFromRoad} m dari ruas</span>
                )}
                {selectedStore.distanceFromStart != null && (
                  <span>{selectedStore.distanceFromStart} m dari titik awal</span>
                )}
              </div>
              <a
                href={
                  /^https:\/\/(www\.)?google\.com\/maps\//i.test(selectedStore.url || "")
                    ? selectedStore.url
                    : `https://www.google.com/maps/search/?api=1&query=${selectedStore.lat},${selectedStore.lng}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 10 }}
              >
                <Icon name="external" /> Buka di Google Maps
              </a>
            </div>
          )}
        </section>

        {/* Results Section */}
        <section className={styles.resultsList} aria-label="Hasil pencarian merchant">
          {/* Loading Skeleton */}
          {isSearching && (
            <div className={styles.loadingResults}>
              <span className={styles.loadingTitle}>Menelusuri merchant di area ini...</span>
              <span className={styles.loadingHint}>
                Pencarian menelusuri toko, restoran, kafe, dan semua jenis usaha. Proses dapat memerlukan beberapa saat.
              </span>
              <div className={styles.loadingRow} />
              <div className={styles.loadingRow} />
              <div className={styles.loadingRow} />
            </div>
          )}

          {/* Results Ready */}
          {!isSearching && hasSearched && results.length > 0 && (
            <>
              <div className={styles.resultTitle}>
                <h2>Hasil pencarian</h2>
                <span className="badge badge-info">{results.length} merchant</span>
              </div>

              <div className={styles.resultStatus} role="status">
                <Icon name="check" /> Pencarian selesai
              </div>

              <div className={styles.selectionBar}>
                <span>{chosen.length} merchant dipilih</span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!filteredResults.length}
                  onClick={() =>
                    setChosen(Array.from(new Set([...chosen, ...filteredResults.map((s) => s.id)])))
                  }
                >
                  Pilih yang tampil
                </button>
                {chosen.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setChosen([])}>
                    Kosongkan
                  </button>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!chosen.length}
                  onClick={() => {
                    const fallbackArea =
                      searchMode === "area" ? query.trim() : searchMode === "road" ? roadName.trim() : "Area Peta";
                    setListName(`Merchant ${fallbackArea}`);
                    setVisitArea(fallbackArea);
                    setTargetList("");
                    setSaveError("");
                    setSaveOpen(true);
                  }}
                >
                  Simpan pilihan
                </button>
              </div>

              <div className={styles.resultsHeader}>
                <div className={styles.resultsInfo}>
                  <span className={styles.resultCount}>{results.length} usaha ditemukan</span>
                  {availableCategories.length > 0 && (
                    <span>· {availableCategories.length} kategori berbeda</span>
                  )}
                </div>

                <div className={styles.categoryFilter}>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter kategori"
                  >
                    <option value="">Semua kategori ({results.length})</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat} ({results.filter((s) => displayCategory(s) === cat).length})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.storeList}>
                {filteredResults.map((store) => (
                  <div
                    key={store.id}
                    className={`${styles.storeCard} ${
                      selectedStore?.id === store.id ? styles.cardSelected : ""
                    }`}
                    onClick={() => selectStore(store)}
                  >
                    <input
                      type="checkbox"
                      className={styles.storeCheckbox}
                      aria-label={`Pilih ${store.name}`}
                      checked={chosen.includes(store.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setChosen((cur) =>
                          e.target.checked ? [...cur, store.id] : cur.filter((id) => id !== store.id)
                        )
                      }
                    />

                    <StoreThumbnail name={store.name} url={store.photoUrl} className={styles.storePhoto} />

                    <div className={styles.storeInfo}>
                      <div className={styles.storeHeader}>
                        <h3>
                          <button
                            type="button"
                            className={styles.storeTitle}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectStore(store);
                            }}
                          >
                            {store.name}
                          </button>
                        </h3>
                        <span className="badge badge-info">{displayCategory(store)}</span>
                      </div>

                      <p className={styles.storeAddress}>{displayAddress(store.address)}</p>

                      <div className={styles.storeMeta}>
                        {store.rating > 0 && (
                          <span>
                            Rating {store.rating} ({store.reviewCount} ulasan)
                          </span>
                        )}
                        {store.distanceFromRoad != null && (
                          <span>{store.distanceFromRoad} m dari ruas</span>
                        )}
                        {store.distanceFromStart != null && (
                          <span>{store.distanceFromStart} m dari awal</span>
                        )}
                      </div>

                      <div className={styles.storeActions}>
                        <a
                          className="btn btn-secondary btn-sm"
                          href={
                            /^https:\/\/(www\.)?google\.com\/maps\//i.test(store.url || "")
                              ? store.url
                              : `https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon name="external" /> Google Maps
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty Results */}
          {!isSearching && hasSearched && results.length === 0 && (
            <div className={styles.emptyResults}>
              <Icon name="search" />
              <h3>Tidak ada merchant ditemukan</h3>
              <p>
                Coba perbesar area pencarian, sesuaikan nama daerah, atau lebarkan jarak pencarian jalur.
              </p>
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className={styles.emptyResults}>
              <Icon name="search" />
              <h3>Belum ada pencarian merchant</h3>
              <p>Pilih mode pencarian di atas lalu cari untuk menampilkan semua merchant di peta dan daftar.</p>
            </div>
          )}
        </section>
      </div>

      <div className={styles.footerSection}>
        <Link href="/merchant/canvasing" className="btn btn-secondary">
          <Icon name="pin" /> Buka kunjungan merchant
        </Link>
        <small>Daftar tersimpan di database laptop khusus akun merchant.</small>
      </div>
    </div>
  );
}
