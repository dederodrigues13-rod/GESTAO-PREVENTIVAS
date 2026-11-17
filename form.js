// =====================================================================
// Formulário da preventiva (celular) e relatório FR.06.08.002-A
//
// Fluxo: manutentor escaneia o QR -> responde OK / NOK / N.A. -> NOK pede o
// que foi encontrado e a ação (vira linha do plano de ação) -> assina com o
// dedo -> supervisor da área assina -> gerente de manutenção assina ->
// "Concluída" -> salvar PDF (igual ao papel) na pasta das preventivas.
// O rascunho é salvo a cada resposta (se a tela apagar, nada se perde).
// =====================================================================
import { SETORES, MESES, secoesPadrao, REV_ATUAL, formulario, secoesPreenchiveis } from './dados.js';
import { salvarRegistro, rascunhoDaProg, nomesUsados, novoId, registro as obterRegistro, recarregarRegistro, enviarPDF, baixarPDF, excluirRegistro } from './store.js';
import { esc, ic, dataBR, semana, dataHoraBR, duracao, toast, abrirModal } from './ui.js';
import { folhasA4, gerarPDF, salvarArquivo, nomeArquivo, carregarFotosRel } from './relatorio.js';
import { botaoFoto, tirarFoto, miniaturas, carregarMiniaturas } from './fotos.js';
import { hoje, ST } from './situacao.js';

// ---------- assinatura com o dedo ----------
export function padAssinatura(canvas) {
  const ctx = canvas.getContext('2d'); let riscos = 0, ult = null;
  const ajustar = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const img = riscos ? canvas.toDataURL() : null;
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#13213a'; ctx.lineWidth = 2.4;
    if (img) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, r.width, r.height); i.src = img; }
  };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ult = pos(e); riscos++; ctx.beginPath(); ctx.arc(ult[0], ult[1], 1.1, 0, Math.PI * 2); ctx.fillStyle = '#13213a'; ctx.fill(); });
  canvas.addEventListener('pointermove', (e) => { if (!ult) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...ult); ctx.lineTo(...p); ctx.stroke(); ult = p; });
  const fim = () => { ult = null; canvas.dispatchEvent(new Event('assinou')); };
  canvas.addEventListener('pointerup', fim); canvas.addEventListener('pointercancel', fim);
  new ResizeObserver(ajustar).observe(canvas); ajustar();
  const api = { vazio: () => riscos === 0, limpar: () => { riscos = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }, imagem: () => canvas.toDataURL('image/png'),
    // recebe a assinatura feita em tela cheia, encaixada no quadro sem distorcer
    colar: (url) => new Promise((ok) => { const i = new Image(); i.onload = () => { const r = canvas.getBoundingClientRect(); const k = Math.min(r.width / i.width, r.height / i.height); const w = i.width * k, h = i.height * k;
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(i, (r.width - w) / 2, (r.height - h) / 2, w, h); riscos = 1; canvas.dispatchEvent(new Event('assinou')); ok(); }; i.src = url; }) };
  // botão "Assinar em tela cheia" ligado a este quadro
  const bt = document.querySelector(`[data-cheia-pad="${canvas.id}"]`); if (bt) bt.onclick = () => assinarTelaCheia(api, bt.dataset.rotulo || 'Assinatura');
  return api;
}

// assinatura em tela cheia: o celular deitado vira um quadro grande (mais fácil e mais bonita)
async function assinarTelaCheia(padPequeno, rotulo) {
  const cena = document.createElement('div'); cena.className = 'ass-cheia';
  cena.innerHTML = `<div class="ass-cheia-lado"><span class="eyebrow">Assinatura</span><b>${esc(rotulo)}</b>
      <p class="sub ass-gire">Gire o celular para deitado: fica maior.</p>
      <button type="button" class="btn btn-pri" data-usar>Usar esta assinatura</button><button type="button" class="btn btn-sec" data-lmp>Limpar</button><button type="button" class="link" data-cancelar>Cancelar</button></div>
    <div class="ass-cheia-area"><canvas aria-label="Assine com o dedo"></canvas><span>Assine com o dedo em qualquer lugar da área clara</span></div>`;
  document.body.append(cena); document.body.classList.add('sem-rolagem');
  try { await document.documentElement.requestFullscreen?.(); await screen.orientation?.lock?.('landscape'); } catch (e) { /* o celular não deixa travar: segue assim mesmo */ }
  const grande = padAssinatura(cena.querySelector('canvas'));
  const fechar = async () => { try { screen.orientation?.unlock?.(); if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) { /* ok */ } cena.remove(); document.body.classList.remove('sem-rolagem'); };
  cena.querySelector('[data-lmp]').onclick = () => grande.limpar();
  cena.querySelector('[data-cancelar]').onclick = fechar;
  cena.querySelector('[data-usar]').onclick = async () => { if (grande.vazio()) { toast('Assine na área clara primeiro.', 'erro'); return; } const url = recortar(cena.querySelector('canvas')); await fechar(); await padPequeno.colar(url); };
}
// tira a sobra em branco em volta da assinatura
function recortar(c) {
  const ctx = c.getContext('2d'), { width: w, height: h } = c, d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return c.toDataURL('image/png');
  const m = 12; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
  const o = document.createElement('canvas'); o.width = x1 - x0; o.height = y1 - y0; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o.toDataURL('image/png');
}

const blocoAssinatura = (id, rotulo) => `
  <div class="ass">
    <div class="ass-topo"><label for="${id}-nome">${rotulo}</label><button type="button" class="link" data-limpar="${id}">Limpar assinatura</button></div>
    <input id="${id}-nome" class="campo" autocomplete="name" placeholder="Nome completo" list="${id}-lista" />
    <datalist id="${id}-lista">${nomesUsados().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <canvas class="ass-pad" id="${id}-pad" aria-label="Área para assinar com o dedo"></canvas>
    <div class="ass-pe"><p class="ass-dica">Assine com o dedo dentro do quadro</p><button type="button" class="btn btn-sec btn-sm" data-cheia-pad="${id}-pad" data-rotulo="${esc(rotulo)}">${ic('tela')} Assinar em tela cheia</button></div>
  </div>`;

// ---------- formulário ----------
export function telaFormulario(el, { maq, item, aoTerminar }) {
  const m = maq.maquina;
  let r = item && rascunhoDaProg(item.id);
  if (!r) r = { id: novoId(), prog: item?.id || null, codigo: m.codigo, ciclo: item?.ciclo || hoje().slice(0, 7), dataPrevista: item?.data || null,
    inicio: Date.now(), rev: REV_ATUAL, secoes: secoesPadrao(m), respostas: {}, plano: [], obs: '', status: 'rascunho' };
  const SECOES = formulario(r.rev).secoes, ORDEM_SECOES = secoesPreenchiveis(r.rev);
  const salvar = () => salvarRegistro(r);
  const [a, mm] = r.ciclo.split('-');
  const foraJanela = item && hoje() < item.janelaIni;
  const total = () => r.secoes.reduce((s, k) => s + SECOES[k].itens.length, 0);
  const respondidas = () => r.secoes.reduce((s, k) => s + SECOES[k].itens.filter((_, i) => r.respostas[`${k}.${i}`]?.v).length, 0);

  el.innerHTML = `
  <div class="form">
    <div class="form-barra">
      <a href="#painel" class="icone" aria-label="Voltar">${ic('voltar')}</a>
      <div><b>${esc(m.codigo)}</b><span data-prog></span></div>
      <div class="form-trilho"><i data-trilho></i></div>
    </div>
    <section class="form-cab">
      <p class="eyebrow">Relatório de manutenção preventiva · FR.06.08.002-A</p>
      <h1>${esc(m.codigo)}</h1>
      <p class="sub">${esc(m.equipamento)} · ${esc(m.modelo)} · ${esc(SETORES[m.setor].curto)}</p>
      ${item ? `<p class="ciclo">Preventiva de <b>${MESES[+mm - 1]}/${a}</b> · data sugerida ${semana(item.data)}, ${dataBR(item.data)}${item.reprogramada ? ' (reprogramada)' : ''}</p>` : ''}
      ${foraJanela ? `<p class="aviso">${ic('alert')}<span>Esta máquina só entra em preventiva em ${MESES[+mm - 1]}. Registrando agora, ela conta como <b>antecipada</b>.</span></p>` : ''}
      ${item?.st === 'atrasada' ? `<p class="aviso aviso-red">${ic('alert')}<span>Preventiva atrasada: a janela era ${MESES[+mm - 1]}/${a}.</span></p>` : ''}
      <div class="form-dados">
        <div><span>Início</span><b>${dataHoraBR(r.inicio)}</b></div>
        <div><span>Tempo até agora</span><b data-tempo>${duracao(Date.now() - r.inicio)}</b></div>
      </div>
    </section>
    <div class="modo-form"><span>Responder</span><div class="seg-modo" role="radiogroup" aria-label="Jeito de responder">
      <button type="button" role="radio" data-modo="passo">Um item por vez</button><button type="button" role="radio" data-modo="lista">Lista completa</button></div></div>
    <div data-passo></div>
    <div data-secoes></div>
    <div class="add-secoes" data-add></div>
    <div class="form-resto">
    <section class="bloco">
      <h2>Plano de ação</h2>
      <p class="sub">Cada item marcado como NOK entra aqui sozinho. Preencha quem resolve e até quando.</p>
      <div data-plano></div>
      <button type="button" class="btn btn-sec" data-addplano>${ic('plus')} Adicionar ação</button>
    </section>
    <section class="bloco">
      <h2>Observações</h2>
      <p class="nota">Limpeza do tanque de óleo deve ser realizada anualmente.</p>
      <textarea class="campo" rows="3" data-obs placeholder="Algo mais que o gestor precisa saber">${esc(r.obs)}</textarea>
    </section>
    <section class="bloco">
      <h2>Fechamento</h2>
      ${blocoAssinatura('man', 'Manutentor')}
      <div class="erros" data-erros hidden></div>
      <button type="button" class="btn btn-pri btn-grande" data-concluir>${ic('pena')} Concluir e assinar</button>
      <p class="sub centro">Depois de assinar, procure o supervisor da área. Em seguida assina o gerente de manutenção.</p>
    </section>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);

  function desenharSecoes() {
    $('[data-secoes]').innerHTML = r.secoes.map((k) => {
      const s = SECOES[k];
      return `<section class="bloco secao" data-sec="${k}">
        <div class="secao-topo"><h2>${esc(s.titulo)}</h2>${secoesPadrao(m).includes(k) ? '' : `<button type="button" class="link" data-tirar="${k}">Remover</button>`}</div>
        <ol class="itens">${s.itens.map((t, i) => {
          const key = `${k}.${i}`, v = r.respostas[key] || {};
          return `<li class="item ${v.v === 'nok' ? 'item-nok' : ''}" data-k="${key}">
            <p><span class="n">${i + 1}</span>${esc(t)}</p>
            <div class="seg" role="radiogroup" aria-label="Resposta do item ${i + 1}">
              ${['ok', 'nok', 'na'].map((o) => `<button type="button" role="radio" aria-checked="${v.v === o}" class="seg-${o}" data-v="${o}">${o === 'na' ? 'N.A.' : o.toUpperCase()}</button>`).join('')}
            </div>
            ${v.v === 'nok' ? `<div class="nok">
              <label>O que foi encontrado?<textarea class="campo" rows="2" data-f="obs">${esc(v.obs || '')}</textarea></label>
              <label>Ação a fazer<input class="campo" data-f="acao" value="${esc(v.acao || '')}" placeholder="Ex.: trocar mangueira de retorno" /></label>
              <div class="nok-fotos">${miniaturas(v.fotos, true)}${botaoFoto('data-fotoinput', v.fotos?.length ? 'Mais uma foto' : 'Tirar foto')}</div>
            </div>` : ''}
          </li>`;
        }).join('')}</ol></section>`;
    }).join('');
    const faltam = ORDEM_SECOES.filter((k) => !r.secoes.includes(k));
    $('[data-add]').innerHTML = faltam.length ? `<span>Adicionar seção:</span>${faltam.map((k) => `<button type="button" class="chip" data-addsec="${k}">${ic('plus')}${esc(SECOES[k].titulo.split(' · ')[0])}</button>`).join('')}` : '';
    desenharPlano(); progresso(); carregarMiniaturas($('[data-secoes]')); desenharPasso();
  }
  // ---------- um item por vez (celular) ----------
  let modo = (() => { try { return localStorage.getItem('prev-modo-form'); } catch { return null; } })() || (matchMedia('(max-width: 760px)').matches ? 'passo' : 'lista');
  const chaves = () => r.secoes.flatMap((k) => SECOES[k].itens.map((_, i) => `${k}.${i}`));
  let pi = chaves().findIndex((k) => !r.respostas[k]?.v); if (pi < 0) pi = chaves().length;
  const vibrar = () => { try { navigator.vibrate?.(15); } catch (e) { /* sem vibração */ } };
  function desenharPasso() {
    const f = $('.form'); f.classList.toggle('passo', modo === 'passo');
    el.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modo === modo)));
    const box = $('[data-passo]'); if (modo !== 'passo') { box.innerHTML = ''; f.classList.remove('passo-fim'); return; }
    const ks = chaves(), feitos = ks.filter((k) => r.respostas[k]?.v).length, fim = feitos === ks.length && pi >= ks.length;
    f.classList.toggle('passo-fim', fim);
    if (fim) {
      const c = (v) => ks.filter((k) => r.respostas[k]?.v === v).length;
      box.innerHTML = `<section class="bloco passo-ok"><div class="passo-check">${ic('check', 'ic-lg')}</div><h2>Todos os itens respondidos</h2>
        <p class="sub">${c('ok')} OK · ${c('nok')} NOK · ${c('na')} N.A.</p><div class="f-btns"><button type="button" class="btn btn-sec" data-pnav="rever">Revisar do começo</button></div>
        <p class="sub">Agora confira o plano de ação e assine logo abaixo.</p></section>`;
      return;
    }
    pi = Math.min(Math.max(0, pi), ks.length - 1);
    const key = ks[pi], [sk, si] = key.split('.'), v = r.respostas[key] || {}, sec = SECOES[sk];
    const nSec = r.secoes.indexOf(sk) + 1;
    box.innerHTML = `<section class="bloco passo-card" data-k="${key}">
      <div class="passo-topo"><span class="eyebrow">${esc(sec.titulo.split(' · ')[0])} · seção ${nSec} de ${r.secoes.length}</span><span class="muted">Item ${+si + 1} de ${sec.itens.length}</span></div>
      <div class="passo-trilhos">${r.secoes.map((k) => { const t = SECOES[k].itens.length, d = SECOES[k].itens.filter((_, i) => r.respostas[`${k}.${i}`]?.v).length; return `<i style="flex:${t}"><b style="width:${d / t * 100}%"></b></i>`; }).join('')}</div>
      <p class="passo-txt">${esc(sec.itens[+si])}</p>
      ${v.v === 'nok' ? `<div class="nok passo-nok">
        <label>O que foi encontrado?<textarea class="campo" rows="2" data-f="obs">${esc(v.obs || '')}</textarea></label>
        <label>Ação a fazer<input class="campo" data-f="acao" value="${esc(v.acao || '')}" placeholder="Ex.: trocar mangueira de retorno" /></label>
        <div class="nok-fotos">${miniaturas(v.fotos, true)}${botaoFoto('data-fotoinput', v.fotos?.length ? 'Mais uma foto' : 'Tirar foto')}</div>
        <button type="button" class="btn btn-pri btn-grande" data-pnav="prox">Continuar</button></div>` : ''}
      <div class="passo-bts">
        <button type="button" class="pb pb-nok ${v.v === 'nok' ? 'on' : ''}" data-pv="nok">${ic('x', 'ic-lg')}NOK</button>
        <button type="button" class="pb pb-ok ${v.v === 'ok' ? 'on' : ''}" data-pv="ok">${ic('check', 'ic-lg')}OK</button>
      </div>
      <div class="passo-pe"><button type="button" class="link" data-pnav="-1" ${pi === 0 ? 'disabled' : ''}>‹ Item anterior</button>
        <button type="button" class="pb-na ${v.v === 'na' ? 'on' : ''}" data-pv="na">Não se aplica</button>
        <button type="button" class="link" data-pnav="1" ${v.v ? '' : 'disabled'}>Próximo ›</button></div>
    </section>`;
    carregarMiniaturas(box);
  }
  function responderPasso(valor) {
    const ks = chaves(), key = ks[pi]; r.respostas[key] = { ...(r.respostas[key] || {}), v: valor }; salvar(); vibrar();
    if (valor !== 'nok') { const prox = ks.findIndex((k, j) => j > pi && !r.respostas[k]?.v); pi = prox >= 0 ? prox : (ks.every((k) => r.respostas[k]?.v) ? ks.length : pi + 1); }
    desenharSecoes();
    if (valor === 'nok') $('[data-passo] textarea')?.focus();
    else $('[data-passo]')?.scrollIntoView({ block: 'nearest' });
  }

  function desenharPlano() {
    const auto = r.secoes.flatMap((k) => SECOES[k].itens.map((t, i) => ({ key: `${k}.${i}`, t, k, i }))).filter((x) => r.respostas[x.key]?.v === 'nok');
    // linhas automáticas (NOK) + manuais
    r.plano = [
      ...auto.map((x) => { const old = r.plano.find((p) => p.key === x.key) || {}; return { key: x.key, item: `${SECOES[x.k].titulo.split(' · ')[0]} ${x.i + 1} · ${x.t}`, acao: r.respostas[x.key].acao || '', resp: old.resp || '', prazo: old.prazo || '' }; }),
      ...r.plano.filter((p) => !p.key),
    ];
    $('[data-plano]').innerHTML = r.plano.length ? r.plano.map((p, j) => `
      <div class="plano" data-j="${j}">
        ${p.key ? `<p class="plano-item">${esc(p.item)}</p><p class="plano-acao">${esc(p.acao) || '<i>escreva a ação no item acima</i>'}</p>`
          : `<input class="campo" data-p="item" value="${esc(p.item)}" placeholder="Item" /><input class="campo" data-p="acao" value="${esc(p.acao)}" placeholder="Ação" />`}
        <div class="plano-lin"><input class="campo" data-p="resp" value="${esc(p.resp)}" placeholder="Responsável" /><input class="campo" type="date" data-p="prazo" value="${esc(p.prazo)}" aria-label="Prazo" />
        ${p.key ? '' : `<button type="button" class="icone" data-rmplano="${j}" aria-label="Remover ação">${ic('x')}</button>`}</div>
      </div>`).join('') : '<p class="vazio-p">Nenhum NOK até agora.</p>';
  }
  function progresso() {
    const t = total(), f = respondidas();
    $('[data-prog]').textContent = ` · ${f} de ${t}`;
    $('[data-trilho]').style.width = (t ? f / t * 100 : 0) + '%';
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const li = b.closest('[data-k]');
    if (b.dataset.pv) { responderPasso(b.dataset.pv); return; }
    if (b.dataset.pnav) { const ks = chaves(), prox = ks.findIndex((k, j) => j > pi && !r.respostas[k]?.v);
      pi = b.dataset.pnav === 'rever' ? 0 : b.dataset.pnav === 'prox' ? (prox >= 0 ? prox : ks.every((k) => r.respostas[k]?.v) ? ks.length : pi + 1) : Math.min(ks.length, Math.max(0, pi + +b.dataset.pnav)); desenharPasso(); $('[data-passo]')?.scrollIntoView({ block: 'nearest' }); return; }
    if (b.dataset.modo) { modo = b.dataset.modo; try { localStorage.setItem('prev-modo-form', modo); } catch { /* ok */ } if (modo === 'passo') { pi = chaves().findIndex((k) => !r.respostas[k]?.v); if (pi < 0) pi = chaves().length; } desenharSecoes(); return; }
    if (b.dataset.v && li) {
      const k = li.dataset.k, atual = r.respostas[k] || {};
      r.respostas[k] = { ...atual, v: b.dataset.v }; salvar();
      const y = li.getBoundingClientRect().top; desenharSecoes();
      const novo = el.querySelector(`[data-k="${k}"]`); window.scrollBy(0, novo.getBoundingClientRect().top - y);
      if (b.dataset.v === 'nok') novo.querySelector('textarea')?.focus();
    } else if (b.dataset.addsec) { r.secoes = ORDEM_SECOES.filter((k) => r.secoes.includes(k) || k === b.dataset.addsec); salvar(); desenharSecoes(); }
    else if (b.dataset.tirar) { r.secoes = r.secoes.filter((k) => k !== b.dataset.tirar); salvar(); desenharSecoes(); }
    else if (b.hasAttribute('data-addplano')) { r.plano.push({ item: '', acao: '', resp: '', prazo: '' }); desenharPlano(); }
    else if (b.dataset.rmplano) { r.plano.splice(+b.dataset.rmplano, 1); salvar(); desenharPlano(); }
    else if (b.dataset.rmfoto && li) { const v = r.respostas[li.dataset.k]; v.fotos = (v.fotos || []).filter((x) => x !== b.dataset.rmfoto); salvar(); desenharSecoes(); }
    else if (b.dataset.limpar) pad.limpar();
    else if (b.hasAttribute('data-concluir')) concluir();
  });
  el.addEventListener('change', async (e) => {
    const t = e.target; if (!t.hasAttribute('data-fotoinput')) return;
    const li = t.closest('[data-k]'), k = li.dataset.k, lbl = t.closest('label'); lbl.classList.add('enviando');
    const path = await tirarFoto(t, r.id); lbl.classList.remove('enviando');
    if (!path) return;
    const v = r.respostas[k]; v.fotos = [...(v.fotos || []), path]; salvar(); desenharSecoes();
  });
  el.addEventListener('input', (e) => {
    if (e.target.type === 'file') return;
    const t = e.target;
    if (t.dataset.f) { const k = t.closest('[data-k]').dataset.k; r.respostas[k][t.dataset.f] = t.value; if (t.dataset.f === 'acao') { const p = r.plano.find((x) => x.key === k); if (p) { p.acao = t.value; const pa = el.querySelector(`[data-j="${r.plano.indexOf(p)}"] .plano-acao`); if (pa) pa.textContent = t.value; } } }
    else if (t.dataset.p) r.plano[+t.closest('[data-j]').dataset.j][t.dataset.p] = t.value;
    else if (t.hasAttribute('data-obs')) r.obs = t.value;
    salvar();
  });

  const pad = padAssinatura($('#man-pad'));
  const nome = $('#man-nome');
  try { nome.value = localStorage.getItem('prev-ultimo-nome') || ''; } catch { /* ok */ }
  const relogio = setInterval(() => { if (!el.isConnected) return clearInterval(relogio); const t = $('[data-tempo]'); if (t) t.textContent = duracao(Date.now() - r.inicio); }, 20000);

  async function concluir() {
    const erros = [];
    const faltam = r.secoes.flatMap((k) => SECOES[k].itens.map((_, i) => `${k}.${i}`)).filter((k) => !r.respostas[k]?.v);
    if (faltam.length) erros.push(`${faltam.length} ${faltam.length === 1 ? 'item ficou' : 'itens ficaram'} sem resposta.`);
    const semObs = Object.entries(r.respostas).filter(([k, v]) => v.v === 'nok' && r.secoes.includes(k.split('.')[0]) && (!v.obs?.trim() || !v.acao?.trim()));
    if (semObs.length) erros.push('Todo NOK precisa dizer o que foi encontrado e a ação.');
    if (!nome.value.trim()) erros.push('Escreva o nome do manutentor.');
    if (pad.vazio()) erros.push('Falta a assinatura do manutentor.');
    const box = $('[data-erros]');
    if (erros.length) {
      box.hidden = false; box.innerHTML = erros.map((x) => `<p>${ic('alert')}${esc(x)}</p>`).join('');
      if (faltam.length) { const alvo = el.querySelector(`[data-k="${faltam[0]}"]`); alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' }); alvo?.classList.add('piscar'); setTimeout(() => alvo?.classList.remove('piscar'), 1600); }
      return;
    }
    try { localStorage.setItem('prev-ultimo-nome', nome.value.trim()); } catch { /* ok */ }
    const bt = $('[data-concluir]'); bt.disabled = true; bt.textContent = 'Enviando…';
    r.fim = Date.now(); r.status = 'ag_sup'; r.antecipada = !!foraJanela;
    r.manutentor = { nome: nome.value.trim(), ass: pad.imagem(), em: r.fim };
    try { await salvarRegistro(r); }
    catch (e) {
      r.status = 'rascunho'; r.fim = null; r.manutentor = null; salvarRegistro(r);
      const dup = /registros_prog_unico|duplicate/i.test(e?.message || '');
      box.hidden = false; box.innerHTML = `<p>${ic('alert')}${esc(dup ? 'Esta preventiva já foi enviada por outro manutentor. Veja em Registros.' : 'Não foi possível enviar: ' + (e?.message || e) + '. Suas respostas continuam salvas neste celular; tente de novo.')}</p>`;
      bt.disabled = false; bt.innerHTML = `${ic('pena')} Concluir e assinar`; return;
    }
    toast('Preventiva assinada. Agora o supervisor assina.');
    aoTerminar?.(r);
  }
  desenharSecoes();
}

// ---------- tela "pronto, procure o supervisor" ----------
export function telaEnviado(el, r) {
  const noks = Object.values(r.respostas).filter((v) => v.v === 'nok').length;
  el.innerHTML = `<div class="form enviado">
    <div class="selo">${ic('check')}</div>
    <h1>${esc(r.codigo)} · preventiva assinada</h1>
    <p class="sub">${esc(r.manutentor.nome)} · ${dataHoraBR(r.fim)} · tempo total ${duracao(r.fim - r.inicio)}</p>
    <p class="destaque">Procure o supervisor da área para assinar.</p>
    <p class="sub">Depois dele, o gerente de manutenção assina e o relatório fica pronto para salvar na pasta.</p>
    <div class="form-dados"><div><span>Itens NOK</span><b>${noks}</b></div><div><span>Ações no plano</span><b>${r.plano.length}</b></div></div>
    <a class="btn btn-pri btn-grande" href="#r-${r.id}">Ver relatório</a>
    <a class="btn btn-sec btn-grande" href="#painel">Voltar ao início</a>
  </div>`;
}

// ---------- excluir registro (só gerente de manutenção) ----------
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function confirmarExclusao(r, depois) {
  abrirModal({ titulo: 'Excluir registro', html: `
    <p>Excluir o registro da <b>${esc(r.codigo)}</b> · preventiva de ${MES[+r.ciclo.slice(5) - 1]}/${r.ciclo.slice(0, 4)}, feita por ${esc(r.manutentor?.nome || '—')} em ${dataHoraBR(r.fim)}?</p>
    <p class="aviso aviso-red">${ic('alert')}<span>Apaga ${r.pdf_path ? 'as respostas, as assinaturas e o PDF da pasta' : 'as respostas e as assinaturas'}. Não dá para desfazer. A preventiva volta a ficar em aberto no cronograma.</span></p>
    <div class="erros" data-erro hidden></div>
    <div class="linha-btn"><button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button type="button" class="btn btn-perigo" data-ok>${ic('lixo')} Excluir definitivamente</button></div>`,
  onAbrir: (c, fechar) => {
    const ok = c.querySelector('[data-ok]');
    ok.onclick = async () => {
      ok.disabled = true; ok.textContent = 'Excluindo…';
      try { await excluirRegistro(r); fechar(); toast(`Registro da ${r.codigo} excluído.`); depois?.(); }
      catch (e) { const b = c.querySelector('[data-erro]'); b.hidden = false; b.textContent = 'Não foi possível excluir: ' + (e?.message || e); ok.disabled = false; ok.innerHTML = `${ic('lixo')} Excluir definitivamente`; }
    };
  } });
}

// ---------- relatório (folhas A4 iguais ao papel) + assinaturas do supervisor e do gerente ----------
const ETAPA = { ag_sup: ['supervisor', 'Supervisor da área'], ag_ger: ['gerente', 'Gerente de manutenção'] };
export function telaRelatorio(el, { id, perfil, maqDe }) {
  const r = obterRegistro(id);
  if (!r) { el.innerHTML = '<div class="form"><p class="vazio-p">Relatório não encontrado.</p><a class="btn btn-sec" href="#registros">Voltar</a></div>'; return; }
  const m = maqDe(r.codigo), st = ST[r.status] || ST.ag_sup, etapa = ETAPA[r.status];
  const vez = etapa && etapa[0] === perfil;
  const emIframe = window.self !== window.top;
  el.innerHTML = `<div class="rel-wrap">
    <div class="rel-acoes"><a href="#registros" class="btn btn-sec">${ic('voltar')} Registros</a><span class="pill" style="--c:${st.cor}">${st.nome}</span>
      ${r.selo ? `<a class="selo-tag" href="#v-${r.id}" title="Conferir autenticidade">${ic('escudo')} Selo ${esc(r.selo.slice(0, 8).toUpperCase())}</a>` : ''}
      <a class="link" href="#h-${r.codigo.toLowerCase().replace(/\s+/g, '-')}">${ic('historico')} Histórico da ${esc(r.codigo)}</a>
      <span class="esp"></span>
      ${perfil === 'gerente' ? `<button type="button" class="btn btn-sec btn-excluir" data-excluir>${ic('lixo')} Excluir</button>` : ''}
      ${r.status === 'concluida' ? `<button type="button" class="btn btn-pri" data-pdf>${ic('baixar')} Baixar PDF</button>${emIframe ? '' : `<button type="button" class="btn btn-sec" data-imprimir>Imprimir</button>`}` : ''}</div>
    ${r.status === 'concluida' ? `<p class="sub" data-pasta>${r.pdf_path ? `${ic('check')} Guardado na pasta do sistema: <b>${esc(nomeArquivo(r))}</b>` : 'O PDF ainda não está na pasta do sistema.'}
      ${!r.pdf_path && perfil !== 'manutentor' ? '<button type="button" class="link" data-guardar>Gerar e guardar agora</button>' : ''}</p>` : ''}
    ${etapa ? (vez ? `<section class="bloco assinar">
        <h2>Sua assinatura · ${etapa[1]}</h2><p class="sub">Confira o relatório abaixo antes de assinar.${r.status === 'ag_ger' ? '' : ' Depois de você, assina o gerente de manutenção.'}</p>
        ${blocoAssinatura('ass', etapa[1])}
        <div class="erros" data-erros hidden></div>
        <button type="button" class="btn btn-pri btn-grande" data-assinar>${ic('pena')} Assinar como ${etapa[1].toLowerCase()}</button></section>`
      : `<p class="aviso">${ic('relogio')}<span>Falta a assinatura do ${etapa[1].toLowerCase()}${r.status === 'ag_sup' ? ' e, depois, a do gerente de manutenção' : ''}.</span></p>`) : ''}
    <div class="folhas" data-folhas>${folhasA4(r, m)}</div>
  </div>`;
  // folhas A4 cabendo na largura da tela
  const fol = el.querySelector('[data-folhas]');
  const ajustar = () => { const k = Math.min(1, fol.clientWidth / 794); fol.style.setProperty('--k', k); };
  new ResizeObserver(ajustar).observe(fol); ajustar();
  carregarFotosRel(r).then((u) => { if (Object.keys(u).length && fol.isConnected) fol.innerHTML = folhasA4(r, m, u); });
  const bp = el.querySelector('[data-pdf]');
  if (bp) bp.onclick = async () => {
    bp.disabled = true; const txt = bp.innerHTML; bp.textContent = 'Preparando PDF…';
    try { const blob = r.pdf_path ? await baixarPDF(r.pdf_path).catch(() => gerarPDF(r, m)) : await gerarPDF(r, m); await salvarArquivo(nomeArquivo(r), blob); }
    catch (e) { if (e?.code !== 'declined') toast('Não foi possível gerar o PDF: ' + (e?.message || e), 'erro'); }
    finally { bp.disabled = false; bp.innerHTML = txt; }
  };
  // guarda o PDF na pasta do sistema (Storage) — automático na assinatura do gerente
  async function guardar() {
    const p = el.querySelector('[data-pasta]'); if (p) p.textContent = 'Gerando o PDF e guardando na pasta do sistema…';
    const atual = obterRegistro(id) || r;
    try { await enviarPDF(atual, await gerarPDF(atual, m)); toast(`${r.codigo}: PDF guardado na pasta.`); }
    catch (e) { toast('O PDF não foi guardado na pasta: ' + (e?.message || e), 'erro'); }
    if (el.isConnected) telaRelatorio(el, { id, perfil, maqDe });
  }
  const bg = el.querySelector('[data-guardar]'); if (bg) bg.onclick = guardar;
  const bi = el.querySelector('[data-imprimir]'); if (bi) bi.onclick = () => window.print();
  const bx = el.querySelector('[data-excluir]'); if (bx) bx.onclick = () => confirmarExclusao(r, () => { location.hash = 'registros'; });
  if (vez) {
    const pad = padAssinatura(el.querySelector('#ass-pad')), nome = el.querySelector('#ass-nome');
    try { nome.value = localStorage.getItem('prev-nome-' + etapa[0]) || (etapa[0] === 'gerente' ? 'Danilo Correa' : ''); } catch { /* ok */ }
    el.querySelector('[data-limpar]').onclick = () => pad.limpar();
    el.querySelector('[data-assinar]').onclick = async (ev) => {
      const erros = []; if (!nome.value.trim()) erros.push('Escreva o seu nome.'); if (pad.vazio()) erros.push('Falta a assinatura.');
      const box = el.querySelector('[data-erros]'); if (erros.length) { box.hidden = false; box.innerHTML = erros.map((x) => `<p>${ic('alert')}${esc(x)}</p>`).join(''); return; }
      try { localStorage.setItem('prev-nome-' + etapa[0], nome.value.trim()); } catch { /* ok */ }
      const bt = ev.currentTarget; bt.disabled = true; bt.textContent = 'Enviando…';
      r[etapa[0]] = { nome: nome.value.trim(), ass: pad.imagem(), em: Date.now() };
      r.status = r.status === 'ag_sup' ? 'ag_ger' : 'concluida';
      try { await salvarRegistro(r); }
      catch (e) {
        await recarregarRegistro(id).catch(() => {});
        toast('Assinatura não foi gravada: ' + (e?.message || e), 'erro'); telaRelatorio(el, { id, perfil, maqDe }); return;
      }
      if (r.status === 'concluida') await recarregarRegistro(id).catch(() => {}); // traz o selo gerado pelo banco
      toast(r.status === 'concluida' ? `${r.codigo}: preventiva concluída.` : `${r.codigo}: assinado. Agora falta o gerente.`);
      telaRelatorio(el, { id, perfil, maqDe }); window.scrollTo(0, 0);
      if (r.status === 'concluida') { carimbo(obterRegistro(id)); guardar(); }
    };
  }
}

// carimbo animado quando o gerente conclui (uma vez, some sozinho)
function carimbo(r) {
  const c = document.createElement('div');
  c.className = 'carimbo-cena'; c.setAttribute('role', 'status');
  c.innerHTML = `<div class="carimbo">${ic('escudo', 'ic-lg')}<b>AUTÊNTICO</b><span>CONCLUÍDA · 3 ASSINATURAS</span>${r?.selo ? `<small>${esc(r.selo.slice(0, 8).toUpperCase())}-${esc(r.selo.slice(8, 16).toUpperCase())}</small>` : ''}</div>`;
  document.body.append(c);
  c.onclick = () => c.remove();
  setTimeout(() => c.classList.add('sai'), 1900);
  setTimeout(() => c.remove(), 2400);
}
