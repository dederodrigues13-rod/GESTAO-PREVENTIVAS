// Utilitários de interface (mesmo padrão do Gestão de Fluidos)
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ordemNatural = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const paraData = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
export const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const diaMes = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
export const horaBR = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export const dataHoraBR = (ts) => (ts ? `${dataBR(isoLocal(new Date(ts)))} ${horaBR(ts)}` : '');
export const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const semana = (iso) => SEM[paraData(iso).getDay()];
export function quando(dias) {
  if (dias == null) return '';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return dias > 1 ? `em ${dias} dias` : `há ${-dias} dias`;
}
export const duracao = (ms) => { const min = Math.max(0, Math.round(ms / 60000)); return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; };

const P = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  cubo: '<path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h2v2h-2zM19 15h2M15 19h2M19 19h2v2M21 15v2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  pena: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  voltar: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  lixo: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  grafico: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-9"/>',
  sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  alvo: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  historico: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  excel: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m8 13 4 4M12 13l-4 4"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  relogio: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chave: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-2-2z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/>',
  tv: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  tela: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
};
export const ic = (nome, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[nome] || ''}</svg>`;

export function toast(msg, tipo = 'ok') {
  const box = document.getElementById('toasts'); if (!box) return;
  const t = document.createElement('div'); t.className = `toast toast-${tipo}`; t.textContent = msg; box.append(t);
  setTimeout(() => { t.classList.add('saindo'); setTimeout(() => t.remove(), 300); }, 3200);
}
export function abrirModal({ titulo, html, onAbrir, largo = false }) {
  const fundo = document.createElement('div'); fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal ${largo ? 'modal-largo' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <header><h2>${esc(titulo)}</h2><button type="button" class="icone" data-fechar aria-label="Fechar">${ic('x')}</button></header>
    <div class="modal-corpo">${html}</div></div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', tecla);
  document.body.append(fundo); onAbrir?.(fundo.querySelector('.modal-corpo'), fechar);
  return fechar;
}

// números que sobem ao abrir a tela (mantém o que vem depois do número: "%", "/12"...)
export function contarNumeros(el, seletor = '[data-contar]') {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.querySelectorAll(seletor).forEach((n) => {
    const m = /^(\d+)(.*)$/s.exec(n.textContent.trim()); if (!m || +m[1] === 0) return;
    const alvo = +m[1], resto = m[2], t0 = performance.now(), dur = 750;
    const passo = (t) => { const p = Math.min(1, (t - t0) / dur); n.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3))) + resto; if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  });
}

// esqueleto da tela enquanto os dados chegam (no lugar do "Carregando…")
export const esqueleto = (rotulo = 'Carregando') => `<div class="pag esq-pag" role="status" aria-label="${rotulo}">
  <div class="esq-hero"><div class="esq-col"><i class="esq" style="width:30%;height:14px"></i><i class="esq" style="width:55%;height:64px"></i><i class="esq" style="width:70%;height:16px"></i><i class="esq" style="width:180px;height:44px;margin-top:10px"></i></div>
  <div class="esq-col"><i class="esq" style="width:40%;height:18px"></i><div class="esq-lin"><i class="esq" style="height:70px"></i><i class="esq" style="height:70px"></i></div><div class="esq-lin"><i class="esq" style="height:70px"></i><i class="esq" style="height:70px"></i></div></div></div>
  <div class="esq-bloco"><i class="esq" style="width:25%;height:20px"></i>${'<i class="esq" style="height:52px"></i>'.repeat(4)}</div></div>`;
