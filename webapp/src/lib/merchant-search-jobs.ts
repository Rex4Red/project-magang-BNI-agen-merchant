import { randomUUID } from 'node:crypto';
import { searchMerchants } from './merchant-search';
import type { Point } from './road-geometry';

type Job = {
  id: string; status: 'queued' | 'running' | 'done' | 'failed';
  completed: number; total: number; updatedAt: number;
  result?: Awaited<ReturnType<typeof searchMerchants>>; error?: string;
};
type Queue = { jobs: Map<string, Job>; tasks: (() => Promise<void>)[]; running: boolean };
const runtime = globalThis as typeof globalThis & { merchantSearchQueue?: Queue };
const queue: Queue = runtime.merchantSearchQueue ??= { jobs: new Map(), tasks: [], running: false };

function cleanup() {
  for (const [id, job] of queue.jobs) {
    if ((job.status === 'done' || job.status === 'failed') && Date.now() - job.updatedAt > 30 * 60_000) queue.jobs.delete(id);
  }
}

async function drain() {
  if (queue.running) return;
  queue.running = true;
  try { while (queue.tasks.length) await queue.tasks.shift()!(); }
  finally { queue.running = false; }
}

export function startMerchantSearch(path: Point[], width: number, roadName: string): Job | null {
  cleanup();
  if ([...queue.jobs.values()].filter(job => job.status === 'queued' || job.status === 'running').length >= 4) return null;
  const job: Job = { id: randomUUID(), status: 'queued', completed: 0, total: 0, updatedAt: Date.now() };
  queue.jobs.set(job.id, job);
  queue.tasks.push(async () => {
    job.status = 'running';
    try {
      job.result = await searchMerchants(path, width, roadName, (completed, total) => {
        job.completed = completed; job.total = total; job.updatedAt = Date.now();
      });
      job.status = 'done';
    } catch {
      job.status = 'failed'; job.error = 'Pencarian Google Maps gagal. Silakan coba lagi.';
    }
    job.updatedAt = Date.now();
  });
  void drain();
  return job;
}

export function merchantSearchJob(id: string): Job | undefined { cleanup(); return queue.jobs.get(id); }
