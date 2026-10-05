'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode, type SetStateAction } from 'react';
import { waitForAgentSearch } from './agent-search-client';
import { readJsonResponse } from './merchant-search-client';
import type { AgentSearchResult } from './agent-search-jobs';
import type { AreaPoint } from './search-polygon';
import type { Prospect } from './canvasing';

type SearchContext = { mode: 'area' | 'map'; area: string; bounds?: string; polygon?: AreaPoint[] };
type MapView = { lat: number; lng: number; zoom: number };
type SearchState = {
  query: string; searchMode: 'area' | 'map'; polygon: AreaPoint[]; drawing: boolean;
  results: Prospect[]; chosen: string[]; selectedStore: Prospect | null; filterPotensial: boolean;
  searchContext: SearchContext; mapView: MapView | null; jobId: string | null;
  isSearching: boolean; isClassifying: boolean; hasSearched: boolean;
  error: string; classificationError: string; coverageNotice: string; searchProgress: string;
};
const initialState = (): SearchState => ({
  query: '', searchMode: 'area', polygon: [], drawing: false, results: [], chosen: [],
  selectedStore: null, filterPotensial: false, searchContext: { mode: 'area', area: '' },
  mapView: null, jobId: null, isSearching: false, isClassifying: false, hasSearched: false,
  error: '', classificationError: '', coverageNotice: '', searchProgress: '',
});
function restore(key: string): SearchState {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved?.version !== 1 || !['area', 'map'].includes(saved.state?.searchMode)
      || !Array.isArray(saved.state.results) || !Array.isArray(saved.state.polygon)
      || !Array.isArray(saved.state.chosen) || !saved.state.searchContext) return initialState();
    const state: SearchState = { ...initialState(), ...saved.state };
    if (state.jobId && !/^[a-f0-9-]{36}$/.test(state.jobId)) return initialState();
    if (!state.jobId) {
      state.isSearching = false; state.isClassifying = false; state.searchProgress = '';
    }
    return state;
  } catch { return initialState(); }
}

type SearchSession = {
  state: SearchState;
  setField: <K extends keyof SearchState>(key: K, value: SetStateAction<SearchState[K]>) => void;
  startSearch: (params: URLSearchParams, context: SearchContext) => Promise<void>;
};
const Context = createContext<SearchSession | null>(null);

export function AgentSearchProvider({ username, children }: { username: string; children: ReactNode }) {
  const key = `bni-canvas:agent-search:v1:${username}`;
  const [state, setState] = useState(() => restore(key));
  const starting = useRef<AbortController | null>(null);
  const polling = useRef<AbortController | null>(null);
  const setField = useCallback(<K extends keyof SearchState,>(field: K, value: SetStateAction<SearchState[K]>) => {
    setState(current => {
      const next = typeof value === 'function' ? (value as (old: SearchState[K]) => SearchState[K])(current[field]) : value;
      return Object.is(next, current[field]) ? current : { ...current, [field]: next };
    });
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify({ version: 1, state })); }
    catch { /* Navigation still retains the in-memory state when browser storage is full. */ }
  }, [key, state]);
  useEffect(() => () => { starting.current?.abort(); polling.current?.abort(); }, []);

  // The dashboard layout owns polling; switching pages only unmounts the map and results view.
  useEffect(() => {
    if (!state.jobId) return;
    const controller = new AbortController();
    polling.current = controller;
    const applyResults = (current: SearchState, data: AgentSearchResult): SearchState => ({
      ...current, results: data.results,
      selectedStore: current.selectedStore ? data.results.find(store => store.id === current.selectedStore!.id) || null : null,
      mapView: current.searchContext.mode === 'area' && !current.results.length && data.results.length
        ? { lat: data.area.lat, lng: data.area.lng, zoom: data.area.radiusKm ? 15 : 12 } : current.mapView,
    });
    void waitForAgentSearch(state.jobId, controller.signal, progress => {
      if (controller.signal.aborted) return;
      setState(current => {
        if (typeof progress === 'string') return { ...current, searchProgress: progress };
        const next = progress.result ? applyResults(current, progress.result) : current;
        return { ...next,
          isSearching: !next.results.length, isClassifying: !!next.results.length && progress.status !== 'done',
          searchProgress: progress.status === 'queued' ? 'Menunggu giliran pencarian...'
            : progress.phase === 'classifying' ? `Memproses foto: ${progress.completed}/${progress.total} selesai.`
              : `Menelusuri area: ${progress.completed}/${progress.total} pencarian selesai.`,
        };
      });
    }).then(data => {
      if (controller.signal.aborted) return;
      setState(current => ({ ...applyResults(current, data), jobId: null,
        isSearching: false, isClassifying: false, searchProgress: '', classificationError: data.warning || '',
        coverageNotice: current.searchContext.mode === 'map' && data.coverage
          ? `Pencarian dari ${data.coverage.points} titik area · ${data.coverage.successfulQueries}/${data.coverage.totalQueries} pencarian selesai. Hasil bergantung pada toko yang ditampilkan Google Maps.` : '',
      }));
    }).catch(error => {
      if (!controller.signal.aborted) setState(current => ({ ...current, jobId: null,
        isSearching: false, isClassifying: false, searchProgress: '',
        error: error instanceof Error ? error.message : 'Gagal menghubungi server. Coba lagi.',
      }));
    });
    return () => { controller.abort(); };
  }, [state.jobId]);

  async function startSearch(params: URLSearchParams, context: SearchContext) {
    if (starting.current || state.jobId || state.isSearching || state.isClassifying) return;
    const controller = new AbortController();
    starting.current = controller;
    setState(current => ({ ...current, searchContext: context, drawing: false,
      hasSearched: true, isSearching: true, isClassifying: false, error: '',
      classificationError: '', coverageNotice: '', results: [], chosen: [], selectedStore: null,
      searchProgress: 'Memulai pencarian...',
    }));
    try {
      const response = await fetch(`/api/v1/search?${params}`, { signal: controller.signal, cache: 'no-store' });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Pencarian gagal dimulai.');
      if (typeof data.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(data.jobId)) throw new Error('Pencarian gagal dimulai. Coba lagi.');
      if (!controller.signal.aborted) setState(current => ({ ...current, jobId: data.jobId }));
    } catch (error) {
      if (!controller.signal.aborted) setState(current => ({ ...current, isSearching: false, searchProgress: '',
        error: error instanceof Error ? error.message : 'Gagal menghubungi server. Coba lagi.',
      }));
    } finally { if (starting.current === controller) starting.current = null; }
  }

  return <Context.Provider value={{ state, setField, startSearch }}>{children}</Context.Provider>;
}

export function useAgentSearchSession() {
  const session = useContext(Context);
  if (!session) throw new Error('Pencarian agen harus dibuka dari ruang kerja agen.');
  return session;
}
export function useAgentSearchField<K extends keyof SearchState>(key: K) {
  const { state, setField } = useAgentSearchSession();
  const setValue = useCallback((value: SetStateAction<SearchState[K]>) => setField(key, value), [key, setField]);
  return [state[key], setValue] as const;
}
