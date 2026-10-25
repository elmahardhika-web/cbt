// Salin semua keluaran konsol & error fatal ke DATA_DIR/app.log agar bisa diperiksa tanpa akses Docker.
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const dir = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, '..', 'data'));
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'app.log');
try { if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, `${file}.1`); } catch { /* belum ada */ }

const tulis = (lvl, args) => {
  try { fs.appendFileSync(file, `${new Date().toISOString()} ${lvl} ${util.format(...args)}\n`, { mode: 0o644 }); } catch { /* abaikan */ }
};
for (const lvl of ['log', 'error', 'warn']) {
  const asli = console[lvl].bind(console);
  console[lvl] = (...a) => { tulis(lvl.toUpperCase(), a); asli(...a); };
}
process.on('uncaughtException', (e) => { tulis('FATAL', [e]); console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => { tulis('FATAL', [e]); console.error(e); process.exit(1); });
tulis('INFO', [`Memulai TKA 2026 · Node ${process.version} · data ${dir}`]);
