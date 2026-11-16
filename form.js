// =====================================================================
// Formulário da preventiva (celular) e relatório FR.06.08.002-A
//
// Fluxo: manutentor escaneia o QR -> responde OK / NOK / N.A. -> NOK pede o
// que foi encontrado e a ação (vira linha do plano de ação) -> assina com o
// dedo -> supervisor da área assina -> gerente de manutenção assina ->
// "Concluída" -> salvar PDF (igual ao papel) na pasta das preventivas.
// O rascunho é salvo a cada resposta (se a tela apagar, nada se perde).
// =====================================================================
import { SECOES, ORDEM_SECOES, SETORES, MESES, secoesPadrao } from './dados.js';
import { salvarRegistro, rascunhoDaProg, nomesUsados, novoId, registro as obterRegistro, recarregarRegistro, enviarPDF, baixarPDF, excluirRegistro } from './store.js';
import { esc, ic, dataBR, semana, dataHoraBR, duracao, toast, abrirModal } from './ui.js';
import { folhasA4, gerarPDF, salvarArquivo, nomeArquivo } from './relatorio.js';
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
  return { vazio: () => riscos === 0, limpar: () => { riscos = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }, imagem: () => canvas.toDataURL('image/png') };
}

const blocoAssinatura = (id, rotulo) => `
  <div class="ass">
    <div class="ass-topo"><label for="${id}-nome">${rotulo}</label><button type="button" class="link" data-limpar="${id}">Limpar assinatura</button></div>
    <input id="${id}-nome" class="campo" autocomplete="name" placeholder="Nome completo" list="${id}-lista" />
    <datalist id="${id}-lista">${nomesUsados().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <canvas class="ass-pad" id="${id}-pad" aria-label="Área para assinar com o dedo"></canvas>
    <p class="ass-dica">Assine com o dedo dentro do quadro</p>
  </div>`;

// ---------- formulário ----------
export function telaFormulario(el, { maq, item, aoTerminar }) {
  const m = maq.maquina;
  let r = item && rascunhoDaProg(item.id);
  if (!r) r = { id: novoId(), prog: item?.id || null, codigo: m.codigo, ciclo: item?.ciclo || hoje().slice(0, 7), dataPrevista: item?.data || null,
    inicio: Date.now(), secoes: secoesPadrao(m), respostas: {}, plano: [], obs: '', status: 'rascunho' };
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
      ${foraJanela ? `<p class="aviso">${ic('alert')} Esta máquina só entra em preventiva em ${MESES[+mm - 1]}. Registrando agora, ela conta como <b>antecipada</b>.</p>` : ''}
      ${item?.st === 'atrasada' ? `<p class="aviso aviso-red">${ic('alert')} Preventiva atrasada: a janela era ${MESES[+mm - 1]}/${a}.</p>` : ''}
      <div class="form-dados">
        <div><span>Início</span><b>${dataHoraBR(r.inicio)}</b></div>
        <div><span>Tempo até agora</span><b data-tempo>${duracao(Date.now() - r.inicio)}</b></div>
      </div>
    </section>
    <div data-secoes></div>
    <div class="add-secoes" data-add></div>
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
            </div>` : ''}
          </li>`;
        }).join('')}</ol></section>`;
    }).join('');
    const faltam = ORDEM_SECOES.filter((k) => !r.secoes.includes(k));
    $('[data-add]').innerHTML = faltam.length ? `<span>Adicionar seção:</span>${faltam.map((k) => `<button type="button" class="chip" data-addsec="${k}">${ic('plus')}${esc(SECOES[k].titulo.split(' · ')[0])}</button>`).join('')}` : '';
    desenharPlano(); progresso();
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
    else if (b.dataset.limpar) pad.limpar();
    else if (b.hasAttribute('data-concluir')) concluir();
  });
  el.addEventListener('input', (e) => {
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
      : `<p class="aviso">${ic('relogio')} Falta a assinatura do ${etapa[1].toLowerCase()}${r.status === 'ag_sup' ? ' e, depois, a do gerente de manutenção' : ''}.</p>`) : ''}
    <div class="folhas" data-folhas>${folhasA4(r, m)}</div>
  </div>`;
  // folhas A4 cabendo na largura da tela
  const fol = el.querySelector('[data-folhas]');
  const ajustar = () => { const k = Math.min(1, fol.clientWidth / 794); fol.style.setProperty('--k', k); };
  new ResizeObserver(ajustar).observe(fol); ajustar();
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
    try { await enviarPDF(r, await gerarPDF(r, m)); toast(`${r.codigo}: PDF guardado na pasta.`); }
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
      toast(r.status === 'concluida' ? `${r.codigo}: preventiva concluída.` : `${r.codigo}: assinado. Agora falta o gerente.`);
      telaRelatorio(el, { id, perfil, maqDe }); window.scrollTo(0, 0);
      if (r.status === 'concluida') guardar();
    };
  }
}
