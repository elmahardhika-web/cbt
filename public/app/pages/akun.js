import { html, useState, PERAN_LABEL } from '../lib.js';
import { Icon } from '../icons.js';
import { session, put } from '../api.js';
import { go } from '../router.js';
import { Shell, keluar } from '../layout.js';
import { Field, toast, toastErr, PageHead, Avatar } from '../ui.js';

export function Akun({ route }) {
  const u = session.user;
  const [f, setF] = useState({ lama: '', baru: '', ulang: '' });
  if (u.peran === 'siswa') { go('/ujian/akun'); return null; }
  const ganti = async (e) => {
    e.preventDefault();
    if (f.baru !== f.ulang) return toast('Konfirmasi password tidak sama.', 'err');
    try { await put('akun/password', { lama: f.lama, baru: f.baru }); toast('Password berhasil diganti.'); setF({ lama: '', baru: '', ulang: '' }); } catch (x) { toastErr(x); }
  };
  return html`<${Shell} route=${route}>
    <${PageHead} title="Akun Saya" />
    <section class="card pad row wrap">
      <${Avatar} nama=${u.nama} tone="violet" size=${56} />
      <span class="col grow" style="gap:2px"><strong style="font-size:18px">${u.nama}</strong><span class="small muted">${u.username} · ${PERAN_LABEL[u.peran]}${session.sekolah ? ` · ${session.sekolah.nama}` : ''}</span></span>
      ${!session.impersonator && html`<button class="btn btn-d" onClick=${keluar}><${Icon} n="logout" s=${18} />Keluar</button>`}
    </section>
    ${session.impersonator ? html`<div class="card pad small muted">Password tidak bisa diganti saat mode pratinjau.</div>` : html`
    <form class="card pad col" style="max-width:560px" onSubmit=${ganti}>
      <h2>Ganti password</h2>
      <${Field} label="Password lama"><input class="input" type="password" autocomplete="current-password" value=${f.lama} onInput=${(e) => setF((x) => ({ ...x, lama: e.target.value }))} required /><//>
      <${Field} label="Password baru" hint="min. 6 karakter"><input class="input" type="password" autocomplete="new-password" minlength="6" value=${f.baru} onInput=${(e) => setF((x) => ({ ...x, baru: e.target.value }))} required /><//>
      <${Field} label="Ulangi password baru"><input class="input" type="password" autocomplete="new-password" value=${f.ulang} onInput=${(e) => setF((x) => ({ ...x, ulang: e.target.value }))} required /><//>
      <button class="btn btn-p" style="align-self:flex-start">Simpan password</button>
    </form>`}
  <//>`;
}
