// Railway worker: loops forever, resuming from import_jobs checkpoints after any restart.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_MODE=novels|comics|both, WORKER_BATCH=25, WORKER_SLEEP_MIN=15
import { spawn } from 'node:child_process';
const mode = process.env.WORKER_MODE || 'both', batch = process.env.WORKER_BATCH || '10', sleepMs = Number(process.env.WORKER_SLEEP_MIN || 30) * 60000;
const run = (f, extra = []) => new Promise((res) => spawn('node', [f, `--limit=${batch}`, ...extra], { stdio: 'inherit' }).on('close', res));
for (;;) {
  try {
    if (mode !== 'comics') await run('scripts/ingest/run-novels.mjs', ['--concurrency=2']);
    if (mode !== 'novels') await run('scripts/ingest/run-comics.mjs');
  } catch (e) { console.error('cycle error', e); }
  await new Promise((r) => setTimeout(r, sleepMs));
}
