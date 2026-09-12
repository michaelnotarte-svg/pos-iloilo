// Gold-standard backup: a single compressed pg_dump file (schema + data) that
// restores in one shot with pg_restore. Complements backup_supabase.mjs (which
// is JSON, no external tools). Requires the PostgreSQL client tools (pg_dump on
// PATH) and the DB connection string in .env.local as SUPABASE_DB_URL:
//
//   SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres
//   (Supabase dashboard → Project Settings → Database → Connection string → URI)
//
//   node scripts/backup_pg_dump.mjs
//
// Options (env vars):
//   BACKUP_DIR    where to write   (default: <home>/pos-backups)
//   BACKUP_KEEP   keep N days      (default: 30)
//
// Restore later with:
//   pg_restore --clean --if-exists -d "<SUPABASE_DB_URL>" <file>.dump
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const dbUrl = env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL in .env.local.')
  console.error('Get it from Supabase → Project Settings → Database → Connection string (URI),')
  console.error('then add:  SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres')
  process.exit(1)
}
// Confirm pg_dump is available
const ver = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' })
if (ver.error) {
  console.error('pg_dump not found on PATH. Install the PostgreSQL client tools (e.g. the')
  console.error('PostgreSQL Windows installer, or `winget install PostgreSQL.PostgreSQL`) and retry.')
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '')
const root = process.env.BACKUP_DIR || path.join(os.homedir(), 'pos-backups')
fs.mkdirSync(root, { recursive: true })
const outFile = path.join(root, `pos-${stamp}.dump`)

console.log(`${ver.stdout.trim()} → ${outFile}`)
// -Fc = custom (compressed, restorable); --no-owner/--no-privileges keep it portable.
const res = spawnSync('pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-f', outFile, dbUrl], { stdio: 'inherit' })
if (res.status !== 0) { console.error(`pg_dump failed (exit ${res.status}).`); process.exit(res.status || 1) }
const mb = (fs.statSync(outFile).size / 1048576).toFixed(1)
console.log(`Done. ${outFile} (${mb} MB)`)

// Prune old .dump files
const keep = Number(process.env.BACKUP_KEEP || 30)
const cutoff = Date.now() - keep * 86400000
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith('.dump')) continue
  const p = path.join(root, name)
  try { if (fs.statSync(p).mtimeMs < cutoff) { fs.rmSync(p); console.log(`Pruned ${name}`) } } catch { /* ignore */ }
}
