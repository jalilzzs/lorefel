// Railway worker: loops forever, resuming from import_jobs checkpoints after any restart.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_MODE=novels|comics|both, WORKER_BATCH (comics per cycle), WORKER_SLEEP_MIN, CYCLE_TARGET (novels per cycle, default 400), CYCLE_MAX_MIN (default 90), WORKER_LANGS=ar,fr,zh,en
import { spawn } from 'node:child_process';
const mode = process.env.WORKER_MODE || 'both', batch = process.env.WORKER_BATCH || '25', sleepMs = Number(process.env.WORKER_SLEEP_MIN || 15) * 60000;
const langs = (process.env.WORKER_LANGS || 'en,fr,zh,ar').split(',').map((x) => x.trim()).filter(Boolean);
const run = (f, extra = []) => new Promise((res) => spawn('node', [f, `--limit=${batch}`, ...extra], { stdio: 'inherit' }).on('close', res));
for (;;) {
  try {
    if (mode !== 'comics') await new Promise((res) => spawn('node', ['scripts/ingest/run-multi.mjs'], { stdio: 'inherit' }).on('close', res));
    if (mode !== 'novels') await run('scripts/ingest/run-comics.mjs');
  } catch (e) { console.error('cycle error', e); }
  await new Promise((r) => setTimeout(r, sleepMs));
}
