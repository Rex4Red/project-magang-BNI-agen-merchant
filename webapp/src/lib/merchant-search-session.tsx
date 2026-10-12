'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode, type SetStateAction } from 'react';
import { waitForMerchantSearch, readJsonResponse } from './merchant-search-client';
import type { MerchantStore, MerchantSearchInput, MerchantSearchResult } from './merchant-search';
import type { AreaPoint } from './search-polygon';
import type { Point } from './road-geometry';

export type MerchantSearchContext = {
  mode: 'road' | 'area' | 'map';
  area?: string;
  road?: string;
  roadName?: string;
  bounds?: string;
  polygon?: AreaPoint[];
  path?: Point[];
  length?: number;
  width?: number;
};

export type MapView = { lat: number; lng: number; zoom: number };

export type MerchantSearchState = {
  query: string;
  searchMode: 'road' | 'area' | 'map';
  polygon: AreaPoint[];
  segment: Point[];
  width: number;
  roadName: string;
  drawing: boolean;
  results: MerchantStore[];
  chosen: string[];
  selectedStore: MerchantStore | null;
  category: string;
  searchContext: MerchantSearchContext;
  mapView: MapView | null;
  jobId: string | null;
  isSearching: boolean;
  hasSearched: boolean;
  error: string;
  searchProgress: string;
  coverageNotice: string;
};

const initialState = (): MerchantSearchState => ({
  query: '',
  searchMode: 'road',
  polygon: [],
  segment: [],
  width: 50,
  roadName: 'Jalur manual',
  drawing: false,
  results: [],
  chosen: [],
  selectedStore: null,
  category: '',
  searchContext: { mode: 'road' },
  mapView: null,
  jobId: null,
  isSearching: false,
  hasSearched: false,
  error: '',
  searchProgress: '',
  coverageNotice: '',
});

function restore(key: string): MerchantSearchState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.version !== 1 || !['road', 'area', 'map'].includes(saved.state?.searchMode)
      || !Array.isArray(saved.state.results) || !Array.isArray(saved.state.chosen)
      || !saved.state.searchContext) {
      return initialState();
    }
    const state: MerchantSearchState = { ...initialState(), ...saved.state };
    if (state.jobId && !/^[a-f0-9-]{36}$/.test(state.jobId)) {
      return initialState();
    }
    if (!state.jobId) {
      state.isSearching = false;
      state.searchProgress = '';
    }
    return state;
  } catch {
    return initialState();
  }
}

type MerchantSearchSession = {
  state: MerchantSearchState;
  setField: <K extends keyof MerchantSearchState>(key: K, value: SetStateAction<MerchantSearchState[K]>) => void;
  startSearch: (input: MerchantSearchInput, context: MerchantSearchContext) => Promise<void>;
};

const Context = createContext<MerchantSearchSession | null>(null);

export function MerchantSearchProvider({ username, children }: { username: string; children: ReactNode }) {
  const key = `bni-canvas:merchant-search:v1:${username || 'merchant'}`;
  const [state, setState] = useState(() => restore(key));
  const starting = useRef<AbortController | null>(null);
  const polling = useRef<AbortController | null>(null);

  const setField = useCallback(<K extends keyof MerchantSearchState>(field: K, value: SetStateAction<MerchantSearchState[K]>) => {
    setState(current => {
      const next = typeof value === 'function' ? (value as (old: MerchantSearchState[K]) => MerchantSearchState[K])(current[field]) : value;
      return Object.is(next, current[field]) ? current : { ...current, [field]: next };
    });
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ version: 1, state }));
    } catch {
      // In-memory state remains usable if sessionStorage is full
    }
  }, [key, state]);

  useEffect(() => () => {
    starting.current?.abort();
    polling.current?.abort();
  }, []);

  // Polling continues in the layout even when navigating between sub-pages
  useEffect(() => {
    if (!state.jobId) return;
    const controller = new AbortController();
    polling.current = controller;

    void waitForMerchantSearch(state.jobId, controller.signal, progress => {
      if (controller.signal.aborted) return;
      setState(current => ({ ...current, searchProgress: progress }));
    }).then((data: MerchantSearchResult) => {
      if (controller.signal.aborted) return;
      setState(current => {
        const coverageText = current.searchContext.mode === 'road' && Array.isArray(data.coverage)
          ? `Pencarian selesai di ${data.coverage.length} titik sepanjang jalur. Hasil mengikuti usaha yang tersedia di Google Maps.`
          : current.searchContext.mode === 'map' && data.coverage && !Array.isArray(data.coverage)
            ? `Pencarian dari ${data.coverage.points} titik area · ${data.coverage.successfulQueries}/${data.coverage.totalQueries} pencarian selesai.`
            : `Pencarian merchant selesai. ${data.results.length} usaha ditemukan.`;

        const newMapView = data.area
          ? { lat: data.area.lat, lng: data.area.lng, zoom: data.area.radiusKm ? 15 : 13 }
          : current.mapView;

        return {
          ...current,
          results: data.results,
          jobId: null,
          isSearching: false,
          hasSearched: true,
          searchProgress: '',
          coverageNotice: data.warning || coverageText,
          mapView: newMapView,
          selectedStore: current.selectedStore ? data.results.find(s => s.id === current.selectedStore!.id) || null : null,
        };
      });
    }).catch(error => {
      if (!controller.signal.aborted) {
        setState(current => ({
          ...current,
          jobId: null,
          isSearching: false,
          searchProgress: '',
          error: error instanceof Error ? error.message : 'Pencarian merchant gagal. Silakan coba lagi.',
        }));
      }
    });

    return () => {
      controller.abort();
    };
  }, [state.jobId]);

  const startSearch = useCallback(async (input: MerchantSearchInput, context: MerchantSearchContext) => {
    starting.current?.abort();
    polling.current?.abort();
    const controller = new AbortController();
    starting.current = controller;

    setState(current => ({
      ...current,
      searchContext: context,
      isSearching: true,
      hasSearched: true,
      error: '',
      coverageNotice: '',
      searchProgress: 'Memulai pencarian merchant...',
      results: [],
      chosen: [],
      selectedStore: null,
      category: '',
    }));

    try {
      const response = await fetch('/api/v1/merchant/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      const started = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(started.error || 'Pencarian merchant gagal dimulai.');
      }

      setState(current => ({
        ...current,
        jobId: started.jobId,
        searchProgress: 'Pencarian terdaftar. Menunggu giliran...',
      }));
    } catch (err) {
      if (!controller.signal.aborted) {
        setState(current => ({
          ...current,
          jobId: null,
          isSearching: false,
          searchProgress: '',
          error: err instanceof Error ? err.message : 'Gagal menghubungi server.',
        }));
      }
    }
  }, []);

  return (
    <Context.Provider value={{ state, setField, startSearch }}>
      {children}
    </Context.Provider>
  );
}

export function useMerchantSearchSession() {
  const session = useContext(Context);
  if (!session) {
    throw new Error('useMerchantSearchSession must be used within a MerchantSearchProvider');
  }
  return session;
}

export function useMerchantSearchField<K extends keyof MerchantSearchState>(field: K): [MerchantSearchState[K], (value: SetStateAction<MerchantSearchState[K]>) => void] {
  const { state, setField } = useMerchantSearchSession();
  const setter = useCallback((value: SetStateAction<MerchantSearchState[K]>) => {
    setField(field, value);
  }, [setField, field]);
  return [state[field], setter];
}
