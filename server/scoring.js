// Penilaian otomatis per tipe soal. Mengembalikan skor (angka) atau null bila harus dikoreksi manual.

export const TIPE = ['pilihan_ganda', 'pilihan_ganda_kompleks', 'benar_salah', 'pg_kategori', 'menjodohkan', 'isian', 'uraian'];
export const TIPE_MANUAL = new Set(['uraian']);
export const DEFAULT_SKOR = { uraian: 5 };

const norm = (s) => String(s ?? '').toLowerCase().replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').trim();

export function isianKeys(kunci) {
  if (Array.isArray(kunci)) return kunci.map(norm).filter((k) => k && k !== '-');
  return String(kunci ?? '').split('|').map(norm).filter((k) => k && k !== '-');
}

/** Apakah soal ini dinilai manual oleh guru? */
export function isManual(soal) {
  if (TIPE_MANUAL.has(soal.tipe)) return true;
  if (soal.tipe === 'isian') return isianKeys(soal.kunci).length === 0;
  return false;
}

export function score(soal, jawaban) {
  const max = Number(soal.skor_maks) || 1;
  const k = soal.kunci;
  if (jawaban === null || jawaban === undefined || jawaban === '') return isManual(soal) ? null : 0;
  switch (soal.tipe) {
    case 'pilihan_ganda':
      return String(jawaban) === String(k) ? max : 0;
    case 'benar_salah':
      return norm(jawaban) === norm(k) ? max : 0;
    case 'pilihan_ganda_kompleks': {
      const a = new Set((Array.isArray(jawaban) ? jawaban : []).map(String));
      const b = new Set((Array.isArray(k) ? k : []).map(String));
      return a.size === b.size && [...b].every((x) => a.has(x)) ? max : 0;
    }
    case 'pg_kategori': {
      // benar hanya bila SEMUA pernyataan sesuai kunci (tanpa nilai parsial)
      const keys = Object.keys(k || {});
      if (!keys.length) return 0;
      return keys.every((id) => jawaban && String(jawaban[id]) === String(k[id])) ? max : 0;
    }
    case 'menjodohkan': {
      const keys = Object.keys(k || {});
      if (!keys.length) return 0;
      const benar = keys.filter((id) => jawaban && String(jawaban[id]) === String(k[id])).length;
      return Math.round((max * benar / keys.length) * 100) / 100;
    }
    case 'isian': {
      const keys = isianKeys(k);
      if (!keys.length) return null;
      return keys.includes(norm(jawaban)) ? max : 0;
    }
    case 'uraian':
      return null;
    default:
      return 0;
  }
}

export function isAnswered(tipe, jawaban) {
  if (jawaban === null || jawaban === undefined || jawaban === '') return false;
  if (Array.isArray(jawaban)) return jawaban.length > 0;
  if (typeof jawaban === 'object') return Object.keys(jawaban).length > 0;
  return String(jawaban).trim() !== '';
}

/** Butir yang wajib dijawab pada soal berisi banyak pernyataan/pasangan (kosong = soal biasa). */
export function butirWajib(soal) {
  const o = soal.opsi || {};
  if (soal.tipe === 'pg_kategori') return (o.items || []).map((x) => String(x.id));
  if (soal.tipe === 'menjodohkan') return (o.premis || []).map((x) => String(x.id));
  return [];
}

/** Sudah dijawab lengkap? Soal kategori/menjodohkan: semua pernyataan harus terisi. */
export function isLengkap(soal, jawaban) {
  const wajib = butirWajib(soal);
  if (!wajib.length) return isAnswered(soal.tipe, jawaban);
  if (!jawaban || typeof jawaban !== 'object') return false;
  return wajib.every((id) => jawaban[id] !== undefined && jawaban[id] !== null && jawaban[id] !== '');
}

export const predikat = (n) => (n == null ? '-' : n >= 90 ? 'Sangat Baik' : n >= 80 ? 'Baik' : n >= 70 ? 'Cukup' : 'Perlu Bimbingan');
