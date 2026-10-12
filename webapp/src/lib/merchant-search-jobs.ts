import { randomUUID } from 'node:crypto';
import { searchMerchants, type MerchantSearchInput, type MerchantSearchResult } from './merchant-search';
import type { Point } from './road-geometry';

export type MerchantJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  completed: number;
  total: number;
  updatedAt: number;
  result?: MerchantSearchResult;
  error?: string;
};

type Queue = { jobs: Map<string, MerchantJob>; tasks: (() => Promise<void>)[]; running: boolean };
const runtime = globalThis as typeof globalThis & { merchantSearchQueue?: Queue };
const queue: Queue = runtime.merchantSearchQueue ??= { jobs: new Map(), tasks: [], running: false };

function cleanup() {
  for (const [id, job] of queue.jobs) {
    if ((job.status === 'done' || job.status === 'failed') && Date.now() - job.updatedAt > 30 * 60_000) {
      queue.jobs.delete(id);
    }
  }
}

async function drain() {
  if (queue.running) return;
  queue.running = true;
  try {
    while (queue.tasks.length) {
      const task = queue.tasks.shift();
      if (task) await task();
    }
  } finally {
    queue.running = false;
  }
}

export function startMerchantSearch(
  inputOrPath: MerchantSearchInput | Point[],
  width?: number,
  roadName?: string
): MerchantJob | null {
  cleanup();
  if ([...queue.jobs.values()].filter(job => job.status === 'queued' || job.status === 'running').length >= 4) {
    return null;
  }

  const job: MerchantJob = { id: randomUUID(), status: 'queued', completed: 0, total: 0, updatedAt: Date.now() };
  queue.jobs.set(job.id, job);

  const input: MerchantSearchInput = Array.isArray(inputOrPath)
    ? { mode: 'road', path: inputOrPath, width: width ?? 50, roadName: roadName ?? 'Jalur manual' }
    : inputOrPath;

  queue.tasks.push(async () => {
    job.status = 'running';
    try {
      job.result = await searchMerchants(input, (completed, total) => {
        job.completed = completed;
        job.total = total;
        job.updatedAt = Date.now();
      });
      job.status = 'done';
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : 'Pencarian Google Maps gagal. Silakan coba lagi.';
    }
    job.updatedAt = Date.now();
  });

  void drain();
  return job;
}

export function merchantSearchJob(id: string): MerchantJob | undefined {
  cleanup();
  return queue.jobs.get(id);
}
