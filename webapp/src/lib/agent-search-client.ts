import { readJsonResponse } from './merchant-search-client';
import type { AgentSearchResult } from './agent-search-jobs';

type Snapshot = { status: 'queued' | 'running' | 'done' | 'failed'; phase: 'searching' | 'classifying'; completed: number; total: number; result?: AgentSearchResult; error?: string };
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}
export async function waitForAgentSearch(jobId: string, signal: AbortSignal, onProgress: (data: Snapshot | string) => void): Promise<AgentSearchResult> {
  if (typeof jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('Pencarian gagal dimulai. Muat ulang halaman dan coba lagi.');
  let failures = 0;
  while (!signal.aborted) {
    let data: Snapshot;
    try {
      const response = await fetch(`/api/v1/search?job=${encodeURIComponent(jobId)}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      const body = await readJsonResponse(response);
      if (response.status === 404) throw new Error('Pencarian kedaluwarsa atau server dimulai ulang. Silakan cari lagi.');
      if (!response.ok) throw new Error(body.error || 'Koneksi ke server terputus.');
      data = body; failures = 0;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.message.includes('kedaluwarsa'))) throw error;
      if (++failures >= 5) throw new Error('Server belum dapat dihubungi. Periksa koneksi internet, lalu coba lagi.');
      onProgress('Koneksi terputus sebentar. Mencoba menghubungkan kembali...');
      await pause(signal); continue;
    }
    if (data.status === 'failed') throw new Error(data.error || 'Pencarian gagal.');
    onProgress(data);
    if (data.status === 'done' && data.result) return data.result;
    await pause(signal);
  }
  throw new DOMException('Aborted', 'AbortError');
}
