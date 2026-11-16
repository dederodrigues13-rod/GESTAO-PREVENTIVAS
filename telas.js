// =====================================================================
// Telas de acompanhamento: Plano de ação · Histórico por máquina ·
// Indicadores · Avisos automáticos · Verificação do selo (pública)
// =====================================================================
import { MAQUINAS, SETORES, MESES, porCodigo, porSlug, formulario, nomeSecao } from './dados.js';
import { itens, porMaquina, ST, ST3D, COR3D, hoje, aguardando } from './situacao.js';
import { registros, acoes, atualizarAcao, lerAvisos, salvarAvisos, testarAvisos, verificar } from './store.js';
import { esc, ic, dataBR, diaMes, semana, dataHoraBR, duracao, toast, abrirModal, diasEntre } from './ui.js';
import { botaoFoto, tirarFoto, miniaturas, carregarMiniaturas } from './fotos.js';

const nomeMes = (ciclo) => `${MESES[+ciclo.slice(5) - 1]}/${ciclo.slice(0, 4)}`;
const mesCurto = (ciclo) => `${MESES[+ciclo.slice(5) - 1].slice(0, 3)}/${ciclo.slice(2, 4)}`;
const pill = (st) => `<span class="pill" style="--c:${ST[st].cor}">${ST[st].nome}</span>`;
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
const fmtPct = (v) => (v == null ? '—' : v + '%');
const dataReg = (r) => (r?.fim ? new Date(r.fim).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null);
const realizada = (i) => i.st === 'concluida' || aguardando(i.st);
const nokDe = (r) => Object.entries(r.respostas || {}).filter(([k, v]) => v.v === 'nok' && r.secoes.includes(k.split('.')[0]));

// ---------- plano de ação ----------
export const ST_ACAO = { aberta: { nome: 'Aberta', cor: '#f0a93b' }, andamento: { nome: 'Em andamento', cor: '#5aa2ff' }, fechada: { nome: 'Fechada', cor: '#4cc38a' }, vencida: { nome: 'Vencida', cor: '#ff5a36' } };
export const stAcao = (a) => (a.status !== 'fechada' && a.prazo && a.prazo < hoje() ? 'vencida' : a.status);
const pillAcao = (a) => { const s = ST_ACAO[stAcao(a)]; return `<span class="pill" style="--c:${s.cor}">${s.nome}</span>`; };
let fAcao = { st: 'abertas', setor: '', q: '' };

export function telaAcoes(el, { perfil }) {
  const gestao = perfil !== 'manutentor', todas = acoes(), h = hoje();
  const abertas = todas.filter((a) => a.status !== 'fechada'), vencidas = abertas.filter((a) => stAcao(a) === 'vencida');
  const fechMes = todas.filter((a) => a.status === 'fechada' && (a.fechada_em || '').slice(0, 7) === h.slice(0, 7));
  const prazos = todas.filter((a) => a.status === 'fechada' && a.fechada_em).map((a) => diasEntre(a.criada_em.slice(0, 10), a.fechada_em.slice(0, 10)));
  const f = fAcao, q = f.q.trim().toUpperCase();
  const lista = todas.filter((a) => (f.st === 'todas' || (f.st === 'abertas' && a.status !== 'fechada') || (f.st === 'vencidas' && stAcao(a) === 'vencida') || (f.st === 'fechadas' && a.status === 'fechada'))
    && (!f.setor || porCodigo[a.codigo]?.setor === f.setor) && (!q || a.codigo.includes(q) || (a.responsavel || '').toUpperCase().includes(q) || (a.acao || '').toUpperCase().includes(q)))
    .sort((a, b) => (stAcao(a) === 'vencida' ? 0 : 1) - (stAcao(b) === 'vencida' ? 0 : 1) || (a.prazo || '9').localeCompare(b.prazo || '9') || a.criada_em.localeCompare(b.criada_em));
  el.innerHTML = `<div class="pag">
    <div class="pag-topo"><h1 class="tit">Plano de ação</h1><p class="sub">Cada NOK da preventiva vira uma ação, com responsável, prazo e situação. A ação fecha com o que foi feito e, se quiser, uma foto de evidência.</p></div>
    <div class="kpi-linha">
      <div class="kpi" style="--c:${ST_ACAO.aberta.cor}"><b>${abertas.length}</b><span>abertas</span></div>
      <div class="kpi" style="--c:${ST_ACAO.vencida.cor}"><b>${vencidas.length}</b><span>vencidas</span></div>
      <div class="kpi" style="--c:${ST_ACAO.fechada.cor}"><b>${fechMes.length}</b><span>fechadas neste mês</span></div>
      <div class="kpi"><b>${prazos.length ? Math.round(prazos.reduce((s, x) => s + x, 0) / prazos.length) + ' d' : '—'}</b><span>tempo médio para fechar</span></div>
    </div>
    <div class="filtros reg-filtros">
      <div class="chips">${[['abertas', 'Abertas'], ['vencidas', 'Vencidas'], ['fechadas', 'Fechadas'], ['todas', 'Todas']].map(([k, n]) => `<button type="button" class="chip ${f.st === k ? 'on' : ''}" data-fst="${k}">${n}</button>`).join('')}</div>
      <div class="chips">${[['', 'Todos os setores'], ...Object.entries(SETORES).map(([k, x]) => [k, x.curto])].map(([k, n]) => `<button type="button" class="chip ${f.setor === k ? 'on' : ''}" data-fs="${k}">${n}</button>`).join('')}</div>
      <input class="campo busca" type="search" placeholder="Máquina, responsável ou ação" value="${esc(f.q)}" data-q aria-label="Buscar" />
    </div>
    ${lista.length ? `<div class="acoes">${lista.map((a) => cartaoAcao(a, gestao)).join('')}</div>`
      : `<div class="vazio-grande">${ic('alvo', 'ic-lg')}<p>${todas.length ? 'Nenhuma ação com esse filtro.' : 'Nenhuma ação ainda.'}</p><p class="sub">${todas.length ? '' : 'Quando o manutentor marcar um item como NOK e assinar, a ação aparece aqui.'}</p></div>`}
  </div>`;
  carregarMiniaturas(el);
  el.querySelectorAll('[data-fst]').forEach((b) => { b.onclick = () => { f.st = b.dataset.fst; telaAcoes(el, { perfil }); }; });
  el.querySelectorAll('[data-fs]').forEach((b) => { b.onclick = () => { f.setor = b.dataset.fs; telaAcoes(el, { perfil }); }; });
  const qi = el.querySelector('[data-q]'); qi.oninput = () => { f.q = qi.value; clearTimeout(qi.t); qi.t = setTimeout(() => { telaAcoes(el, { perfil }); const n = el.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
  ligarAcoes(el, () => telaAcoes(el, { perfil }), gestao);
}

export function cartaoAcao(a, gestao) {
  const s = stAcao(a), venc = s === 'vencida' ? ` · vencida há ${diasEntre(a.prazo, hoje())} d` : '';
  return `<article class="acao" style="--c:${ST_ACAO[s].cor}" data-acao="${esc(a.id)}">
    <div class="acao-topo"><a class="acao-maq" href="#h-${porCodigo[a.codigo]?.slug || ''}">${esc(a.codigo)}</a>${pillAcao(a)}<span class="acao-ciclo">preventiva de ${nomeMes(a.ciclo || '2026-12')}</span></div>
    <p class="acao-item">${esc(a.item || '')}</p>
    ${a.encontrado ? `<p class="acao-lin"><span>Encontrado</span>${esc(a.encontrado)}</p>` : ''}
    <p class="acao-lin"><span>Ação</span><b>${esc(a.acao || '—')}</b></p>
    ${miniaturas(a.fotos || [])}
    <div class="acao-meta"><span>${ic('relogio')} Prazo: <b>${a.prazo ? dataBR(a.prazo) : 'sem prazo'}</b>${venc}</span><span>Responsável: <b>${esc(a.responsavel || '—')}</b></span></div>
    ${a.status === 'fechada' ? `<div class="acao-fech"><p><span>Fechada em ${dataHoraBR(a.fechada_em)}${a.fechada_por ? ' por ' + esc(a.fechada_por) : ''}</span>${esc(a.fechamento || '')}</p>${miniaturas(a.foto_fechamento ? [a.foto_fechamento] : [])}</div>` : ''}
    <div class="f-btns">
      ${a.status === 'aberta' ? '<button type="button" class="btn btn-sec btn-sm" data-andamento>Começar</button>' : ''}
      ${a.status !== 'fechada' ? `<button type="button" class="btn btn-pri btn-sm" data-fechar-acao>${ic('check')} Fechar ação</button>` : '<button type="button" class="btn btn-sec btn-sm" data-reabrir>Reabrir</button>'}
      ${gestao && a.status !== 'fechada' ? '<button type="button" class="btn btn-sec btn-sm" data-editar>Responsável e prazo</button>' : ''}
      <a class="link" href="#r-${esc(a.registro_id)}">Ver relatório</a>
    </div>
  </article>`;
}

export function ligarAcoes(el, redesenhar, gestao) {
  const pega = (b) => acoes().find((x) => x.id === b.closest('[data-acao]').dataset.acao);
  const salvar = async (a, patch, msg) => { try { await atualizarAcao(a.id, patch); if (msg) toast(msg); redesenhar(); } catch (e) { toast('Não foi gravado: ' + (e?.message || e), 'erro'); } };
  el.querySelectorAll('[data-andamento]').forEach((b) => { b.onclick = () => salvar(pega(b), { status: 'andamento' }, 'Ação em andamento.'); });
  el.querySelectorAll('[data-reabrir]').forEach((b) => { b.onclick = () => salvar(pega(b), { status: 'andamento', fechamento: null, foto_fechamento: null, fechada_por: null }, 'Ação reaberta.'); });
  el.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => {
    const a = pega(b);
    abrirModal({ titulo: `Ação · ${a.codigo}`, html: `<p class="sub">${esc(a.item || '')}</p>
      <label class="lbl" for="ea">Ação</label><input id="ea" class="campo" value="${esc(a.acao || '')}" />
      <label class="lbl" for="er">Responsável</label><input id="er" class="campo" value="${esc(a.responsavel || '')}" placeholder="Ex.: Mecânica · João" />
      <label class="lbl" for="ep">Prazo</label><input id="ep" class="campo" type="date" value="${esc(a.prazo || '')}" />
      <div class="linha-btn"><button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button type="button" class="btn btn-pri" data-ok>Salvar</button></div>`,
    onAbrir: (c, fechar) => { c.querySelector('[data-ok]').onclick = () => { fechar(); salvar(a, { acao: c.querySelector('#ea').value.trim(), responsavel: c.querySelector('#er').value.trim() || null, prazo: c.querySelector('#ep').value || null }, 'Ação atualizada.'); }; } });
  }; });
  el.querySelectorAll('[data-fechar-acao]').forEach((b) => { b.onclick = () => {
    const a = pega(b); let foto = null;
    let nome = ''; try { nome = localStorage.getItem('prev-ultimo-nome') || ''; } catch { /* ok */ }
    abrirModal({ titulo: `Fechar ação · ${a.codigo}`, html: `<p class="sub">${esc(a.acao || a.item || '')}</p>
      <label class="lbl" for="fo">O que foi feito</label><textarea id="fo" class="campo" rows="3" placeholder="Ex.: guia lubrificada e folga ajustada"></textarea>
      <label class="lbl" for="fn">Seu nome</label><input id="fn" class="campo" value="${esc(nome)}" />
      <div class="nok-fotos" data-fz>${botaoFoto('data-fotofech', 'Foto de evidência')}</div>
      <div class="erros" data-erro hidden></div>
      <div class="linha-btn"><button type="button" class="btn btn-sec" data-fechar>Cancelar</button><button type="button" class="btn btn-pri" data-ok>${ic('check')} Fechar ação</button></div>`,
    onAbrir: (c, fechar) => {
      c.querySelector('[data-fotofech]').onchange = async (e) => {
        const lbl = e.target.closest('label'); lbl.classList.add('enviando');
        const p = await tirarFoto(e.target, `acoes/${a.id}`); lbl.classList.remove('enviando');
        if (p) { foto = p; c.querySelector('[data-fz]').insertAdjacentHTML('afterbegin', miniaturas([p])); carregarMiniaturas(c); lbl.querySelector('span').textContent = 'Trocar foto'; }
      };
      c.querySelector('[data-ok]').onclick = () => {
        const o = c.querySelector('#fo').value.trim(), n = c.querySelector('#fn').value.trim();
        if (!o || !n) { const er = c.querySelector('[data-erro]'); er.hidden = false; er.textContent = 'Escreva o que foi feito e o seu nome.'; return; }
        try { localStorage.setItem('prev-ultimo-nome', n); } catch { /* ok */ }
        fechar(); salvar(a, { status: 'fechada', fechamento: o, fechada_por: n, foto_fechamento: foto }, 'Ação fechada.');
      };
    } });
  }; });
}

// ---------- histórico por máquina ----------
export function telaHistorico(el, slug) {
  const m = porSlug[slug];
  if (!m) { el.innerHTML = '<div class="pag"><p class="vazio-p">Máquina não encontrada.</p></div>'; return; }
  const s = porMaquina()[m.codigo], minhas = itens().filter((i) => i.codigo === m.codigo), h = hoje();
  const regs = registros().filter((r) => r.codigo === m.codigo && r.status !== 'rascunho').sort((a, b) => (b.fim || 0) - (a.fim || 0));
  const devidas = minhas.filter((i) => i.janelaFim < h || realizada(i)), feitas = minhas.filter(realizada);
  const noPrazo = feitas.filter((i) => dataReg(i.reg) && dataReg(i.reg) <= i.data);
  const tempos = regs.map((r) => (r.fim - r.inicio) / 60000).filter((x) => x > 0);
  const nokCont = {};
  regs.forEach((r) => nokDe(r).forEach(([k]) => { const nm = `${nomeSecao(r.rev, k.split('.')[0])} ${+k.split('.')[1] + 1} · ${formulario(r.rev).secoes[k.split('.')[0]].itens[+k.split('.')[1]]}`; nokCont[nm] = (nokCont[nm] || 0) + 1; }));
  const recorr = Object.entries(nokCont).sort((a, b) => b[1] - a[1]);
  const minhasAcoes = acoes().filter((a) => a.codigo === m.codigo).sort((a, b) => b.criada_em.localeCompare(a.criada_em));
  el.innerHTML = `<div class="pag">
    <section class="hist-cab" style="--c:${COR3D[s.st3d]}">
      <div><p class="eyebrow">Histórico da máquina</p><h1>${esc(m.codigo)}</h1><p class="sub">${esc(m.equipamento)} · ${esc(m.modelo)} · ${SETORES[m.setor].nome}${m.celula ? ' · Célula ' + m.celula : ''}</p>
        <p class="sub">Preventiva a cada 3 meses: ${{ A: 'jan · abr · jul · out', B: 'fev · mai · ago · nov', C: 'mar · jun · set · dez' }[m.janela]}</p></div>
      <div class="hist-st"><span class="p3d-pill" style="--c:${COR3D[s.st3d]}">${ST3D[s.st3d]}</span>
        ${s.proxima ? `<p>Próxima: <b>${semana(s.proxima.data)}, ${dataBR(s.proxima.data)}</b></p>` : ''}
        <a class="btn btn-pri btn-sm" href="#m-${m.slug}">Abrir formulário</a></div>
    </section>
    <div class="kpi-linha">
      <div class="kpi"><b>${feitas.length}/${devidas.length}</b><span>preventivas feitas / devidas até hoje</span></div>
      <div class="kpi" style="--c:${ST.concluida.cor}"><b>${fmtPct(pct(noPrazo.length, feitas.length))}</b><span>feitas até o dia programado</span></div>
      <div class="kpi"><b>${tempos.length ? duracao(tempos.reduce((a, b) => a + b, 0) / tempos.length * 60000) : '—'}</b><span>tempo médio de parada (h:min)</span></div>
      <div class="kpi" style="--c:${ST.atrasada.cor}"><b>${regs.reduce((n, r) => n + nokDe(r).length, 0)}</b><span>itens NOK no período</span></div>
    </div>
    <div class="col2">
      <section class="bloco"><h2>Linha do tempo · dez/2026 a dez/2027</h2>
        <ol class="linha-tempo">${minhas.map((i) => `<li style="--c:${ST[i.st].cor}"><span class="lt-mes">${mesCurto(i.ciclo)}</span>
          <div><b>${semana(i.data)}, ${dataBR(i.data)}</b>${pill(i.st)}
          ${i.reg ? `<small>${esc(i.reg.manutentor?.nome || '')} · ${dataHoraBR(i.reg.fim)} · ${duracao(i.reg.fim - i.reg.inicio)} · ${nokDe(i.reg).length} NOK · <a href="#r-${i.reg.id}">relatório</a></small>` : ''}</div></li>`).join('')}</ol>
        ${regs.filter((r) => !minhas.some((i) => i.reg?.id === r.id)).length ? `<p class="sub">Também há relatórios fora do cronograma: ${regs.filter((r) => !minhas.some((i) => i.reg?.id === r.id)).map((r) => `<a href="#r-${r.id}">${dataHoraBR(r.fim)}</a>`).join(', ')}</p>` : ''}
      </section>
      <div class="pilha">
        <section class="bloco"><h2>Itens que mais dão NOK</h2>
          ${recorr.length ? `<div class="barras">${recorr.slice(0, 8).map(([n, c]) => `<div class="barra-lin" title="${esc(n)}: ${c}×"><span>${esc(n)}</span><div class="barra barra-red"><i style="width:${c / recorr[0][1] * 100}%"></i></div><b>${c}×</b></div>`).join('')}</div>` : '<p class="vazio-p">Nenhum NOK registrado nesta máquina.</p>'}
          ${recorr.some(([, c]) => c > 1) ? `<p class="aviso">${ic('alert')}<span>Item com NOK em mais de uma preventiva: vale investigar a causa.</span></p>` : ''}</section>
        <section class="bloco"><h2>Ações desta máquina</h2>
          ${minhasAcoes.length ? `<ul class="mini-acoes">${minhasAcoes.slice(0, 8).map((a) => `<li style="--c:${ST_ACAO[stAcao(a)].cor}"><b>${esc(a.acao || a.item || '')}</b><small>${ST_ACAO[stAcao(a)].nome} · prazo ${a.prazo ? dataBR(a.prazo) : '—'} · ${esc(a.responsavel || 'sem responsável')}</small></li>`).join('')}</ul><a class="link" href="#acoes">Ver todas as ações</a>` : '<p class="vazio-p">Nenhuma ação.</p>'}</section>
      </div>
    </div>
  </div>`;
}

// ---------- indicadores ----------
export function telaIndicadores(el) {
  const lista = itens(), h = hoje(), regs = registros().filter((r) => r.status !== 'rascunho');
  const devidas = lista.filter((i) => i.janelaFim < h || realizada(i)), feitas = lista.filter(realizada);
  const noPrazo = feitas.filter((i) => dataReg(i.reg) && dataReg(i.reg) <= i.data);
  const atrasadas = lista.filter((i) => i.st === 'atrasada');
  const doMes = lista.filter((i) => i.ciclo === h.slice(0, 7));
  const ac = acoes(), acAbertas = ac.filter((a) => a.status !== 'fechada'), acVenc = acAbertas.filter((a) => stAcao(a) === 'vencida');
  const meses = [...new Set(lista.map((i) => i.ciclo))];
  const porMes = meses.map((c) => { const l = lista.filter((i) => i.ciclo === c); return { c, t: l.length, f: l.filter(realizada).length, p: l.filter((i) => realizada(i) && dataReg(i.reg) <= i.data).length, fut: c > h.slice(0, 7) }; });
  const tempos = MAQUINAS.map((m) => { const t = regs.filter((r) => r.codigo === m.codigo && r.fim).map((r) => (r.fim - r.inicio) / 60000); return { m, n: t.length, med: t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0 }; }).filter((x) => x.n).sort((a, b) => b.med - a.med);
  const nok = {}; const nokMaq = {};
  regs.forEach((r) => nokDe(r).forEach(([k]) => { const sk = k.split('.')[0], ii = +k.split('.')[1]; const nm = `${nomeSecao(r.rev, sk)} ${ii + 1} · ${formulario(r.rev).secoes[sk].itens[ii]}`; nok[nm] = (nok[nm] || 0) + 1; nokMaq[r.codigo] = (nokMaq[r.codigo] || 0) + 1; }));
  const pareto = Object.entries(nok).sort((a, b) => b[1] - a[1]), totNok = pareto.reduce((s, [, c]) => s + c, 0);
  let acum = 0;
  const maqNok = Object.entries(nokMaq).sort((a, b) => b[1] - a[1]);
  const setores = Object.keys(SETORES).map((s) => { const d = devidas.filter((i) => i.setor === s); return { s, d: d.length, f: d.filter(realizada).length, total: lista.filter((i) => i.setor === s).length, feitasTot: lista.filter((i) => i.setor === s && realizada(i)).length }; });
  const cump = pct(devidas.filter(realizada).length, devidas.length);
  const vazio = !regs.length;
  el.innerHTML = `<div class="pag">
    <div class="pag-topo"><h1 class="tit">Indicadores</h1><p class="sub">Cumprimento do cronograma FR.06.08.068 (dez/2026 a dez/2027), tempo de parada e falhas que se repetem. "Feita" = manutentor assinou.</p></div>
    ${vazio ? `<p class="aviso">${ic('grafico')}<span>Os indicadores se preenchem conforme as preventivas forem feitas. A primeira está programada para ${lista[0] ? dataBR(lista.find((i) => i.data >= h)?.data || lista[0].data) : '—'}.</span></p>` : ''}
    <section class="ind-hero">
      <div class="ind-grande"><span>Cumprimento do cronograma</span><b>${fmtPct(cump)}</b><small>${devidas.filter(realizada).length} de ${devidas.length} preventivas devidas até hoje</small></div>
      <div class="kpi"><b>${fmtPct(pct(noPrazo.length, feitas.length))}</b><span>feitas até o dia programado</span></div>
      <div class="kpi" style="--c:${ST.atrasada.cor}"><b>${atrasadas.length}</b><span>atrasadas (mês acabou sem fazer)</span></div>
      <div class="kpi"><b>${doMes.filter(realizada).length}/${doMes.length}</b><span>${MESES[+h.slice(5, 7) - 1]}: feitas / programadas</span></div>
      <div class="kpi" style="--c:${ST_ACAO.vencida.cor}"><b>${acVenc.length}/${acAbertas.length}</b><span>ações vencidas / abertas</span></div>
    </section>
    <section class="bloco"><div class="bloco-topo"><h2>Mês a mês</h2><span class="legenda"><span><i style="background:var(--ok)"></i>feitas</span><span><i style="background:#2c3540"></i>programadas</span></span></div>
      <div class="meses-graf">${porMes.map((x) => `<div class="mg ${x.fut ? 'fut' : ''}" title="${nomeMes(x.c)}: ${x.f} feitas de ${x.t} (${x.p} até o dia programado)">
        <div class="mg-col"><i style="height:${x.t ? x.f / x.t * 100 : 0}%"></i></div><b>${x.f}/${x.t}</b><span>${mesCurto(x.c)}</span></div>`).join('')}</div></section>
    <div class="col2 col2-igual">
      <section class="bloco"><h2>Por setor</h2>${setores.map((x) => `<div class="barra-lin" title="${SETORES[x.s].nome}: ${x.f} de ${x.d} devidas"><span>${SETORES[x.s].curto}</span><div class="barra"><i style="width:${x.d ? x.f / x.d * 100 : 0}%"></i></div><b>${fmtPct(pct(x.f, x.d))}</b></div>`).join('')}
        <p class="sub">Percentual sobre as preventivas devidas até hoje. No ano: ${setores.map((x) => `${SETORES[x.s].curto} ${x.feitasTot}/${x.total}`).join(' · ')}.</p></section>
      <section class="bloco"><h2>Tempo médio de parada por máquina</h2>
        ${tempos.length ? `<div class="barras">${tempos.map((x) => `<div class="barra-lin" title="${x.m.codigo}: média de ${x.n} preventiva(s)"><span><a href="#h-${x.m.slug}">${x.m.codigo}</a></span><div class="barra barra-neutra"><i style="width:${tempos[0].med ? x.med / tempos[0].med * 100 : 0}%"></i></div><b>${duracao(x.med * 60000)}</b></div>`).join('')}</div>` : '<p class="vazio-p">Sem preventivas feitas ainda.</p>'}</section>
    </div>
    <div class="col2 col2-igual">
      <section class="bloco"><h2>Pareto dos itens NOK</h2>
        ${pareto.length ? `<table class="tab pareto"><thead><tr><th>Item</th><th class="num">NOK</th><th class="num">Acumulado</th></tr></thead><tbody>${pareto.slice(0, 10).map(([n, c]) => { acum += c; return `<tr><td>${esc(n)}</td><td class="num">${c}</td><td class="num">${Math.round(acum / totNok * 100)}%</td></tr>`; }).join('')}</tbody></table>` : '<p class="vazio-p">Nenhum NOK registrado.</p>'}</section>
      <section class="bloco"><h2>NOK por máquina</h2>
        ${maqNok.length ? `<div class="barras">${maqNok.map(([c, n]) => `<div class="barra-lin"><span><a href="#h-${porCodigo[c].slug}">${c}</a></span><div class="barra barra-red"><i style="width:${n / maqNok[0][1] * 100}%"></i></div><b>${n}</b></div>`).join('')}</div>` : '<p class="vazio-p">Nenhum NOK registrado.</p>'}</section>
    </div>
  </div>`;
}

// ---------- avisos automáticos ----------
export async function telaAvisos(el) {
  el.innerHTML = '<p class="carregando">Carregando…</p>';
  let c; try { c = await lerAvisos(); } catch (e) { c = null; }
  if (!c) { el.innerHTML = `<div class="pag estreita"><p class="aviso">${ic('alert')}<span>A configuração dos avisos ainda não existe no banco. Falta aplicar a atualização do banco (script 03).</span></p></div>`; return; }
  el.innerHTML = `<div class="pag estreita">
    <div class="pag-topo"><h1 class="tit">Avisos automáticos</h1><p class="sub">Todo dia útil às 6h30 o sistema confere o cronograma e avisa no Teams (e por e-mail, se configurado).</p></div>
    <section class="bloco"><h2>O que é enviado</h2><ul class="lista-simples">
      <li><b>Todo dia útil, para a gestão:</b> preventivas de hoje e do próximo dia útil, atrasadas, relatórios esperando assinatura há mais de 24 h e ações vencidas.</li>
      <li><b>Toda segunda-feira, para o PCP:</b> a lista de paradas programadas da semana (máquina, dia e setor).</li>
      <li>Se não houver nada para avisar, nada é enviado.</li></ul></section>
    <section class="bloco"><h2>Para onde</h2>
      <label class="chk"><input type="checkbox" data-ativo ${c.ativo ? 'checked' : ''} /> Avisos ligados</label>
      <label class="lbl" for="tw">Teams · endereço do fluxo (webhook)</label>
      <input id="tw" class="campo" value="${esc(c.teams_webhook || '')}" placeholder="https://...logic.azure.com/... ou https://...powerplatform.com/..." />
      <details class="ajuda"><summary>Como pegar esse endereço no Teams (2 minutos)</summary><ol>
        <li>No Teams, abra o canal onde os avisos devem aparecer (ex.: Manutenção).</li>
        <li>Clique nos <b>…</b> do canal → <b>Fluxos de trabalho</b> (Workflows).</li>
        <li>Escolha <b>"Postar em um canal quando uma solicitação de webhook for recebida"</b>.</li>
        <li>Confirme o canal, clique em <b>Adicionar fluxo</b> e copie o endereço que aparece no fim.</li>
        <li>Cole aqui e salve. Depois use <b>Enviar teste agora</b>.</li></ol></details>
      <label class="lbl" for="em">E-mails da gestão (separados por vírgula)</label>
      <input id="em" class="campo" value="${esc(c.emails || '')}" placeholder="supervisor@empresa.com.br, gerente@empresa.com.br" />
      <label class="lbl" for="ep">E-mails do PCP · lista semanal de paradas</label>
      <input id="ep" class="campo" value="${esc(c.emails_pcp || '')}" placeholder="pcp@empresa.com.br" />
      <p class="sub">E-mail precisa de uma configuração única no Supabase (serviço de envio). Enquanto não estiver configurado, os avisos vão só para o Teams. Para o PCP sem e-mail, o resumo da segunda também vai para o Teams.</p>
      <div class="linha-btn"><button type="button" class="btn btn-sec" data-teste>${ic('sino')} Enviar teste agora</button><button type="button" class="btn btn-pri" data-salvar>Salvar</button></div>
      <p class="sub" data-res>${c.ultimo_envio ? `Último envio: ${dataHoraBR(c.ultimo_envio)} · ${esc(c.ultimo_resultado || '')}` : 'Nenhum envio ainda.'}</p>
    </section></div>`;
  const ler = () => ({ ativo: el.querySelector('[data-ativo]').checked, teams_webhook: el.querySelector('#tw').value.trim() || null, emails: el.querySelector('#em').value.trim() || null, emails_pcp: el.querySelector('#ep').value.trim() || null });
  el.querySelector('[data-salvar]').onclick = async () => { try { await salvarAvisos(ler()); toast('Avisos salvos.'); } catch (e) { toast('Não foi gravado: ' + (e?.message || e), 'erro'); } };
  el.querySelector('[data-teste]').onclick = async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Enviando…';
    try { await salvarAvisos(ler()); const r = await testarAvisos(); el.querySelector('[data-res]').textContent = 'Teste: ' + (r?.resultado || 'enviado'); toast('Teste enviado. Confira o Teams.'); }
    catch (e) { el.querySelector('[data-res]').textContent = 'Teste falhou: ' + (e?.message || e); toast('O teste falhou.', 'erro'); }
    b.disabled = false; b.innerHTML = `${ic('sino')} Enviar teste agora`;
  };
}

// ---------- verificação do selo (pública, sem login) ----------
export async function telaVerificacao(app, id) {
  app.innerHTML = `<div class="login"><div class="login-box verif"><img src="logo-vetore.png" alt="Vetore" class="login-logo" />
    <h1 class="login-tit">Verificação de autenticidade</h1><div class="bloco" data-v><p class="carregando">Conferindo…</p></div>
    <p class="login-pe">Relatório de manutenção preventiva · FR.06.08.002-A · Vetore</p></div></div>`;
  const box = app.querySelector('[data-v]');
  let d; try { d = await verificar(id); } catch (e) { box.innerHTML = `<p class="aviso aviso-red">${ic('alert')}<span>Não foi possível conferir agora (${esc(e?.message || e)}).</span></p>`; return; }
  const lin = (r, v) => `<div class="f-lin"><span>${r}</span><b>${v}</b></div>`;
  if (!d) { box.innerHTML = `<div class="verif-res ruim">${ic('x')}<b>Relatório não encontrado</b></div><p class="sub">O código <b>${esc(id)}</b> não existe no sistema. Este documento não é um relatório válido, ou o registro foi excluído.</p>`; return; }
  const ok = d.status === 'concluida' && d.integro;
  box.innerHTML = `<div class="verif-res ${ok ? 'bom' : d.status !== 'concluida' ? 'meio' : 'ruim'}">${ic(ok ? 'escudo' : 'alert')}<b>${ok ? 'Relatório autêntico e sem alterações' : d.status !== 'concluida' ? 'Relatório ainda não concluído' : 'Atenção: o relatório foi alterado depois de concluído'}</b></div>
    <div class="f-lins">${lin('Máquina', esc(d.codigo))}${lin('Preventiva de', nomeMes(d.ciclo))}${lin('Feita em', dataHoraBR(d.fim))}
    ${lin('Itens NOK', d.nok)}${lin('Manutentor', esc(d.manutentor || '—'))}${lin('Supervisor da área', esc(d.supervisor || '—'))}${lin('Gerente de manutenção', esc(d.gerente || '—'))}
    ${lin('Formulário', 'FR.06.08.002-A rev. ' + d.rev)}${d.selo ? lin('Selo', esc(d.selo.slice(0, 8).toUpperCase() + '-' + d.selo.slice(8, 16).toUpperCase())) : ''}</div>
    <p class="sub">Confira se o selo impresso no relatório é igual ao mostrado aqui.</p>`;
}
