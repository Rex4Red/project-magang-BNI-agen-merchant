import { randomUUID } from 'node:crypto';
import { searchAgents, AgentSearchError, type AgentSearchInput, type AgentSearchData } from './agent-search';
import { classifyItems } from './classification';
import type { Prospect } from './canvasing';
import { classifyBusinessType } from './store-business-type';

export type AgentSearchResult = Omit<Awaited<ReturnType<typeof searchAgents>>, 'results'> & { results: Prospect[] };
function prepareResults(data: AgentSearchData): AgentSearchResult {
  return { ...data, results: data.results.map(store => {
    const business = classifyBusinessType(store.name, store.category);
    return { ...store, classification: business.decision === 'unknown'
      ? store.photoUrl ? undefined : { label: 'unavailable' as const, confidence: null, reason: 'no_photo' as const }
      : { label: business.decision, confidence: null, reason: null, source: 'business_type' as const, businessReason: business.reason } };
  }) };
}
type Job = {
  id: string; status: 'queued' | 'running' | 'done' | 'failed'; phase: 'searching' | 'classifying';
  completed: number; total: number; updatedAt: number; result?: AgentSearchResult; error?: string;
};
type Queue = { jobs: Map<string, Job>; tasks: (() => Promise<void>)[]; running: boolean };
const runtime = globalThis as typeof globalThis & { agentSearchQueue?: Queue };
const queue: Queue = runtime.agentSearchQueue ??= { jobs: new Map(), tasks: [], running: false };
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
export function startAgentSearch(input: AgentSearchInput): Job | null {
  cleanup();
  if ([...queue.jobs.values()].filter(j => j.status === 'queued' || j.status === 'running').length >= 4) return null;
  const job: Job = { id: randomUUID(), status: 'queued', phase: 'searching', completed: 0, total: 0, updatedAt: Date.now() };
  queue.jobs.set(job.id, job);
  queue.tasks.push(async () => {
    job.status = 'running';
    try {
      const data = await searchAgents(input, (completed, total) => { job.completed = completed; job.total = total; job.updatedAt = Date.now(); }, partial => { job.result = prepareResults(partial); });
      const result = prepareResults(data);
      job.result = result;
      const photos = result.results.filter(store => store.photoUrl && !store.classification);
      job.phase = 'classifying'; job.completed = 0; job.total = photos.length;
      let failedBatches = 0;
      for (let offset = 0; offset < photos.length; offset += 25) {
        const batch = photos.slice(offset, offset + 25);
        let predictions: Map<string, NonNullable<Prospect['classification']>>;
        try {
          const classified = await classifyItems(batch.map(store => ({ id: store.id, name: store.name, category: store.category, photoUrl: store.photoUrl })));
          const found = new Map(classified.map(item => [item.id, item]));
          predictions = new Map(batch.map(store => [store.id, found.get(store.id) || { label: 'unavailable', confidence: null, reason: 'request_failed' }]));
        } catch {
          failedBatches++;
          predictions = new Map(batch.map(store => [store.id, { label: 'unavailable', confidence: null, reason: 'request_failed' }]));
        }
        result.results = result.results.map(store => ({ ...store, classification: predictions.get(store.id) || store.classification }));
        job.completed = Math.min(offset + batch.length, photos.length); job.updatedAt = Date.now();
      }
      if (failedBatches) result.warning = [result.warning, `${failedBatches} batch gagal diklasifikasi. Toko terdampak ditandai Klasifikasi gagal.`].filter(Boolean).join(' ');
      job.status = 'done';
    } catch (error) {
      job.status = 'failed'; job.error = error instanceof AgentSearchError ? error.message : 'Pencarian Google Maps gagal. Silakan coba lagi.';
    }
    job.updatedAt = Date.now();
  });
  void drain();
  return job;
}
export function agentSearchJob(id: string) { cleanup(); return queue.jobs.get(id); }
