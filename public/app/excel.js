import { loadScript, unduhBlob, fmt } from './lib.js';
import { session } from './api.js';

async function XL() {
  await loadScript('/vendor/exceljs.min.js');
  return window.ExcelJS;
}

// palet sama dengan aplikasi: judul navy, kepala tabel biru muda, catatan kuning
const C = { title: 'FF0F2A4F', head: 'FFE6EEFB', sub: 'FFF4F7FC', note: 'FFFFF9EB', ex: 'FFF7F9FB', navy: 'FF0F2A4F', line: 'FFB5C0CE', warn: 'FFFDEFC8', soft: 'FFF2F6FD' };
const APP = () => session.info?.nama_aplikasi || 'TKA SD 2026';
const tglFile = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

/** Pengaturan cetak lembar kerja: A4, pas selebar halaman, judul kolom berulang, nomor halaman. */
function siapCetak(ws, { land = false, ulang } = {}) {
  ws.pageSetup = { ...ws.pageSetup, paperSize: 9, orientation: land ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.25 }, ...(ulang ? { printTitlesRow: ulang } : {}) };
  ws.headerFooter = { oddFooter: `&L&8${APP()} · diunduh ${fmt.tanggal(Date.now())}&R&8Halaman &P dari &N` };
}

/** Ambil gambar (logo/tanda tangan/stempel) dari URL unggahan untuk disisipkan ke Excel. */
async function gambar(wb, url) {
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    return wb.addImage({ base64: b64, extension: /png/.test(blob.type) ? 'png' : /gif/.test(blob.type) ? 'gif' : 'jpeg' });
  } catch { return null; }
}
const kotaTtd = (s) => s?.kota_ttd || (s?.kabkota || '').replace(/^(Kota Administrasi|Kabupaten Administrasi|Kabupaten|Kota)\s+/, '') || '[Kota]';
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const border = { top: { style: 'thin', color: { argb: C.line } }, left: { style: 'thin', color: { argb: C.line } }, bottom: { style: 'thin', color: { argb: C.line } }, right: { style: 'thin', color: { argb: C.line } } };
const FONT = 'Calibri';

function judul(ws, row, text, ncol, { argb = C.title, bold = true, size = 13, color = argb === C.title ? 'FFFFFFFF' : C.navy } = {}) {
  ws.mergeCells(row, 1, row, ncol);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: FONT, bold, size, color: { argb: color } };
  c.fill = fill(argb);
  c.alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(row).height = size > 12 ? 24 : 20;
}

function header(ws, row, labels, argb = C.head) {
  labels.forEach((l, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = l;
    c.font = { name: FONT, bold: true, color: { argb: C.navy } };
    c.fill = fill(argb);
    c.border = border;
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(row).height = 22;
}

function dataRow(ws, row, values, { numFmt = {}, align = {}, argb } = {}) {
  values.forEach((v, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = v ?? '';
    c.border = border;
    c.font = { name: FONT };
    if (numFmt[i]) c.numFmt = numFmt[i];
    if (align[i]) c.alignment = { horizontal: align[i] };
    if (argb) c.fill = fill(argb);
  });
}

async function simpan(wb, nama) {
  const buf = await wb.xlsx.writeBuffer();
  unduhBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nama);
}

const aman = (s) => String(s || '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_');

// ---------- template impor ----------
export const KOLOM_IMPOR = {
  siswa: [
    ['username', 'No. Peserta', 'Username login siswa. Kosongkan untuk dibuat otomatis.'],
    ['nama', 'Nama Lengkap *', 'Wajib.'],
    ['password', 'Password', `Kosongkan untuk password bawaan 123456.`],
    ['jk', 'L/P *', 'Pilih L atau P.'],
    ['kelas', 'Kelas *', 'Contoh 6A. Pilih dari daftar atau ketik.'],
    ['sesi', 'Sesi *', 'Sesi 1, Sesi 2, atau Sesi 3.'],
    ['nik', 'NIK', 'Opsional, 16 digit.'],
    ['tgl_lahir', 'Tanggal Lahir', 'Opsional, format HH/BB/TTTT.'],
  ],
  guru: [
    ['username', 'Username *', 'Untuk login guru.'],
    ['nama', 'Nama Lengkap *', 'Wajib.'],
    ['password', 'Password', 'Kosongkan untuk 123456.'],
    ['npsn', 'NPSN', 'Kosongkan untuk guru penulis pusat.'],
    ['kelas', 'Kelas', 'Kelas yang diampu (opsional).'],
    ['nip', 'NIP', 'Opsional.'],
  ],
  admin: [
    ['username', 'Username *', 'Untuk login admin sekolah.'],
    ['nama', 'Nama Lengkap *', 'Wajib.'],
    ['password', 'Password', 'Kosongkan untuk 123456.'],
    ['npsn', 'NPSN *', 'NPSN sekolah yang sudah terdaftar.'],
  ],
};

export async function templateImpor(peran, { sekolah, kelas = [], sesi = [] } = {}) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  wb.creator = APP();
  const kol = KOLOM_IMPOR[peran];
  const n = kol.length + 1;
  const ws = wb.addWorksheet(peran === 'siswa' ? 'Data Siswa' : `Data ${peran[0].toUpperCase()}${peran.slice(1)}`, { views: [{ state: 'frozen', ySplit: 5 }] });
  judul(ws, 1, `TEMPLATE IMPOR DATA ${peran.toUpperCase()} · ${APP().toUpperCase()}`, n);
  judul(ws, 2, sekolah ? `Sekolah: ${sekolah.nama} · NPSN ${sekolah.npsn}` : 'Berlaku untuk semua sekolah', n, { argb: C.sub, size: 11 });
  judul(ws, 3, 'Isi mulai baris 7 · Jangan ubah judul kolom (baris 5) · Kolom bertanda * wajib · Baris "contoh" boleh dihapus · Lihat lembar Petunjuk', n, { argb: C.note, bold: false, size: 11, color: 'FF6B3A08' });
  header(ws, 5, ['No', ...kol.map((k) => k[1])]);
  const contoh = {
    siswa: ['contoh', '010045001', 'Aisyah Putri Ramadhani', '', 'P', kelas[0] || '6A', 'Sesi 1', '', '12/05/2014'],
    guru: ['contoh', 'guru.bahasa', 'Nama Guru, S.Pd.', '', sekolah?.npsn || '', '6A', ''],
    admin: ['contoh', 'admin.sekolah', 'Nama Admin', '', '20104244'],
  }[peran];
  dataRow(ws, 6, contoh, { argb: C.ex });
  ws.getRow(6).eachCell((c) => { c.font = { name: FONT, italic: true, color: { argb: 'FF6B7A89' } }; });
  for (let r = 7; r <= 506; r++) {
    ws.getCell(r, 1).value = r - 6;
    for (let c = 1; c <= n; c++) ws.getCell(r, c).border = border;
    kol.forEach(([key], i) => {
      const cell = ws.getCell(r, i + 2);
      cell.numFmt = '@';
      if (key === 'jk') cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"L,P"'], showErrorMessage: true, errorTitle: 'L/P', error: 'Isi L atau P.' };
      if (key === 'sesi') cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['=Daftar!$B$2:$B$11'], showErrorMessage: false };
      if (key === 'kelas' && peran === 'siswa') cell.dataValidation = { type: 'list', allowBlank: true, formulae: ['=Daftar!$A$2:$A$61'], showErrorMessage: false };
      if (key === 'nik') cell.dataValidation = { type: 'textLength', operator: 'equal', allowBlank: true, formulae: [16], showErrorMessage: true, errorTitle: 'NIK', error: 'NIK harus 16 digit.' };
      if (key === 'npsn') cell.dataValidation = { type: 'textLength', operator: 'equal', allowBlank: true, formulae: [8], showErrorMessage: true, errorTitle: 'NPSN', error: 'NPSN harus 8 digit.' };
    });
  }
  ws.columns = [{ width: 8 }, ...kol.map(([key]) => ({ width: { nama: 34, username: 18, password: 16, jk: 7, kelas: 10, sesi: 12, nik: 22, tgl_lahir: 16, npsn: 14, nip: 22 }[key] || 16 }))];
  siapCetak(ws, { land: kol.length > 6, ulang: '5:5' });

  const pt = wb.addWorksheet('Petunjuk');
  pt.columns = [{ width: 26 }, { width: 80 }];
  judul(pt, 1, 'PETUNJUK PENGISIAN', 2);
  header(pt, 3, ['Kolom', 'Keterangan']);
  kol.forEach(([, label, ket], i) => dataRow(pt, 4 + i, [label, ket]));
  const akhir = 5 + kol.length;
  pt.getCell(akhir, 1).value = 'Catatan';
  pt.getCell(akhir, 2).value = 'Nomor peserta yang sudah terdaftar akan diperbarui atau dilewati sesuai pilihan saat impor. Sistem memeriksa semua baris sebelum menyimpan.';
  pt.getCell(akhir, 2).alignment = { wrapText: true };

  const dl = wb.addWorksheet('Daftar');
  dl.columns = [{ header: 'Kelas', width: 12 }, { header: 'Sesi', width: 12 }];
  const kelasList = kelas.length ? kelas : ['6A', '6B', '6C'];
  const sesiList = sesi.length ? sesi : ['Sesi 1', 'Sesi 2', 'Sesi 3'];
  kelasList.forEach((k, i) => { dl.getCell(i + 2, 1).value = k; });
  sesiList.forEach((s, i) => { dl.getCell(i + 2, 2).value = s; });
  header(dl, 1, ['Kelas', 'Sesi']);

  await simpan(wb, `Template_Impor_${peran[0].toUpperCase()}${peran.slice(1)}${sekolah ? `_${aman(sekolah.nama)}` : ''}.xlsx`);
}

const HEADER_ALIAS = {
  username: ['no. peserta', 'no peserta', 'nomor peserta', 'username', 'user'],
  nama: ['nama lengkap', 'nama', 'nama siswa', 'nama guru'],
  password: ['password', 'kata sandi', 'sandi'],
  jk: ['l/p', 'jk', 'jenis kelamin', 'gender'],
  kelas: ['kelas', 'rombel'],
  sesi: ['sesi'],
  nik: ['nik'],
  tgl_lahir: ['tanggal lahir', 'tgl lahir', 'tgl_lahir'],
  npsn: ['npsn'],
  nip: ['nip'],
};

function teksSel(v) {
  if (v == null) return '';
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text) return String(v.text);
    if (v.result !== undefined) return String(v.result);
  }
  return String(v).trim();
}

/** Baca file .xlsx (template baru maupun template lama) → baris objek. */
export async function bacaImpor(file) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((w) => w.state !== 'hidden') || wb.worksheets[0];
  let headerRow = 0;
  const map = {};
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found = {};
    row.eachCell((cell, col) => {
      const t = teksSel(cell.value).toLowerCase().replace(/\*/g, '').trim();
      for (const [key, alias] of Object.entries(HEADER_ALIAS)) if (alias.includes(t) && !found[key]) found[key] = col;
    });
    if (found.nama) { headerRow = r; Object.assign(map, found); break; }
  }
  if (!headerRow) throw new Error('Kolom "Nama Lengkap" tidak ditemukan. Gunakan template terbaru.');
  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const first = teksSel(row.getCell(1).value).toLowerCase();
    if (first === 'contoh') continue;
    const o = { _baris: r };
    for (const [k, col] of Object.entries(map)) o[k] = teksSel(row.getCell(col).value);
    if (Object.entries(o).some(([k, v]) => k !== '_baris' && v)) rows.push(o);
  }
  return rows;
}

// ---------- ekspor ----------
export async function eksporHasil(a, meta) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rekap Nilai', { views: [{ state: 'frozen', ySplit: 6 }] });
  const cols = ['Peringkat', 'No. Peserta', 'Nama Lengkap', 'L/P', 'Kelas', 'Sekolah', 'Skor Objektif', 'Skor Uraian', 'Nilai Akhir', 'Keterangan'];
  judul(ws, 1, `REKAP NILAI · ${meta.mapel} · ${meta.kategori}`, cols.length);
  judul(ws, 2, meta.lingkup, cols.length, { argb: C.sub, size: 11 });
  judul(ws, 3, `Peserta ${a.ringkasan.peserta} · Rata-rata ${fmt.angka(a.ringkasan.rata)} · Tertinggi ${fmt.angka(a.ringkasan.maks)} · Terendah ${fmt.angka(a.ringkasan.min)} · Capai target (≥ ${a.target}) ${fmt.persen(a.ringkasan.persen_tuntas)}`, cols.length, { argb: C.soft, bold: false, size: 11 });
  judul(ws, 4, `Diunduh ${fmt.hari(Date.now())} pukul ${fmt.jam(Date.now())}`, cols.length, { argb: 'FFFFFFFF', bold: false, size: 10, color: 'FF475569' });
  header(ws, 6, cols);
  a.ranking.forEach((p, i) => {
    dataRow(ws, 7 + i, [p.peringkat ?? '-', p.username, p.nama, p.jk, p.kelas, p.sekolah, p.skor_objektif, p.ada_manual ? (p.nilai == null ? 'menunggu' : p.skor_manual) : '-',
      p.nilai, p.nilai == null ? 'Menunggu koreksi' : p.nilai >= a.target ? 'Capai target' : 'Belum capai target'], { numFmt: { 8: '0.0' }, align: { 0: 'center', 3: 'center', 4: 'center' } });
    if (p.nilai != null && p.nilai < a.target) ws.getCell(7 + i, 10).fill = fill(C.warn);
  });
  ws.columns = [10, 14, 32, 6, 8, 30, 14, 12, 12, 18].map((width) => ({ width }));
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: cols.length } };
  siapCetak(ws, { land: true, ulang: '6:6' });
  await simpan(wb, `Nilai_${aman(meta.mapel)}_${aman(meta.kategori)}_${aman(meta.file)}_${tglFile()}.xlsx`);
}

export async function eksporLegger(d) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(d.kelas ? `Legger ${d.kelas}` : 'Legger', { views: [{ state: 'frozen', xSplit: 3, ySplit: 6 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:6' } });
  const base = ['No', 'No. Peserta', 'Nama Lengkap', 'L/P', 'Kelas'];
  const ncol = base.length + d.mapel.length * 3 + 3;
  judul(ws, 1, `LEGGER NILAI ${APP().toUpperCase()} · ${d.kategori.nama.toUpperCase()}`, ncol);
  judul(ws, 2, `${d.sekolah.nama} · NPSN ${d.sekolah.npsn} · Kelas ${d.kelas || 'Semua'}`, ncol, { argb: C.sub, size: 11 });
  judul(ws, 3, `Diunduh ${fmt.hari(Date.now())} pukul ${fmt.jam(Date.now())} · Target capaian ${d.target}`, ncol, { argb: 'FFFFFFFF', bold: false, size: 10, color: 'FF475569' });
  // isi dulu, baru gabung sel (menulis ke sel yang sudah digabung akan menimpa judulnya)
  header(ws, 5, [...base, ...d.mapel.flatMap((m) => [m.nama, '', '']), 'Rata-rata', 'Peringkat', 'Keterangan']);
  for (let c = 1; c <= ncol; c++) {
    const cell = ws.getCell(6, c);
    const j = c - base.length - 1;
    if (j >= 0 && j < d.mapel.length * 3) cell.value = ['Objektif', 'Uraian', 'Nilai'][j % 3];
    cell.font = { name: FONT, bold: true, color: { argb: C.navy } };
    cell.fill = fill(C.sub);
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  base.forEach((l, i) => ws.mergeCells(5, i + 1, 6, i + 1));
  d.mapel.forEach((m, i) => ws.mergeCells(5, base.length + 1 + i * 3, 5, base.length + 3 + i * 3));
  [0, 1, 2].forEach((i) => ws.mergeCells(5, base.length + d.mapel.length * 3 + 1 + i, 6, base.length + d.mapel.length * 3 + 1 + i));
  d.siswa.forEach((s, i) => {
    const r = 7 + i;
    const vals = [i + 1, s.username, s.nama, s.jk, s.kelas];
    let ket = s.rata == null ? '' : s.rata >= d.target ? 'Capai target' : 'Belum capai target';
    for (const m of d.mapel) {
      const n = s.nilai[m.kode];
      if (n.status === 'absen' || n.status === 'belum') { vals.push('-', '-', '-'); ket = ket || (n.status === 'absen' ? `Tidak hadir ${m.nama}` : `Belum ujian ${m.nama}`); }
      else vals.push(n.objektif, n.ada_manual ? n.manual ?? 'menunggu' : '-', n.nilai ?? '-');
      if (n.status === 'menunggu') ket = ket || `Menunggu koreksi ${m.nama}`;
    }
    vals.push(s.rata ?? '-', s.peringkat ?? '-', ket);
    dataRow(ws, r, vals, { align: { 0: 'center', 3: 'center', 4: 'center' } });
    d.mapel.forEach((m, j) => { const c = ws.getCell(r, base.length + 3 + j * 3); c.font = { name: FONT, bold: true }; c.fill = fill(C.soft); c.numFmt = '0.0'; });
    ws.getCell(r, ncol - 2).numFmt = '0.0';
    ws.getCell(r, ncol - 2).font = { name: FONT, bold: true };
    if (ket.startsWith('Belum')) ws.getCell(r, ncol).fill = fill(C.warn);
  });
  const sr = 8 + d.siswa.length;
  [['Rata-rata kelas', 'rata'], ['Nilai tertinggi', 'maks'], ['Nilai terendah', 'min'], ['Persentase capai target', 'persen_tuntas']].forEach(([label, key], i) => {
    ws.mergeCells(sr + i, 1, sr + i, base.length);
    ws.getCell(sr + i, 1).value = label;
    ws.getCell(sr + i, 1).font = { name: FONT, bold: true };
    d.mapel.forEach((m, j) => { const c = ws.getCell(sr + i, base.length + 3 + j * 3); c.value = d.ringkasan[m.kode]?.[key] ?? '-'; c.font = { name: FONT, bold: true }; c.numFmt = '0.0'; });
    for (let c = 1; c <= ncol; c++) { ws.getCell(sr + i, c).border = border; ws.getCell(sr + i, c).fill = fill('FFF8FAFC'); }
  });
  const tr = sr + 6;
  ws.getCell(tr, 3).value = `Wali Kelas ${d.kelas || ''},`;
  ws.getCell(tr, ncol - 3).value = `${kotaTtd(d.sekolah)}, ${fmt.tanggal(Date.now())}`;
  ws.getCell(tr + 1, ncol - 3).value = 'Kepala Sekolah,';
  ws.getCell(tr + 5, 3).value = '[Nama Wali Kelas]';
  ws.getCell(tr + 5, ncol - 3).value = d.sekolah.kepala_sekolah || '[Nama Kepala Sekolah]';
  ws.getCell(tr + 6, 3).value = 'NIP ';
  ws.getCell(tr + 6, ncol - 3).value = `NIP ${d.sekolah.nip_kepsek || ''}`;
  [ws.getCell(tr + 5, 3), ws.getCell(tr + 5, ncol - 3)].forEach((c) => { c.font = { name: FONT, bold: true, underline: true }; });
  // tanda tangan kepala sekolah (bila sudah diunggah sekolah)
  // stempel & tanda tangan kepala sekolah (bila sudah diunggah sekolah)
  const stempel = await gambar(wb, d.sekolah.stempel_url);
  if (stempel) ws.addImage(stempel, { tl: { col: ncol - 4.6, row: tr + 0.6 }, ext: { width: 84, height: 84 } });
  const ttd = await gambar(wb, d.sekolah.ttd_url);
  if (ttd) ws.addImage(ttd, { tl: { col: ncol - 4, row: tr + 1 }, ext: { width: 140, height: 56 } });
  ws.columns = [6, 14, 30, 6, 8, ...d.mapel.flatMap(() => [10, 9, 9]), 11, 10, 24].map((width) => ({ width }));
  siapCetak(ws, { land: true, ulang: '5:6' });
  await simpan(wb, `Legger_${aman(d.kategori.kode)}_${aman(d.kelas || 'Semua')}_${aman(d.sekolah.nama)}_${tglFile()}.xlsx`);
}

export async function eksporAnalisis(a, meta) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const r = a.ringkasan;
  const s1 = wb.addWorksheet('Ringkasan');
  judul(s1, 1, `ANALISIS HASIL · ${meta.mapel} · ${meta.kategori}`, 4);
  judul(s1, 2, meta.lingkup, 4, { argb: C.sub, size: 11 });
  header(s1, 4, ['Ukuran', 'Nilai', '', '']);
  [['Peserta', r.peserta], ['Sekolah', r.sekolah], ['Menunggu koreksi', r.menunggu_koreksi], ['Rata-rata', r.rata], ['Median', r.median], ['Simpangan baku', r.sd],
    ['Tertinggi', r.maks], ['Terendah', r.min], [`Capai target (≥ ${a.target})`, `${r.tuntas} siswa (${fmt.persen(r.persen_tuntas)})`]].forEach((x, i) => dataRow(s1, 5 + i, x));
  s1.columns = [{ width: 24 }, { width: 22 }];

  const s2 = wb.addWorksheet('Ranking', { views: [{ state: 'frozen', ySplit: 1 }] });
  header(s2, 1, ['Peringkat', 'No. Peserta', 'Nama', 'Kelas', 'Sekolah', 'Kelurahan', 'Kecamatan', 'Kab/Kota', 'Provinsi', 'Nilai']);
  a.ranking.forEach((p, i) => dataRow(s2, 2 + i, [p.peringkat ?? '-', p.username, p.nama, p.kelas, p.sekolah, p.kelurahan, p.kecamatan, p.kabkota, p.provinsi, p.nilai ?? 'menunggu'], { numFmt: { 9: '0.0' } }));
  s2.columns = [10, 14, 30, 8, 30, 18, 18, 30, 26, 10].map((width) => ({ width }));
  s2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };

  const s3 = wb.addWorksheet('Butir Soal', { views: [{ state: 'frozen', ySplit: 1 }] });
  header(s3, 1, ['Urutan', 'No. Soal', 'Tipe', 'Cuplikan', 'Jawaban', '% Benar', 'Kesukaran', 'Daya Beda', 'Kualitas', 'Kunci', 'Sebaran Opsi']);
  a.butir.forEach((b, i) => dataRow(s3, 2 + i, [i + 1, b.nomor, b.tipe, b.cuplikan, b.n, b.persen_benar, b.kesukaran, b.daya_beda, b.kualitas_daya_beda, b.kunci || '',
    b.sebaran_opsi ? b.sebaran_opsi.map((o) => `${o.kode}:${o.n}`).join('  ') : ''], { numFmt: { 5: '0.0', 7: '0.00' } }));
  s3.columns = [8, 9, 20, 60, 9, 9, 11, 10, 13, 7, 26].map((width) => ({ width }));
  [s1, s2, s3].forEach((w, i) => siapCetak(w, { land: i > 0, ulang: i ? '1:1' : undefined }));

  const s4 = wb.addWorksheet('Kelompok');
  header(s4, 1, ['Peringkat', 'Kelompok', 'Bagian dari', 'Sekolah', 'Peserta', 'Rata-rata', 'Median', 'Tertinggi', 'Terendah', '% Capai target']);
  a.grup.items.forEach((g, i) => dataRow(s4, 2 + i, [g.peringkat, g.nama, g.induk, g.jml_sekolah, g.n, g.rata, g.median, g.maks, g.min, g.persen_tuntas], { numFmt: { 5: '0.0', 6: '0.0', 9: '0.0' } }));
  s4.columns = [10, 34, 40, 9, 9, 10, 10, 10, 10, 10].map((width) => ({ width }));

  const s5 = wb.addWorksheet('Sebaran Nilai');
  header(s5, 1, ['Rentang', 'Jumlah Siswa']);
  a.distribusi.forEach((d, i) => dataRow(s5, 2 + i, [d.label, d.n]));
  s5.columns = [{ width: 14 }, { width: 14 }];

  await simpan(wb, `Analisis_${aman(meta.mapel)}_${aman(meta.kategori)}_${aman(meta.file)}_${tglFile()}.xlsx`);
}

export async function eksporAkumulatif(a, meta) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ranking Akumulatif', { views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }] });
  const cols = ['Peringkat', 'No. Peserta', 'Nama', 'Kelas', 'Sekolah', 'Kab/Kota', ...a.mapel.map((m) => m.nama), 'Jumlah', 'Rata-rata', 'Keterangan'];
  judul(ws, 1, `HASIL AKUMULATIF SEMUA MATA PELAJARAN · ${meta.kategori}`, cols.length);
  judul(ws, 2, meta.lingkup, cols.length, { argb: C.sub, size: 11 });
  judul(ws, 3, `Siswa ${a.ringkasan.peserta} (lengkap ${a.ringkasan.lengkap}) · Rata-rata gabungan ${fmt.angka(a.ringkasan.rata)} · Capai target (≥ ${a.target}) ${fmt.persen(a.ringkasan.persen_tuntas)}`, cols.length, { argb: C.soft, bold: false, size: 11 });
  header(ws, 5, cols);
  a.ranking.forEach((p, i) => dataRow(ws, 6 + i, [p.peringkat ?? '-', p.username, p.nama, p.kelas, p.sekolah, p.kabkota,
    ...a.mapel.map((m) => p.nilai[m.kode] ?? '-'), p.jumlah, p.rata,
    !p.lengkap ? `Belum lengkap (${p.jml_mapel}/${a.mapel.length})` : p.rata >= a.target ? 'Capai target' : 'Belum capai target'], { numFmt: { [7 + a.mapel.length]: '0.0' } }));
  ws.columns = [10, 14, 30, 8, 30, 26, ...a.mapel.map(() => 12), 10, 11, 22].map((width) => ({ width }));
  siapCetak(ws, { land: true, ulang: '5:5' });
  const s2 = wb.addWorksheet('Per Mapel');
  header(s2, 1, ['Mata pelajaran', 'Peserta', 'Rata-rata', 'Tertinggi', 'Terendah', '% Capai target']);
  a.per_mapel.forEach((m, i) => dataRow(s2, 2 + i, [m.nama, m.n, m.rata, m.maks, m.min, m.persen_tuntas]));
  s2.columns = [28, 10, 11, 11, 11, 14].map((width) => ({ width }));
  const s3 = wb.addWorksheet('Kelompok');
  header(s3, 1, ['Peringkat', 'Kelompok', 'Bagian dari', 'Siswa', 'Rata-rata gabungan', ...a.mapel.map((m) => m.nama), '% Capai target']);
  a.grup.items.forEach((g, i) => dataRow(s3, 2 + i, [g.peringkat, g.nama, g.induk, g.n, g.rata, ...a.mapel.map((m) => g.per_mapel[m.kode] ?? '-'), g.persen_tuntas]));
  s3.columns = [10, 32, 36, 8, 16, ...a.mapel.map(() => 12), 14].map((width) => ({ width }));
  await simpan(wb, `Akumulatif_${aman(meta.kategori)}_${aman(meta.file)}_${tglFile()}.xlsx`);
}

/** Rekap & analisis semua try out. */
export async function eksporRekapTryout(a, meta) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const K = a.kategori, M = a.mapel;
  const ws = wb.addWorksheet('Rekap Siswa', { views: [{ state: 'frozen', xSplit: 3, ySplit: 6 }] });
  const cols = ['Peringkat', 'No. Peserta', 'Nama', 'Kelas', 'Sekolah', 'Kab/Kota', ...K.map((k) => k.nama), 'Rata-rata', 'Perubahan', 'Try out diikuti', 'Keterangan'];
  judul(ws, 1, 'REKAP NILAI SEMUA TRY OUT', cols.length);
  judul(ws, 2, meta.lingkup, cols.length, { argb: C.sub, size: 11 });
  judul(ws, 3, `Siswa ${a.ringkasan.siswa} · Rata-rata ${fmt.angka(a.ringkasan.rata)} · Naik ${a.ringkasan.naik}, turun ${a.ringkasan.turun} · Target capaian ${a.target}`, cols.length, { argb: C.soft, bold: false, size: 11 });
  judul(ws, 4, `Nilai tiap try out = rata-rata ${M.map((m) => m.nama).join(', ')}. Perubahan = try out terakhir − try out pertama yang diikuti.`, cols.length, { argb: 'FFFFFFFF', bold: false, size: 10, color: 'FF475569' });
  header(ws, 6, cols);
  const nf = {};
  [...K.map((_, i) => 6 + i), 6 + K.length, 7 + K.length].forEach((i) => { nf[i] = '0.0'; });
  a.siswa.forEach((s, i) => dataRow(ws, 7 + i, [s.peringkat, s.username, s.nama, s.kelas, s.sekolah, s.kabkota, ...K.map((k) => s.tryout[k.kode]?.rata ?? '-'),
    s.rata, s.tren ?? '-', `${s.ikut}/${K.length}`, s.rata >= a.target ? 'Capai target' : 'Belum capai target'], { numFmt: nf }));
  ws.columns = [10, 14, 30, 8, 30, 26, ...K.map(() => 12), 11, 11, 13, 20].map((width) => ({ width }));
  siapCetak(ws, { land: true, ulang: '6:6' });

  const s2 = wb.addWorksheet('Rincian per Mapel', { views: [{ state: 'frozen', xSplit: 3, ySplit: 2 }] });
  const c2 = ['No. Peserta', 'Nama', 'Kelas', 'Sekolah', ...K.flatMap((k) => M.map((m) => `${k.nama} · ${m.nama}`)), ...M.map((m) => `Rata-rata ${m.nama}`)];
  header(s2, 2, c2);
  judul(s2, 1, 'NILAI PER MATA PELAJARAN TIAP TRY OUT', c2.length);
  a.siswa.forEach((s, i) => dataRow(s2, 3 + i, [s.username, s.nama, s.kelas, s.sekolah, ...K.flatMap((k) => M.map((m) => s.tryout[k.kode]?.nilai[m.kode] ?? '-')), ...M.map((m) => s.per_mapel[m.kode] ?? '-')]));
  s2.columns = [14, 30, 8, 30, ...K.flatMap(() => M.map(() => 14)), ...M.map(() => 14)].map((width) => ({ width }));

  const s3 = wb.addWorksheet('Per Try Out');
  header(s3, 1, ['Try out', 'Siswa', ...M.map((m) => m.nama), 'Rata-rata gabungan', 'Median', 'Tertinggi', 'Terendah', '% Capai target']);
  a.per_tryout.forEach((t, i) => dataRow(s3, 2 + i, [t.nama, t.n, ...M.map((m) => t.per_mapel[m.kode] ?? '-'), t.rata, t.median, t.maks, t.min, t.persen_tuntas]));
  s3.columns = [22, 10, ...M.map(() => 14), 18, 10, 10, 10, 14].map((width) => ({ width }));

  const s4 = wb.addWorksheet('Kelompok');
  header(s4, 1, ['Peringkat', 'Kelompok', 'Bagian dari', 'Siswa', ...K.map((k) => k.nama), 'Rata-rata', 'Perubahan', '% Capai target']);
  a.grup.items.forEach((g, i) => dataRow(s4, 2 + i, [g.peringkat, g.nama, g.induk, g.n, ...K.map((k) => g.per_tryout[k.kode] ?? '-'), g.rata, g.tren ?? '-', g.persen_tuntas]));
  s4.columns = [10, 32, 36, 8, ...K.map(() => 12), 11, 11, 14].map((width) => ({ width }));
  await simpan(wb, `Rekap_Try_Out_${aman(meta.file)}_${tglFile()}.xlsx`);
}

/** Dasbor capaian wilayah: rekap per kelompok. */
export async function eksporDasbor({ kelompok, semua, grup, target, lingkup, paket }) {
  const ExcelJS = await XL();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Per ${grup}`.slice(0, 31), { views: [{ state: 'frozen', ySplit: 5 }] });
  const cols = ['Peringkat', grup, 'Bagian dari', 'Sekolah', 'Siswa', 'Rata-rata', 'Median', 'Tertinggi', 'Terendah', '% Capai target', 'Sangat Baik', 'Baik', 'Cukup', 'Perlu Bimbingan'];
  judul(ws, 1, `DASBOR CAPAIAN WILAYAH · ${paket}`, cols.length);
  judul(ws, 2, `${lingkup} · dikelompokkan per ${grup.toLowerCase()}`, cols.length, { argb: C.sub, size: 11 });
  judul(ws, 3, `Siswa ${semua.n} · Rata-rata ${fmt.angka(semua.rata)} · Capai target (≥ ${target}) ${fmt.persen(semua.persen)}`, cols.length, { argb: C.soft, bold: false, size: 11 });
  header(ws, 5, cols);
  kelompok.forEach((g, i) => dataRow(ws, 6 + i, [i + 1, g.label, g.sub, g.sekolah, g.n, g.rata, g.median, g.maks, g.min, g.persen, ...g.predikat],
    { numFmt: { 5: '0.0', 6: '0.0', 7: '0.0', 8: '0.0', 9: '0.0' } }));
  ws.columns = [10, 32, 30, 9, 8, 10, 10, 10, 10, 13, 11, 8, 8, 14].map((width) => ({ width }));
  siapCetak(ws, { land: true, ulang: '5:5' });
  await simpan(wb, `Dasbor_${aman(lingkup)}_${aman(grup)}.xlsx`);
}
