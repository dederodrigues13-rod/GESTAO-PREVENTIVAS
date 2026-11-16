// =====================================================================
// App instalável (PWA): botão "Instalar app" + service worker
// =====================================================================
import { abrirModal, ic } from './ui.js';

let promptInstalar = null;
const ouvintes = new Set();

export const estaInstalado = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalar = e;
  ouvintes.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  promptInstalar = null;
  ouvintes.forEach((f) => f());
});

export function aoMudarInstalacao(f) { ouvintes.add(f); }

export async function instalarApp() {
  if (promptInstalar) {
    promptInstalar.prompt();
    await promptInstalar.userChoice.catch(() => {});
    promptInstalar = null;
    return;
  }
  const passos = ehIOS()
    ? `<ol class="passos">
         <li>Abra este endereço no <b>Safari</b>.</li>
         <li>Toque no botão <b>Compartilhar</b> ${ic('share', 'ic-sm')} na barra de baixo.</li>
         <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
       </ol>`
    : `<ol class="passos">
         <li>Abra este endereço no <b>Google Chrome</b>.</li>
         <li>Toque no menu <b>⋮</b> (canto superior direito).</li>
         <li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
       </ol>`;
  abrirModal({
    titulo: 'Instalar o app',
    tamanho: 'sm',
    html: `<p class="muted" style="margin-top:0">O ícone do Gestão de Preventivas vai para a tela inicial do celular, como um aplicativo.</p>
      <style>.passos{padding-left:22px;margin:0;display:flex;flex-direction:column;gap:12px;font-size:17px}.passos .ic{vertical-align:-3px}</style>
      ${passos}`,
  });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
