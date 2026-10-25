// Latar, gambar login, dan logo yang dapat diatur superadmin / sekolah.
import { session } from './api.js';

export const PRESET_LATAR = [
  ['bawaan', 'Gelombang Senja', '/img/latar.jpg'],
  ['palet', 'Gradasi Palet', '/img/latar-palet.svg'],
  ['aurora', 'Aurora Biru', '/img/latar-aurora.svg'],
  ['laut', 'Laut Toska', '/img/latar-laut.svg'],
  ['polos', 'Polos', null],
];

export function urlLatar(t = session.info?.tampilan) {
  if (!t) return '/img/latar.jpg';
  if (t.latar === 'gambar') return t.latar_url || '/img/latar.jpg';
  const p = PRESET_LATAR.find((x) => x[0] === t.latar);
  return p ? p[2] : '/img/latar.jpg';
}
export const urlLogin = (t = session.info?.tampilan) => t?.login_url || '/img/login.jpg';
/** Logo: logo sekolah untuk pengguna sekolah, selain itu logo aplikasi dari pusat. */
export const urlLogo = (sekolah = session.sekolah) => sekolah?.logo_url || session.info?.tampilan?.logo_url || null;
