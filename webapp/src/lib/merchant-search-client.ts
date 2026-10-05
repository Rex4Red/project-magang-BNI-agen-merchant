import type { searchMerchants } from './merchant-search';

export async function readJsonResponse(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Koneksi ke server terputus. Periksa internet, lalu coba lagi.');
  }
  return response.json();
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function waitForMerchantSearch(jobId: string, signal: AbortSignal, progress: (message: string) => void): Promise<Awaited<ReturnType<typeof searchMerchants>>> {
  if (typeof jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(jobId)) throw new Error('Server gagal memulai pencarian. Muat ulang halaman dan coba lagi.');
  let failures = 0;
  while (!signal.aborted) {
    let data;
    try {
      const timeout = AbortSignal.timeout(15000);
      const response = await fetch(`/api/v1/merchant/search?job=${encodeURIComponent(jobId)}`, { cache: 'no-store', signal: AbortSignal.any([signal, timeout]) });
      data = await readJsonResponse(response);
      if (!response.ok) {
        if (response.status === 404) throw new Error(data.error);
        throw new Error(data.error || 'Koneksi ke server terputus.');
      }
      failures = 0;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Error && error.message.includes('kedaluwarsa')) throw error;
      if (++failures >= 5) throw new Error('Server belum dapat dihubungi. Periksa koneksi internet, lalu coba lagi.');
      progress('Koneksi terputus sebentar. Mencoba menghubungkan kembali...');
      await pause(signal);
      continue;
    }
    if (data.status === 'done') return data.result;
    if (data.status === 'failed') throw new Error(data.error || 'Pencarian gagal. Silakan coba lagi.');
    progress(data.status === 'queued' ? 'Menunggu giliran pencarian...' : `Menelusuri jalur: ${data.completed}/${data.total} pencarian selesai.`);
    await pause(signal);
  }
  throw new DOMException('Aborted', 'AbortError');
}
