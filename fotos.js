// =====================================================================
// Fotos pelo celular (NOK e evidência de fechamento das ações)
// A foto é reduzida no próprio celular (lado maior 1280 px, JPEG) antes de
// subir: cerca de 150–300 KB cada, rápida mesmo com sinal fraco.
// =====================================================================
import { enviarFoto, urlFoto, guardarFotoLocal } from './store.js';
import { esc, ic, toast } from './ui.js';

export async function reduzir(arquivo, lado = 1280, qualidade = 0.72) {
  const bmp = await createImageBitmap(arquivo).catch(async () => {
    const img = new Image(); img.src = URL.createObjectURL(arquivo); await img.decode(); return img;
  });
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('não foi possível ler a foto'))), 'image/jpeg', qualidade));
}

// botão "Foto" (abre a câmera no celular) — devolve o caminho no armazenamento
export const botaoFoto = (attr, rotulo = 'Foto') => `<label class="btn btn-sec btn-sm btn-foto">${ic('camera')}<span>${rotulo}</span><input type="file" accept="image/*" capture="environment" ${attr} hidden /></label>`;
export async function tirarFoto(input, pasta) {
  const f = input.files?.[0]; input.value = '';
  if (!f) return null;
  const blob = await reduzir(f);
  const path = `${pasta}/${Date.now().toString(36)}.jpg`;
  guardarFotoLocal(path, blob);
  try { await enviarFoto(path, blob); } catch (e) { toast('A foto não subiu: ' + (e?.message || e), 'erro'); return null; }
  return path;
}

// miniaturas (carregam sozinhas); com "remover" quando editável
export const miniaturas = (paths = [], editavel = false) => paths.length ? `<div class="fotos">${paths.map((p) => `<figure class="foto" data-foto="${esc(p)}"><img alt="Foto" data-src="${esc(p)}" />${editavel ? `<button type="button" class="foto-x" data-rmfoto="${esc(p)}" aria-label="Remover foto">${ic('x')}</button>` : ''}</figure>`).join('')}</div>` : '';
export function carregarMiniaturas(el) {
  el.querySelectorAll('img[data-src]').forEach((img) => {
    const p = img.dataset.src; img.removeAttribute('data-src');
    urlFoto(p).then((u) => { img.src = u; img.closest('.foto').onclick = (e) => { if (!e.target.closest('[data-rmfoto]')) ampliar(u); }; }).catch(() => { img.alt = 'Foto indisponível'; });
  });
}
function ampliar(url) {
  const d = document.createElement('div'); d.className = 'foto-zoom'; d.innerHTML = `<img src="${url}" alt="Foto ampliada" /><button type="button" class="icone" aria-label="Fechar">${ic('x')}</button>`;
  d.onclick = () => d.remove(); document.body.append(d);
}
