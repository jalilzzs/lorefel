// Railway worker: (1) serves the reader API (chapters fetched on demand, nothing stored), (2) loops forever importing METADATA only.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORT (set by Railway), WORKER_MODE=novels|comics|both, WORKER_BATCH, WORKER_SLEEP_MIN,
//      CYCLE_TARGET, CYCLE_MAX_MIN, WORKER_LANGS, ENRICH_BATCH (default 120), DISK_LIMIT_MB (default 400: importing pauses above it), IMPORTER_CONTACT
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { startReaderServer } from './reader-api.mjs';

const mode = process.env.WORKER_MODE || 'both', batch = process.env.WORKER_BATCH || '25', sleepMs = Number(process.env.WORKER_SLEEP_MIN || 15) * 60000;
const LIMIT = Number(process.env.DISK_LIMIT_MB || 400);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = (f, extra = []) => new Promise((res) => spawn('node', [f, ...extra], { stdio: 'inherit' }).on('close', res));
startReaderServer();

for (;;) {
  try {
    const { data: mb, error } = await db.rpc('db_size_mb');
    if (error) console.error('db_size_mb failed (run the SQL file first?):', error.message);
    if (!error && Number(mb) >= LIMIT) {
      console.warn(`DISK GUARD: database is ${mb} MB (limit ${LIMIT}). Import paused; nothing is written.`);
      await db.from('import_logs').insert({ level: 'warn', message: 'disk guard: import paused', detail: { mb, limit: LIMIT } });
    } else {
      if (mode !== 'comics') await run('scripts/ingest/run-multi.mjs');
      if (mode !== 'novels') await run('scripts/ingest/run-comics.mjs', [`--limit=${batch}`]);
      await run('scripts/ingest/enrich.mjs');
    }
    const { data: pruned } = await db.rpc('prune_import_logs', { days: 7 });
    if (pruned) console.log('pruned logs:', pruned);
  } catch (e) { console.error('cycle error', e); }
  await new Promise((r) => setTimeout(r, sleepMs));
}
