// Cara membangun ulang peta (public/data/peta/*.json):
//   1. Unduh "Kab_Kota SHP.7z.00x" dari github.com/Alf-Anas/batas-administrasi-indonesia lalu ekstrak (7za x "Kab_Kota SHP.7z.001" -okab)
//   2. npx mapshaper kab/Kab_Kota.shp -filter-fields KODE_KK,KAB_KOTA,KODE_PROV,PROVINSI -simplify interval=120 keep-shapes -clean -o format=geojson precision=0.0001 kab-halus.json
//      npx mapshaper kab-halus.json -dissolve PROVINSI copy-fields=KODE_PROV -simplify interval=1500 keep-shapes -clean -o format=geojson precision=0.001 prov-kasar.json
//      npx mapshaper kab-halus.json -points inner -o format=geojson kab-titik.json
//      npx mapshaper kab-halus.json -dissolve PROVINSI -points inner -o format=geojson prov-titik.json
//   3. node bangun-peta.mjs <folder keluar> public/data/wilayah.json <provinsi.json lama, untuk nama ibukota>
// Bangun berkas peta (SVG path) dari github.com/Alf-Anas/batas-administrasi-indonesia (BIG, 38 provinsi, 514 kab/kota).
// Masukan: hasil mapshaper (kab-halus.json, prov-kasar.json, kab-titik.json, prov-titik.json). Keluaran: public/data/peta/*.json
import fs from 'node:fs';
import path from 'node:path';
const [,, keluar, wilayahJson, lamaJson] = process.argv;
const baca = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const wilayah = baca(wilayahJson).provinsi;
const lama = baca(lamaJson); // untuk nama ibukota provinsi
const K = 20, LNG0 = 94.8, LAT0 = 6.3;
const px = ([lng, lat]) => [(lng - LNG0) * K, (LAT0 - lat) * K];

// kode resmi Kepmendagri 2025: kab/kota di 4 provinsi baru Papua masih berkode lama di sumber → cocokkan nama
const norm = (s) => String(s).toLowerCase().replace(/^(kabupaten|kota)\s+/, '').replace(/administrasi\s+/, '').replace(/kep\.\s*/, 'kepulauan ').replace(/[^a-z]/g, '');
const provNama = Object.fromEntries(wilayah.map((p) => [norm(p.nama), p]));
const ALIAS_PROV = { dkijakarta: '31', daerahkhususibukotajakarta: '31' };
const kodeProv = (nama) => ALIAS_PROV[norm(nama)] || provNama[norm(nama)]?.kode;
const kabResmi = new Map(wilayah.flatMap((p) => p.kabkota.map((k) => [k.kode, { ...k, prov: p.kode }])));
function kodeKab(f) {
  const pk = kodeProv(f.PROVINSI);
  if (kabResmi.has(f.KODE_KK) && kabResmi.get(f.KODE_KK).prov === pk) return f.KODE_KK;
  const p = wilayah.find((x) => x.kode === pk);
  const kota = /^kota\b/i.test(f.KAB_KOTA);
  const k = p?.kabkota.find((x) => norm(x.nama) === norm(f.KAB_KOTA) && /^kota\b/i.test(x.nama) === kota);
  if (!k) throw new Error(`Kab/kota tidak cocok: ${f.KODE_KK} ${f.KAB_KOTA} (${f.PROVINSI})`);
  return k.kode;
}

const luas = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
const poligon = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
/** Path relatif (hemat ukuran). Pulau kecil < minLuas dibuang, kecuali bagian terbesar dari wilayah itu. Lubang (enclave) tetap ikut → render dengan fill-rule evenodd. */
function jalur(geom, desimal, minLuas) {
  const polys = poligon(geom).map((rings) => rings.map((r) => r.map(px)));
  const besar = Math.max(...polys.map((p) => luas(p[0])));
  const f = 10 ** desimal;
  let d = '', daratan = 0;
  const kotak = [Infinity, Infinity, -Infinity, -Infinity];
  const kotakUtama = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polys) {
    const L = luas(rings[0]);
    if (L < minLuas && L !== besar) continue;
    daratan += L - rings.slice(1).reduce((a, r) => a + luas(r), 0);
    for (const [ri, r] of rings.entries()) {
      if (ri > 0 && luas(r) < minLuas / 4) continue;
      let pts = r.map(([x, y]) => [Math.round(x * f), Math.round(y * f)]);
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts = pts.slice(0, -1);
      pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
      if (pts.length < 3) continue;
      const n = (v) => (v / f).toFixed(desimal).replace(/\.?0+$/, '').replace(/^(-?)0\./, '$1.') || '0';
      d += `M${n(pts[0][0])} ${n(pts[0][1])}l` + pts.slice(1).map((p, i) => `${n(p[0] - pts[i][0])} ${n(p[1] - pts[i][1])}`).join(' ').replace(/ -/g, '-') + 'z';
      for (const [x, y] of pts) { const X = x / f, Y = y / f; kotak[0] = Math.min(kotak[0], X); kotak[1] = Math.min(kotak[1], Y); kotak[2] = Math.max(kotak[2], X); kotak[3] = Math.max(kotak[3], Y); }
    }
  }
  return { d, kotak: kotak.map((v) => +v.toFixed(2)), daratan };
}
const titikDari = (fc, kunci) => Object.fromEntries(fc.features.map((f) => [kunci(f.properties), px(f.geometry.coordinates).map((v) => +v.toFixed(2))]));

const kab = baca('kab-halus.json');
const kabTitik = titikDari(baca('kab-titik.json'), (p) => kodeKab(p));
const provTitik = titikDari(baca('prov-titik.json'), (p) => kodeProv(p.PROVINSI));
const perProv = {};
for (const f of kab.features) {
  const kode = kodeKab(f.properties);
  const k = kabResmi.get(kode);
  const { d, kotak, daratan } = jalur(f.geometry, 2, 0.01);
  (perProv[k.prov] ||= []).push({ kode, nama: k.nama, x: kabTitik[kode][0], y: kabTitik[kode][1], kotak, d, daratan });
}
// kotak tampilan provinsi: gabungan kab/kota, tanpa kab/kota yang hanya berupa pulau-pulau kecil jauh (mis. Kepulauan Seribu)
const meta = { sumber: 'github.com/Alf-Anas/batas-administrasi-indonesia (batas BIG, 38 provinsi/514 kab-kota, Juni 2023), disederhanakan dengan mapshaper', proyeksi: { K, LNG0, LAT0 }, lebar: +((141.1 - LNG0) * K).toFixed(0), tinggi: +((LAT0 + 11.1) * K).toFixed(0) };
const prov = baca('prov-kasar.json').features.map((f) => {
  const kode = kodeProv(f.properties.PROVINSI);
  const p = wilayah.find((x) => x.kode === kode);
  const { d } = jalur(f.geometry, 1, 0.4);
  const kabs = perProv[kode];
  const total = kabs.reduce((a, k) => a + k.daratan, 0);
  // zoom provinsi: kab/kota berdaratan kecil (< 2%) yang letaknya jauh (mis. Kep. Seribu) tidak ikut, agar daratan utama tidak tampak mengecil
  const gabung = (list) => [Math.min(...list.map((k) => k.kotak[0])), Math.min(...list.map((k) => k.kotak[1])), Math.max(...list.map((k) => k.kotak[2])), Math.max(...list.map((k) => k.kotak[3]))];
  const dipakai = kabs.filter((k) => k.daratan >= total * 0.02 || kabs.length === 1);
  for (let ubah = true; ubah;) {
    ubah = false;
    const b = gabung(dipakai), batas = Math.max(b[2] - b[0], b[3] - b[1]) * 0.25;
    for (const k of kabs) {
      if (dipakai.includes(k)) continue;
      const jarak = Math.max(b[0] - k.kotak[2], k.kotak[0] - b[2], b[1] - k.kotak[3], k.kotak[1] - b[3], 0);
      if (jarak <= batas) { dipakai.push(k); ubah = true; }
    }
  }
  const lepas = kabs.filter((k) => !dipakai.includes(k)).map((k) => k.nama);
  if (lepas.length) console.log(kode, 'zoom tanpa:', lepas.join(', '));
  const kotak = gabung(dipakai);
  return { kode, nama: p.nama, ibukota: lama.provinsi.find((x) => x.kode === kode)?.ibukota || '', x: provTitik[kode][0], y: provTitik[kode][1], kotak, d };
}).sort((a, b) => a.kode.localeCompare(b.kode));

const dir = path.join(keluar, 'peta');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'provinsi.json'), JSON.stringify({ ...meta, provinsi: prov }));
fs.writeFileSync(path.join(dir, 'titik.json'), JSON.stringify(kabTitik));
for (const [kp, list] of Object.entries(perProv)) fs.writeFileSync(path.join(dir, `kab-${kp}.json`), JSON.stringify({ ...meta, kabkota: list.sort((a, b) => a.kode.localeCompare(b.kode)).map(({ daratan, kotak, ...k }) => k) }));
console.log('provinsi', prov.length, 'kab/kota', Object.values(perProv).flat().length, 'berkas kab', Object.keys(perProv).length);
