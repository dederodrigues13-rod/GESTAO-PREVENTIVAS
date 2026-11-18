// =====================================================================
// GESTÃO DE PREVENTIVAS · Vetore — telas e navegação
//
// Endereços (hash):  #painel · #tv (quadro para monitor) · #cal-al · #cal-pps · #cal-fornos · #layout · #layout-pps
//   #layout-fornos · #registros · #etiquetas · #m-vtia-07 (formulário pelo QR)
//   #r-<id> (relatório) · #feriados
// Perfis: manutentor (preenche e assina), supervisor da área e gerente de
// manutenção (veem tudo, remarcam e assinam, nessa ordem).
// =====================================================================
import qrcode from 'qrcode-generator';
import { MAQUINAS, SETORES, MESES, FERIADOS_NACIONAIS, porSlug, porCodigo, mesesDoPeriodo, CRONOGRAMA } from './dados.js';
import { itens, porMaquina, ST, ST3D, COR3D, hoje, definirHoje, folgas, uteis, sugerirDia, aguardando } from './situacao.js';
import { registros, reprogramar, aoMudar, aoErro, ligar, carregar, folgasExtra, trabalhaEm, addFolga, rmFolga, alternarNacional, baixarPDF } from './store.js';
import { nomeArquivo, salvarArquivo, gerarPDF } from './relatorio.js';
import { instalarApp, estaInstalado } from './pwa.js';
import { EMAIL_DOMINIO } from './config.js';
import { esc, ic, dataBR, diaMes, semana, quando, abrirModal, toast, dataHoraBR, duracao, paraData, contarNumeros, esqueleto } from './ui.js';
import { telaFormulario, telaEnviado, telaRelatorio, confirmarExclusao } from './form.js';
import { telaAcoes, telaHistorico, telaIndicadores, telaAvisos, telaVerificacao, stAcao } from './telas.js';
import { acoes } from './store.js';
import { telaTV, sairTV } from './tv.js';
import { telaCorretivas, telaCorretivasMaquina, ouvirFavorito } from './corretivas.js';

const URL_APP = location.origin + '/';
const app = document.getElementById('app');
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };
let perfil = null, sb = null, usuario = null; // perfil vem do banco (tabela perfis)
const PERFIS = { manutentor: 'Manutentor', supervisor: 'Supervisor da área', gerente: 'Gerente de manutenção' };
const minhaEtapa = () => (perfil === 'supervisor' ? 'ag_sup' : perfil === 'gerente' ? 'ag_ger' : null);
const gestao = () => perfil !== 'manutentor';
const corSetor = { al: '#c9ced6', pps: '#b48cff', fornos: '#ff8a4c' };
const nomeMes = (ciclo) => { const [a, m] = ciclo.split('-'); return `${MESES[+m - 1]}/${a}`; };
const pill = (st) => `<span class="pill" style="--c:${ST[st].cor}">${ST[st].nome}</span>`;

// ---------- casca ----------
const ABAS = [
  ['painel', 'Painel', 'painel'], ['calendario', 'Calendário', 'cal'], ['layout', 'Layout 3D', 'cubo'],
  ['registros', 'Registros', 'lista'], ['acoes', 'Plano de ação', 'alvo'], ['corretivas', 'Corretivas', 'chave'], ['indicadores', 'Indicadores', 'grafico', true],
  ['feriados', 'Feriados', 'cal', true], ['avisos', 'Avisos', 'sino', true], ['etiquetas', 'Etiquetas QR', 'qr', true],
];
const TITULOS = { painel: 'Painel', calendario: 'Calendário', layout: 'Layout 3D', registros: 'Registros', acoes: 'Plano de ação', corretivas: 'Corretivas (SM)', indicadores: 'Indicadores', feriados: 'Feriados', avisos: 'Avisos', etiquetas: 'Etiquetas QR' };
const menuFixo = () => pref('prev-menu-fixo') === '1';
// tema: escuro (padrão, chão de fábrica) ou claro (escritório), lembrado no aparelho
const temaClaro = () => pref('prev-tema') === 'claro';
document.body.classList.toggle('claro', temaClaro());
const dataExtenso = () => { const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
// Mesmo layout do Gestão de Fluidos: menu lateral (recolhido em ícones, abre ao passar o
// cursor, ou fixo — lembrado no aparelho) e cabeçalho com o banner da Vetore.
function casca(rota) {
  const base = rota.startsWith('layout') ? 'layout' : rota.startsWith('cal') || rota === 'ano' ? 'calendario' : rota.startsWith('c-') ? 'corretivas' : rota;
  const maqC = rota.startsWith('c-') ? (rota === 'c-fornos' ? 'Fornos' : rota === 'c-sem' ? 'Sem máquina' : porSlug[rota.slice(2)]?.codigo || '') : '';
  const titulo = rota.startsWith('m-') ? 'Formulário' : rota.startsWith('r-') ? 'Relatório' : rota.startsWith('h-') ? 'Histórico' : maqC ? `Corretivas · ${maqC}` : TITULOS[base] || 'Painel';
  const pend = registros().filter((r) => r.status === minhaEtapa()).length;
  const venc = acoes().filter((a) => stAcao(a) === 'vencida').length;
  const links = ABAS.filter((x) => !x[3] || gestao()).map(([h, n, i]) => `<a href="#${h}" class="${base === h ? 'active' : ''}" title="${n}">${ic(i)}<span>${n}</span>${h === 'registros' && pend ? `<b class="badge">${pend}</b>` : ''}${h === 'acoes' && venc ? `<b class="badge badge-red">${venc}</b>` : ''}</a>`).join('');
  app.innerHTML = `
  <div class="shell ${menuFixo() ? 'fixo' : 'recolhido'}">
    <aside class="side" aria-label="Menu">
      <div class="side-topo"><button type="button" class="btn-fixar" data-fixar></button></div>
      <div class="brand"><div class="brand-title">Gestão de Preventivas</div><div class="brand-sub">Vetore · Injeção</div><div class="brand-mini" aria-hidden="true">GP</div></div>
      <nav class="nav">${links}</nav>
      <div class="side-foot"><button type="button" class="btn-sair" data-sair>${ic('logout')}<span>Sair</span></button></div>
    </aside>
    <div class="main">
      <header class="top">
        <div class="top-logo">Gestão de Preventivas</div>
        <div class="top-titles"><div class="top-data">${esc(dataExtenso())}</div><h1>${titulo}</h1></div>
        <div class="top-right">
          <button type="button" class="icon-btn btn-tema" data-tema aria-label="${temaClaro() ? 'Usar tema escuro' : 'Usar tema claro'}" title="${temaClaro() ? 'Usar tema escuro' : 'Usar tema claro'}">${ic(temaClaro() ? 'lua' : 'sol')}</button>
          ${estaInstalado() ? '' : `<button type="button" class="btn btn-sec btn-install" data-instalar>${ic('baixar')}<span>Instalar app</span></button>`}
          <span class="ola" title="${esc(usuario?.email || '')}">Olá, ${PERFIS[perfil]}</span>
          <button type="button" class="icon-btn top-sair" data-sair aria-label="Sair">${ic('logout')}</button>
        </div>
        <nav class="mob-nav" aria-label="Seções">${links}</nav>
      </header>
      <main id="tela" class="content"></main>
    </div>
  </div>`;
  const bi = app.querySelector('[data-instalar]'); if (bi) bi.onclick = () => instalarApp();
  app.querySelector('[data-tema]').onclick = () => { pref('prev-tema', temaClaro() ? 'escuro' : 'claro'); document.body.classList.toggle('claro', temaClaro()); rotear(); };
  app.querySelectorAll('[data-sair]').forEach((b) => { b.onclick = () => sb.auth.signOut(); });
  const shell = app.querySelector('.shell'), bf = app.querySelector('[data-fixar]');
  const pintar = () => { const f = shell.classList.contains('fixo'); bf.innerHTML = ic('menu'); bf.title = f ? 'Recolher o menu (abre ao passar o cursor)' : 'Fixar o menu aberto'; bf.setAttribute('aria-label', bf.title); bf.setAttribute('aria-pressed', String(f)); };
  pintar();
  bf.onclick = () => { const f = !shell.classList.contains('fixo'); shell.classList.toggle('fixo', f); shell.classList.toggle('recolhido', !f); pref('prev-menu-fixo', f ? '1' : '0'); pintar(); bf.blur(); };
  app.querySelectorAll('.side .nav a').forEach((x) => x.addEventListener('click', () => { if (shell.classList.contains('recolhido')) { shell.classList.add('fechando'); x.blur(); } }));
  return app.querySelector('#tela');
}

// ---------- ficha da máquina (3D, calendário, cards) ----------
function fichaHtml(codigo) {
  const s = porMaquina()[codigo]; if (!s) return '';
  const m = s.maquina, p = s.proxima, a = s.atrasada, u = s.ultima;
  const linha = (r, v) => `<div class="f-lin"><span>${r}</span><b>${v}</b></div>`;
  return `<div><h3>${esc(m.codigo)}</h3><p class="p3d-sub">${esc(m.equipamento)} · ${esc(m.modelo)}${m.celula ? ' · Célula ' + m.celula : ''}</p></div>
    <span class="p3d-pill" style="--c:${COR3D[s.st3d]}">${ST3D[s.st3d]}</span>
    <div class="f-lins">
      ${a ? linha('Atrasada desde', nomeMes(a.ciclo)) : ''}
      ${s.aguardando ? linha(ST[s.aguardando.st].nome, 'desde ' + dataHoraBR(s.aguardando.reg.fim)) : ''}
      ${linha('Próxima', p ? `${semana(p.data)}, ${dataBR(p.data)} · ${quando(p.dias)}` : '—')}
      ${p ? linha('Janela', `${MESES[+p.ciclo.slice(5) - 1]} · ${diaMes(p.janelaIni)} a ${diaMes(p.janelaFim)}`) : ''}
      ${linha('Última feita', u ? `${dataBR(u.reg.fim ? new Date(u.reg.fim).toISOString().slice(0, 10) : u.data)} · ${esc(u.reg.manutentor.nome)}` : 'nenhuma no sistema')}
      ${linha('Meses', { A: 'jan · abr · jul · out', B: 'fev · mai · ago · nov', C: 'mar · jun · set · dez' }[m.janela])}
    </div>
    <div class="f-btns"><a class="btn btn-pri btn-sm" href="#m-${m.slug}">Abrir formulário</a><a class="btn btn-sec btn-sm" href="#h-${m.slug}">${ic('historico')} Histórico</a>
      ${s.aguardando ? `<a class="btn btn-sec btn-sm" href="#r-${s.aguardando.reg.id}">Ver relatório</a>` : ''}</div>`;
}

// ---------- painel ----------
function painel(el) {
  const lista = itens(), h = hoje(), pm = porMaquina(lista);
  const abertas = lista.filter((i) => i.st !== 'concluida' && !aguardando(i.st));
  const prox = abertas.filter((i) => i.st !== 'atrasada');
  const atrasadas = lista.filter((i) => i.st === 'atrasada');
  const aguard = lista.filter((i) => aguardando(i.st));
  const minhas = aguard.filter((i) => i.st === minhaEtapa());
  const ciclos = [...new Set(lista.map((i) => i.ciclo))];
  const cicloRef = ciclos.includes(h.slice(0, 7)) ? h.slice(0, 7) : ciclos.find((c) => c > h.slice(0, 7)) || ciclos.at(-1);
  const doMes = lista.filter((i) => i.ciclo === cicloRef);
  const cont = (st) => doMes.filter((i) => i.st === st).length;
  const p0 = prox[0];
  const linhaItem = (i) => `<li><button type="button" class="ag" data-prog="${i.id}">
      <span class="ag-dia"><b>${i.data.slice(8)}</b><small>${semana(i.data)} · ${MESES[+i.data.slice(5, 7) - 1].slice(0, 3)}</small></span>
      <span class="ag-maq"><b>${esc(i.codigo)}</b><small><i style="background:${corSetor[i.setor]}"></i>${esc(porCodigo[i.codigo].equipamento)} · ${esc(porCodigo[i.codigo].modelo)}</small></span>
      ${pill(i.st)}</button></li>`;

  if (!gestao()) {
    // manutentor: o que fazer hoje e nos próximos dias
    const hojeL = abertas.filter((i) => i.st === 'hoje' || i.st === 'pendente' || i.st === 'atrasada');
    el.innerHTML = `<div class="pag estreita">
      <h1 class="tit">Minhas preventivas</h1>
      <p class="sub">Na máquina, escaneie o QR code para abrir o formulário dela. Ou toque na preventiva abaixo.</p>
      <h2 class="h2">Para fazer agora</h2>
      ${hojeL.length ? `<ul class="agenda">${hojeL.map(linhaItem).join('')}</ul>` : '<p class="vazio-p">Nada pendente para hoje.</p>'}
      <h2 class="h2">Próximas</h2><ul class="agenda">${prox.filter((i) => !hojeL.includes(i)).slice(0, 8).map(linhaItem).join('')}</ul>
      ${aguard.length ? `<h2 class="h2">Esperando assinaturas</h2><ul class="agenda">${aguard.map(linhaItem).join('')}</ul>` : ''}
    </div>`;
    ligarItens(el); return;
  }

  const porSetorAno = Object.keys(SETORES).map((s) => {
    const l = lista.filter((i) => i.setor === s); const f = l.filter((i) => i.st === 'concluida').length;
    return { s, f, t: l.length };
  });
  const feitasMes = cont('concluida');
  const ehHoje = p0 && p0.data === h;
  el.innerHTML = `<div class="pag">
    <div class="pag-acoes"><a class="btn btn-sec btn-sm" href="#tv" title="Tela cheia para o monitor do setor">${ic('tv')} Modo TV</a></div>
    <section class="hero">
      ${p0 ? `<div class="hero-prox">
        <p class="eyebrow ${ehHoje ? 'eyebrow-hoje' : ''}">${ehHoje ? `<span class="pulso"></span>Hoje · ${SETORES[p0.setor].curto}` : 'Próxima preventiva'}</p>
        <h1><span>${esc(p0.codigo)}</span><small>${esc(porCodigo[p0.codigo].equipamento)} · ${esc(porCodigo[p0.codigo].modelo)}</small></h1>
        <p class="hero-data"><b>${semana(p0.data)}, ${dataBR(p0.data)}</b> · ${quando(p0.dias)}${p0.reprogramada ? ' · reprogramada' : ''}</p>
        <div class="f-btns"><a class="btn btn-pri" href="#m-${porCodigo[p0.codigo].slug}">Abrir formulário</a><button type="button" class="btn btn-sec" data-prog="${p0.id}">Detalhes</button></div>
      </div>` : '<div class="hero-prox"><h1>Sem preventivas em aberto</h1></div>'}
      <div class="kpis">
        <p class="eyebrow">${nomeMes(cicloRef)}</p>
        <div class="anel-lin">${anelHtml(feitasMes, doMes.length)}<div><b class="anel-num" data-contar>${feitasMes} de ${doMes.length}</b><span class="muted">feitas no mês</span></div></div>
        <div class="kpi" style="--c:${ST.ag_sup.cor}"><b data-contar>${cont('ag_sup') + cont('ag_ger')}</b><span>aguardando assinaturas</span></div>
        <div class="kpi" style="--c:${atrasadas.length ? ST.atrasada.cor : ST.concluida.cor}"><b data-contar>${atrasadas.length}</b><span>atrasadas (total)</span></div>
      </div>
    </section>
    ${semanaHtml(lista, h)}
    <div class="col2">
      <section class="bloco">
        <div class="bloco-topo"><h2>Próximas preventivas</h2><a href="#calendario" class="link">Calendário completo</a></div>
        <ul class="agenda">${prox.slice(0, 10).map(linhaItem).join('')}</ul>
      </section>
      <div class="pilha">
        ${minhas.length ? `<section class="bloco destaque-azul"><h2>Para você assinar</h2><ul class="agenda">${minhas.map((i) => `<li><a class="ag ag-2" href="#r-${i.reg.id}"><span class="ag-maq"><b>${esc(i.codigo)}</b><small>${esc(i.reg.manutentor.nome)} · ${dataHoraBR(i.reg.fim)}</small></span>${pill(i.st)}</a></li>`).join('')}</ul></section>` : ''}
        ${aguard.length > minhas.length ? `<section class="bloco"><h2>Esperando outra assinatura</h2><ul class="agenda">${aguard.filter((i) => !minhas.includes(i)).map((i) => `<li><a class="ag ag-2" href="#r-${i.reg.id}"><span class="ag-maq"><b>${esc(i.codigo)}</b><small>${esc(i.reg.manutentor.nome)} · ${dataHoraBR(i.reg.fim)}</small></span>${pill(i.st)}</a></li>`).join('')}</ul></section>` : ''}
        ${(() => { const v = acoes().filter((a) => stAcao(a) === 'vencida'); const ab = acoes().filter((a) => a.status !== 'fechada'); return ab.length ? `<section class="bloco ${v.length ? 'destaque-vermelho' : ''}"><div class="bloco-topo"><h2>Plano de ação</h2><a href="#acoes" class="link">Ver ações</a></div><p class="sub"><b>${ab.length}</b> ações abertas${v.length ? `, <b style="color:var(--danger)">${v.length} vencidas</b>` : ''}.</p></section>` : ''; })()}
        ${atrasadas.length ? `<section class="bloco destaque-vermelho"><h2>Atrasadas</h2><ul class="agenda">${atrasadas.map(linhaItem).join('')}</ul></section>` : ''}
        <section class="bloco"><h2>Dez/2026 a dez/2027 por setor</h2>
          ${porSetorAno.map(({ s, f, t }) => `<div class="setor-lin"><span><i style="background:${corSetor[s]}"></i>${SETORES[s].curto}</span><div class="barra"><i style="width:${f / t * 100}%"></i></div><b>${f}/${t}</b></div>`).join('')}
          <p class="sub">${CRONOGRAMA.length} preventivas · ${MAQUINAS.length} máquinas · uma máquina parada por dia, no máximo.</p></section>
        <section class="bloco"><h2>Situação das máquinas</h2><div class="mini-maqs">${MAQUINAS.map((m) => { const s = pm[m.codigo]; return `<button type="button" class="mini" data-maq="${m.codigo}" style="--c:${COR3D[s.st3d]}" title="${ST3D[s.st3d]}"><b>${esc(m.codigo)}</b><small>${esc(s.rotulo)}</small></button>`; }).join('')}</div></section>
      </div>
    </div>
  </div>`;
  ligarItens(el); contarNumeros(el);
}

// anel de progresso do mês
function anelHtml(f, t) {
  const pct = t ? Math.round(f / t * 100) : 0;
  return `<svg class="anel" viewBox="0 0 36 36" role="img" aria-label="${pct}% feitas"><circle cx="18" cy="18" r="15.9" class="anel-fundo"></circle>
    <circle cx="18" cy="18" r="15.9" class="anel-val" style="stroke-dasharray:${pct} 100"></circle><text x="18" y="21.2" text-anchor="middle">${pct}%</text></svg>`;
}
// linha do tempo da semana: seg a sex, uma linha por setor, marca "agora"
function semanaHtml(lista, h) {
  let seg = segunda(h); if (fimSemana(h)) seg = somaDias(seg, 7);
  const dias = [0, 1, 2, 3, 4].map((k) => somaDias(seg, k));
  const nomes = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const doDia = (d, s) => lista.filter((i) => i.data === d && i.setor === s);
  const idx = dias.indexOf(h);
  const agora = new Date(); const frac = Math.min(1, Math.max(0, (agora.getHours() + agora.getMinutes() / 60 - 6) / 12));
  const bloco = (i) => `<button type="button" class="sem-bl st-${i.st}" data-prog="${i.id}" title="${esc(i.codigo)} · ${ST[i.st].nome}"><b>${esc(i.codigo)}</b><small>${i.st === 'concluida' ? 'Feita' : aguardando(i.st) ? ST[i.st].nome : esc(porCodigo[i.codigo].modelo)}</small></button>`;
  const fim = dias[4];
  const titulo = `Semana · ${+seg.slice(8)}${seg.slice(5, 7) !== fim.slice(5, 7) ? ' de ' + MESES[+seg.slice(5, 7) - 1] : ''} a ${+fim.slice(8)} de ${MESES[+fim.slice(5, 7) - 1]}`;
  const temAlgo = lista.some((i) => i.data >= seg && i.data <= fim);
  return `<section class="bloco sem-bloco">
    <div class="bloco-topo"><h2>${titulo}</h2><div class="sem-leg"><span><i class="lg-ok"></i>Feita</span><span><i class="lg-hoje"></i>Hoje</span><span><i class="lg-ag"></i>Assinando</span><span><i class="lg-atr"></i>Atrasada</span><span><i class="lg-prog"></i>Programada</span></div></div>
    ${temAlgo ? '' : '<p class="sub">Nenhuma parada para preventiva nesta semana.</p>'}
    <div class="sem-scroll"><div class="sem-grade" style="--hoje:${idx}">
      <div></div>${dias.map((d, k) => `<div class="sem-dia ${d === h ? 'sem-dia-hoje' : ''}">${nomes[k]} ${+d.slice(8)}${d === h ? ' · hoje' : ''}</div>`).join('')}
      ${Object.keys(SETORES).map((s) => `<div class="sem-setor"><i style="background:${corSetor[s]}"></i>${SETORES[s].curto}</div>${dias.map((d) => `<div class="sem-cel ${d === h ? 'sem-cel-hoje' : ''}${folgas()[d] ? ' sem-folga' : ''}">${folgas()[d] && !doDia(d, s).length ? `<small class="muted">${esc(folgas()[d])}</small>` : doDia(d, s).map(bloco).join('')}</div>`).join('')}`).join('')}
      ${idx >= 0 ? `<div class="sem-agora" style="--f:${frac}"><span>agora</span></div>` : ''}
    </div></div>
  </section>`;
}

// clique numa preventiva/máquina abre o detalhe
function ligarItens(el) {
  el.querySelectorAll('[data-prog]').forEach((b) => { b.onclick = () => detalheItem(b.dataset.prog); });
  el.querySelectorAll('[data-maq]').forEach((b) => { b.onclick = () => abrirModal({ titulo: b.dataset.maq, html: `<div class="ficha-modal">${fichaHtml(b.dataset.maq)}</div>` }); });
}
function detalheItem(id) {
  const todos = itens(), i = todos.find((x) => x.id === id); if (!i) return;
  const m = porCodigo[i.codigo], f = folgas();
  const dias = uteis(+i.ciclo.slice(0, 4), +i.ciclo.slice(5), f);
  const ocupados = new Map(todos.filter((x) => x.ciclo === i.ciclo && x.id !== i.id).map((x) => [x.data, x.codigo]));
  const sug = sugerirDia(i.ciclo, i.data, new Set(ocupados.keys()), f, i.data);
  abrirModal({ titulo: `${i.codigo} · ${nomeMes(i.ciclo)}`, html: `<div class="ficha-modal">${fichaHtml(i.codigo)}</div>
    <div class="det">${pill(i.st)}<p>Data ${i.autoRemarcada ? 'sugerida pelo sistema' : i.reprogramada ? 'remarcada' : 'do cronograma'}: <b>${semana(i.data)}, ${dataBR(i.data)}</b>${i.reprogramada && !i.autoRemarcada ? ` (era ${dataBR(i.sugerida)})` : ''}</p>
    ${i.autoRemarcada ? `<p class="aviso">${ic('alert')} Era ${dataBR(i.dataOriginal)}, que agora é dia sem expediente (${esc(i.motivo)}). O sistema sugeriu o dia útil livre mais próximo.</p>` : ''}
    ${i.reg ? `<a class="btn btn-sec btn-sm" href="#r-${i.reg.id}">Ver relatório</a>` : ''}
    ${gestao() && !i.reg ? `<div class="reprog"><h3>Remarcar dentro de ${MESES[+i.ciclo.slice(5) - 1]}</h3>
      <div class="dias">${dias.map((d) => `<button type="button" class="dia ${d === i.data ? 'on' : ''} ${d === sug ? 'sug' : ''} ${ocupados.has(d) ? 'ocup' : ''}" data-dia="${d}" ${ocupados.has(d) ? `title="${ocupados.get(d)} já está neste dia"` : ''}><b>${d.slice(8)}</b><small>${d === sug ? 'sugerido' : ocupados.get(d) || semana(d)}</small></button>`).join('')}</div>
      ${i.autoRemarcada ? `<button type="button" class="btn btn-sec btn-sm" data-fixar>Confirmar ${dataBR(i.data)}</button>` : ''}
      ${i.reprogramada ? '<button type="button" class="link" data-voltar>Voltar para a data do cronograma</button>' : ''}
      <p class="sub">"Sugerido" é o dia útil livre mais próximo, sem outra máquina parada. Dias com outra máquina mostram o código dela.</p></div>` : ''}</div>`,
  onAbrir: (c, fechar) => {
    c.querySelectorAll('[data-dia]').forEach((b) => { b.onclick = () => { fechar(); remarcar(i, b.dataset.dia); }; });
    const v = c.querySelector('[data-voltar]'); if (v) v.onclick = () => { reprogramar(i.id, null); fechar(); rotear(); };
    const fx = c.querySelector('[data-fixar]'); if (fx) fx.onclick = () => { reprogramar(i.id, i.data); fechar(); toast(`${i.codigo} confirmada em ${dataBR(i.data)}.`); rotear(); };
  } });
}

// ---------- cronogramas por setor: mês · semana · dia · ano ----------
// Cada setor tem a sua aba (#cal-al, #cal-pps, #cal-fornos). Nas visões de mês e
// semana dá para arrastar a máquina para outro dia (no computador); em todas,
// "Remarcar" abre os dias do mês. Se o dia escolhido já tem outra preventiva
// (de qualquer setor), aparece o aviso e a sugestão do dia livre mais próximo.
const NOMES_SETOR = { al: 'Injeção de alumínio', pps: 'PPS', fornos: 'Fornos' };
let visao = pref('prev-visao') || 'mes', refCal = null;
const PER_INI = '2026-12-01', PER_FIM = '2027-12-31';
const somaDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const segunda = (iso) => somaDias(iso, -((paraData(iso).getDay() + 6) % 7));
const fimSemana = (iso) => [0, 6].includes(paraData(iso).getDay());
const proxDiaSemana = (iso, dir) => { let d = somaDias(iso, dir); while (fimSemana(d)) d = somaDias(d, dir); return d; };
const limitar = (iso) => (iso < PER_INI ? PER_INI : iso > PER_FIM ? PER_FIM : iso);

function remarcar(i, nova) {
  if (!i || nova === i.data) return;
  const f = folgas(), outros = itens().filter((x) => x.id !== i.id);
  const ocup = new Set(outros.filter((x) => x.ciclo === i.ciclo).map((x) => x.data));
  const aplicar = (d) => { reprogramar(i.id, d === i.sugerida ? null : d); toast(`${i.codigo} remarcada para ${semana(d)}, ${dataBR(d)}.`); rotear(); };
  let problema = null;
  if (nova.slice(0, 7) !== i.ciclo) problema = `${i.codigo} é a preventiva de ${nomeMes(i.ciclo)} e precisa ficar dentro desse mês (periodicidade de 3 meses).`;
  else if (fimSemana(nova)) problema = `${dataBR(nova)} cai no fim de semana.`;
  else if (f[nova]) problema = `${dataBR(nova)} é dia sem expediente (${f[nova]}).`;
  const conflito = problema ? [] : outros.filter((x) => x.data === nova);
  if (!problema && !conflito.length) { aplicar(nova); return; }
  const alvo = nova.slice(0, 7) === i.ciclo ? nova : nova < i.janelaIni ? i.janelaIni : i.janelaFim;
  const sug = sugerirDia(i.ciclo, alvo, ocup, f);
  abrirModal({ titulo: `Remarcar ${i.codigo}`, html: `
    <div class="aviso ${problema ? 'aviso-red' : ''}">${ic('alert')}<div>${problema ? esc(problema)
      : `Em <b>${semana(nova)}, ${dataBR(nova)}</b> já tem preventiva: ${conflito.map((x) => `<b>${esc(x.codigo)}</b> (${NOMES_SETOR[x.setor]})`).join(', ')}. Seriam duas máquinas paradas no mesmo dia.`}</div></div>
    <div class="sugestao"><span>Sugestão</span><b>${semana(sug)}, ${dataBR(sug)}</b><small>${sug === i.data ? 'é a data atual: manter como está' : 'dia útil livre mais próximo, sem outra máquina parada'}</small></div>
    <div class="linha-btn">
      <button type="button" class="btn btn-sec" data-fechar>Cancelar</button>
      ${problema ? '' : `<button type="button" class="btn btn-sec" data-manter>Manter ${dataBR(nova)} mesmo assim</button>`}
      <button type="button" class="btn btn-pri" data-sug>${sug === i.data ? 'Manter data atual' : `Usar ${dataBR(sug)}`}</button></div>`,
  onAbrir: (c, fechar) => {
    c.querySelector('[data-sug]').onclick = () => { fechar(); if (sug !== i.data) aplicar(sug); };
    const mt = c.querySelector('[data-manter]'); if (mt) mt.onclick = () => { fechar(); aplicar(nova); };
  } });
}

function calendario(el, setor) {
  const todos = itens(), lista = todos.filter((i) => i.setor === setor), f = folgas(), h = hoje();
  if (!refCal) { const p = lista.find((i) => i.data >= h); refCal = p ? p.data : limitar(h); }
  refCal = limitar(refCal); if (visao !== 'ano' && fimSemana(refCal)) refCal = proxDiaSemana(refCal, 1);
  const doDia = (d) => lista.filter((i) => i.data === d);
  const outrosDia = (d) => todos.filter((i) => i.data === d && i.setor !== setor);
  const maqTxt = (i) => esc(porCodigo[i.codigo].modelo);
  const chip = (i) => `<button type="button" class="cm" draggable="${gestao() && !i.reg}" data-prog="${i.id}" style="--c:${ST[i.st].cor};--s:${corSetor[i.setor]}"><b>${esc(i.codigo)}${i.autoRemarcada ? ' *' : ''}</b><small>${ST[i.st].nome}</small></button>`;
  const outrosTxt = (d) => { const o = outrosDia(d); return o.length ? `<small class="outro" title="Outro setor neste dia">${o.map((x) => esc(x.codigo)).join(', ')}</small>` : ''; };
  const ferTxt = (d) => (f[d] ? `<small class="fer">${esc(f[d])}</small>` : '');
  const cartao = (i, grande) => `<div class="wk ${grande ? 'wk-g' : ''}" draggable="${gestao() && !i.reg}" data-arrasta="${i.id}" style="--c:${ST[i.st].cor}">
      <div class="wk-t"><b>${esc(i.codigo)}</b>${pill(i.st)}</div>
      <small>${esc(porCodigo[i.codigo].equipamento)} · ${maqTxt(i)}</small>
      ${grande ? `<small>Janela: ${MESES[+i.ciclo.slice(5) - 1]} (${diaMes(i.janelaIni)} a ${diaMes(i.janelaFim)})${i.reprogramada || i.autoRemarcada ? ` · ${i.autoRemarcada ? 'sugerida pelo sistema' : 'remarcada'} (era ${dataBR(i.autoRemarcada ? i.dataOriginal : i.sugerida)})` : ''}</small>` : ''}
      <div class="f-btns">${i.reg ? `<a class="btn btn-sec btn-sm" href="#r-${i.reg.id}">Relatório</a>` : `<a class="btn btn-pri btn-sm" href="#m-${porCodigo[i.codigo].slug}">Formulário</a>`}
        ${gestao() && !i.reg ? `<button type="button" class="btn btn-sec btn-sm" data-prog="${i.id}">Remarcar</button>` : ''}</div></div>`;

  let titulo, corpo, passo;
  if (visao === 'mes') {
    const [ano, mes] = refCal.split('-').map(Number), ciclo = refCal.slice(0, 7);
    const doMes = lista.filter((i) => i.ciclo === ciclo);
    const cel = []; const off = (new Date(ano, mes - 1, 1).getDay() + 6) % 7;
    for (let k = 0; k < Math.min(off, 5); k++) cel.push(null);
    for (let d = 1; d <= new Date(ano, mes, 0).getDate(); d++) { const iso = `${ciclo}-${String(d).padStart(2, '0')}`; if (!fimSemana(iso)) cel.push(iso); }
    titulo = `${MESES[mes - 1]} ${ano}<small>${doMes.length} preventivas · ${uteis(ano, mes).length} dias úteis</small>`;
    passo = (dir) => { const d = paraData(refCal); d.setDate(1); d.setMonth(d.getMonth() + dir); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
    corpo = `<div class="cal"><div class="cal-sem">${['seg', 'ter', 'qua', 'qui', 'sex'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grade">${cel.map((d) => !d ? '<div class="cal-d vazio"></div>' : `<div class="cal-d ${d === h ? 'hoje' : ''} ${f[d] ? 'feriado' : ''}" data-dia="${d}"><button type="button" class="n" data-ir-dia="${d}" aria-label="Ver o dia ${dataBR(d)}">${+d.slice(8)}</button>${ferTxt(d)}${doDia(d).map(chip).join('')}${outrosTxt(d)}</div>`).join('')}</div></div>
      <ul class="agenda so-celular">${doMes.map((i) => `<li><button type="button" class="ag" data-prog="${i.id}"><span class="ag-dia"><b>${i.data.slice(8)}</b><small>${semana(i.data)}</small></span><span class="ag-maq"><b>${esc(i.codigo)}</b><small>${maqTxt(i)}</small></span>${pill(i.st)}</button></li>`).join('') || '<li class="vazio-p">Nenhuma preventiva neste mês.</li>'}</ul>`;
  } else if (visao === 'semana') {
    const seg = segunda(refCal), dias = [0, 1, 2, 3, 4].map((k) => somaDias(seg, k));
    titulo = `Semana de ${diaMes(dias[0])} a ${diaMes(dias[4])}<small>${dias.reduce((s, d) => s + doDia(d).length, 0)} preventivas · ${MESES[+dias[2].slice(5, 7) - 1]} ${dias[2].slice(0, 4)}</small>`;
    passo = (dir) => somaDias(seg, 7 * dir);
    corpo = `<div class="semana">${dias.map((d) => `<div class="sem-col ${d === h ? 'hoje' : ''} ${f[d] ? 'feriado' : ''}" data-dia="${d}">
        <button type="button" class="sem-cab" data-ir-dia="${d}"><b>${semana(d)}</b><span>${diaMes(d)}</span></button>${ferTxt(d)}
        ${doDia(d).map((i) => cartao(i, false)).join('') || (f[d] ? '' : '<p class="sem-vazio">livre</p>')}${outrosTxt(d)}</div>`).join('')}</div>`;
  } else if (visao === 'dia') {
    const d = refCal, l = doDia(d), prox = lista.find((i) => i.data > d);
    titulo = `${semana(d)}, ${dataBR(d)}<small>${l.length ? `${l.length} preventiva${l.length > 1 ? 's' : ''}` : 'sem preventiva'}${f[d] ? ' · ' + esc(f[d]) : ''}</small>`;
    passo = (dir) => proxDiaSemana(d, dir);
    corpo = `<div class="dia-v">${l.map((i) => cartao(i, true)).join('') || `<p class="vazio-p">Nenhuma preventiva de ${NOMES_SETOR[setor]} neste dia.${prox ? ` Próxima: <button type="button" class="link" data-ir-dia="${prox.data}">${esc(prox.codigo)} em ${semana(prox.data)}, ${dataBR(prox.data)}</button>` : ''}</p>`}
      ${outrosDia(d).length ? `<p class="sub">Outro setor neste dia: ${outrosDia(d).map((x) => `${esc(x.codigo)} (${NOMES_SETOR[x.setor]})`).join(', ')}</p>` : ''}</div>`;
  } else {
    const meses = mesesDoPeriodo(), maqs = MAQUINAS.filter((m) => m.setor === setor);
    titulo = `Dez/2026 a dez/2027<small>${lista.length} preventivas · FR.06.08.068 · periodicidade de 3 meses</small>`; passo = null;
    corpo = `<div class="scroll anual-wrap"><table class="anual"><thead><tr><th>Máquina</th>${meses.map((x) => `<th>${MESES[x.mes - 1].slice(0, 3)}<small>${String(x.ano).slice(2)}</small></th>`).join('')}</tr></thead><tbody>
      ${maqs.map((m) => `<tr><th><b>${m.codigo}</b><small>${esc(m.modelo)}</small></th>${meses.map((x) => { const i = lista.find((q) => q.codigo === m.codigo && q.ciclo === x.ciclo); return i ? `<td><button type="button" data-prog="${i.id}" style="--c:${ST[i.st].cor}" title="${ST[i.st].nome} · ${dataBR(i.data)}">${i.data.slice(8)}</button></td>` : '<td></td>'; }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  el.innerHTML = `<div class="pag larga">
    <div class="pag-topo pag-topo-acao"><h1 class="tit">Cronograma de preventivas</h1>${gestao() ? `<button type="button" class="btn btn-sec" data-excel>${ic('excel')} Exportar FR.06.08.068 (Excel)</button>` : ''}</div>
    <nav class="setor-tabs" aria-label="Setor">${Object.keys(SETORES).map((k) => { const l = todos.filter((i) => i.setor === k), px = l.find((i) => i.data >= h && i.st !== 'concluida' && !aguardando(i.st));
      return `<a href="#cal-${k}" class="${k === setor ? 'on' : ''}" style="--s:${corSetor[k]}"><b>${NOMES_SETOR[k]}</b><small>${MAQUINAS.filter((m) => m.setor === k).length} máquinas · ${l.length} preventivas${px ? ` · próxima ${esc(px.codigo)} ${diaMes(px.data)}` : ''}</small></a>`; }).join('')}</nav>
    <div class="cal-barra">
      <div class="seg-tabs" role="group" aria-label="Visão">${[['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['ano', 'Ano']].map(([k, n]) => `<button type="button" class="${visao === k ? 'on' : ''}" data-visao="${k}">${n}</button>`).join('')}</div>
      <div class="mes-nav">${passo ? `<button type="button" class="icone" data-passo="-1" aria-label="Anterior">${ic('chevL')}</button>` : ''}<h2>${titulo}</h2>${passo ? `<button type="button" class="icone" data-passo="1" aria-label="Próximo">${ic('chevR')}</button>` : ''}</div>
      ${passo ? `<button type="button" class="btn btn-sec btn-sm" data-hoje-cal>Hoje</button>` : '<span></span>'}
    </div>
    ${gestao() && (visao === 'mes' || visao === 'semana') ? '<p class="sub dica-arrasta">No computador, arraste a máquina para outro dia. Ou toque nela e use "Remarcar".</p>' : ''}
    ${corpo}
    <div class="legenda">${Object.entries(ST).map(([k, s]) => `<span><i class="anel" style="border-color:${s.cor}"></i>${s.nome}</span>`).join('')}<span class="sep"></span><span>* data sugerida pelo sistema (feriado)</span><span><small class="outro">VTFE 04</small> máquina de outro setor no mesmo dia</span></div>
  </div>`;
  const redesenhar = () => calendario(el, setor);
  const bx = el.querySelector('[data-excel]'); if (bx) bx.onclick = () => abrirModal({ titulo: 'Exportar cronograma', html: `<p>Gera a planilha <b>FR.06.08.068</b> nas 3 abas (PPS, alumínio e fornos), com PROGRAMADO e REALIZADO marcados a partir dos relatórios assinados.</p>
    <div class="linha-btn"><button type="button" class="btn btn-sec" data-ano="2026">Ano 2026 (só dezembro)</button><button type="button" class="btn btn-pri" data-ano="2027">Ano 2027</button></div>`,
    onAbrir: (c, fechar) => c.querySelectorAll('[data-ano]').forEach((b) => { b.onclick = async () => { b.disabled = true; b.textContent = 'Gerando…'; try { const { exportarCronograma } = await import('./excel.js'); const n = await exportarCronograma(+b.dataset.ano); fechar(); toast(n + ' gerado.'); } catch (e) { if (e?.code !== 'declined') toast('Não foi possível gerar: ' + (e?.message || e), 'erro'); fechar(); } }; }) });
  el.querySelectorAll('[data-visao]').forEach((b) => { b.onclick = () => { visao = b.dataset.visao; pref('prev-visao', visao); redesenhar(); }; });
  el.querySelectorAll('[data-passo]').forEach((b) => { b.onclick = () => { refCal = passo(+b.dataset.passo); redesenhar(); }; });
  const bh = el.querySelector('[data-hoje-cal]'); if (bh) bh.onclick = () => { refCal = limitar(h); redesenhar(); };
  el.querySelectorAll('[data-ir-dia]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); refCal = b.dataset.irDia; visao = 'dia'; pref('prev-visao', visao); redesenhar(); }; });
  // arrastar e soltar (mês e semana)
  el.querySelectorAll('[draggable="true"]').forEach((c) => { c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.prog || c.dataset.arrasta); e.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastando'); }; c.ondragend = () => c.classList.remove('arrastando'); });
  el.querySelectorAll('[data-dia]').forEach((z) => {
    z.ondragover = (e) => { e.preventDefault(); z.classList.add('alvo'); };
    z.ondragleave = () => z.classList.remove('alvo');
    z.ondrop = (e) => { e.preventDefault(); z.classList.remove('alvo'); const id = e.dataTransfer.getData('text/plain'); remarcar(itens().find((x) => x.id === id), z.dataset.dia); };
  });
  ligarItens(el);
}

// ---------- layout 3D ----------
let cena = null;
async function layout(el, qual) {
  const nomes = { layout: ['al', 'Injeção de alumínio'], 'layout-pps': ['pps', 'PPS'], 'layout-fornos': ['fornos', 'Fornos torre e de espera'] };
  const [setor] = nomes[qual];
  const pm = porMaquina(); const maqs = MAQUINAS.filter((m) => m.setor === setor);
  const pequeno = window.matchMedia('(max-width: 760px)').matches;
  el.innerHTML = `<div class="pag larga">
    <div class="filtros"><div class="seg-tabs">${Object.entries(nomes).map(([h, [, n]]) => `<a href="#${h}" class="${h === qual ? 'on' : ''}">${n}</a>`).join('')}</div>
      <div class="legenda">${Object.entries(ST3D).map(([k, n]) => `<span><i style="background:${COR3D[k]}"></i>${n}</span>`).join('')}</div></div>
    ${pequeno ? `<button type="button" class="btn btn-sec" data-ver3d>${ic('cubo')} Ver em 3D</button>` : ''}
    <div class="p3d-caixa" data-p3d ${pequeno ? 'hidden' : ''}></div>
    ${setor === 'fornos' ? '<p class="sub nota-3d">Posições dos fornos de espera ilustrativas: falta confirmar em qual célula fica cada VTFE. Os fornos torre 1 e 2 também aparecem no galpão da injeção de alumínio.</p>' : ''}
    ${setor === 'pps' ? '<p class="sub nota-3d">Posições do PPS ilustrativas: falta o croqui do setor.</p>' : ''}
    <div class="cards">${maqs.map((m) => { const s = pm[m.codigo]; return `<button type="button" class="card-maq" data-maq="${m.codigo}" style="--c:${COR3D[s.st3d]}"><b>${m.codigo}</b><small>${esc(m.modelo)}</small><span>${ST3D[s.st3d]}</span><em>${s.proxima ? `${semana(s.proxima.data)} ${dataBR(s.proxima.data)}` : '—'}</em></button>`; }).join('')}</div>
  </div>`;
  ligarItens(el);
  const caixa = el.querySelector('[data-p3d]');
  const montar = async () => {
    caixa.hidden = false; cena?.destruir?.(); cena = null;
    const lista = Object.values(porMaquina()).map((s) => ({ nome: s.nome, st3d: s.st3d, rotulo: s.rotulo }));
    try {
      if (setor === 'al') { const { criarPlanta3D } = await import('./planta3d.js'); cena = await criarPlanta3D(caixa, { ficha: fichaHtml }); }
      else { const { criarCena3D } = await import('./cena3d.js'); cena = await criarCena3D(caixa, { layout: setor, ficha: fichaHtml, modelos: Object.fromEntries(MAQUINAS.map((m) => [m.codigo, m.modelo])) }); }
      cena.atualizar(lista);
      const alvo = sessionStorage.getItem?.('prev-abrir3d'); if (alvo) { sessionStorage.removeItem('prev-abrir3d'); cena.abrir(alvo); }
    } catch (e) { console.error(e); caixa.innerHTML = `<div class="p3d-erro">${ic('alert')} Não foi possível abrir o 3D neste navegador (${esc(e.message || e)}). Use os cards abaixo.</div>`; }
  };
  if (pequeno) el.querySelector('[data-ver3d]').onclick = (e) => { e.currentTarget.remove(); montar(); };
  else montar();
}

// ---------- registros ----------
let filtroReg = { setor: '', st: '', q: '' };
function telaRegistros(el) {
  const todos = registros().filter((r) => r.status !== 'rascunho').sort((a, b) => (b.fim || 0) - (a.fim || 0));
  const f = filtroReg, q = f.q.trim().toUpperCase();
  const regs = todos.filter((r) => (!f.setor || porCodigo[r.codigo]?.setor === f.setor) && (!f.st || r.status === f.st) && (!q || r.codigo.includes(q) || (r.manutentor?.nome || '').toUpperCase().includes(q)));
  el.innerHTML = `<div class="pag"><div class="pag-topo"><h1 class="tit">Registros de preventiva</h1><p class="sub">Todos os relatórios enviados. Azul espera o supervisor, roxo espera o gerente. Os concluídos ficam guardados em PDF na pasta do sistema.</p></div>
    <div class="filtros reg-filtros">
      <div class="chips">${[['', 'Todos os setores'], ...Object.entries(SETORES).map(([k, x]) => [k, x.curto])].map(([k, n]) => `<button type="button" class="chip ${f.setor === k ? 'on' : ''}" data-fs="${k}">${n}</button>`).join('')}</div>
      <div class="chips">${[['', 'Todas'], ['ag_sup', 'Aguardando supervisor'], ['ag_ger', 'Aguardando gerente'], ['concluida', 'Concluídas']].map(([k, n]) => `<button type="button" class="chip ${f.st === k ? 'on' : ''}" data-fst="${k}">${n}</button>`).join('')}</div>
      <input class="campo busca" type="search" placeholder="Máquina ou manutentor" value="${esc(f.q)}" data-q aria-label="Buscar" />
    </div>
    ${regs.length ? `<table class="tab stack"><thead><tr><th>Máquina</th><th>Preventiva de</th><th>Manutentor</th><th>Feita em</th><th class="num">Tempo</th><th class="num">NOK</th><th>Situação</th><th>PDF</th>${perfil === 'gerente' ? '<th><span class="sr">Excluir</span></th>' : ''}</tr></thead><tbody>
      ${regs.map((r) => `<tr data-ir="${r.id}"><td data-l="Máquina"><b>${esc(r.codigo)}</b></td><td data-l="Preventiva de">${nomeMes(r.ciclo)}${r.antecipada ? ' · antecipada' : ''}</td><td data-l="Manutentor">${esc(r.manutentor?.nome || '')}</td><td data-l="Feita em">${dataHoraBR(r.fim)}</td><td data-l="Tempo" class="num">${duracao(r.fim - r.inicio)}</td><td data-l="NOK" class="num">${Object.values(r.respostas).filter((v) => v.v === 'nok').length}</td><td data-l="Situação">${pill(ST[r.status] ? r.status : 'ag_sup')}</td>
        <td data-l="PDF">${r.status === 'concluida' ? `<button type="button" class="btn btn-sec btn-sm" data-baixar="${r.id}">${ic('baixar')} Baixar</button>` : '—'}</td>
        ${perfil === 'gerente' ? `<td data-l="Excluir"><button type="button" class="icone btn-excluir" data-excluir="${r.id}" aria-label="Excluir registro da ${esc(r.codigo)}" title="Excluir registro">${ic('lixo')}</button></td>` : ''}</tr>`).join('')}
    </tbody></table>` : `<div class="vazio-grande">${ic('lista', 'ic-lg')}<p>${todos.length ? 'Nenhum registro com esse filtro.' : 'Nenhuma preventiva registrada ainda.'}</p></div>`}</div>`;
  el.querySelectorAll('[data-ir]').forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('[data-baixar], [data-excluir]')) return; location.hash = 'r-' + tr.dataset.ir; }; });
  el.querySelectorAll('[data-excluir]').forEach((b) => { b.onclick = () => confirmarExclusao(todos.find((x) => x.id === b.dataset.excluir), () => telaRegistros(el)); });
  el.querySelectorAll('[data-fs]').forEach((b) => { b.onclick = () => { f.setor = b.dataset.fs; telaRegistros(el); }; });
  el.querySelectorAll('[data-fst]').forEach((b) => { b.onclick = () => { f.st = b.dataset.fst; telaRegistros(el); }; });
  const qi = el.querySelector('[data-q]'); qi.oninput = () => { f.q = qi.value; clearTimeout(qi.t); qi.t = setTimeout(() => { telaRegistros(el); const n = el.querySelector('[data-q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
  el.querySelectorAll('[data-baixar]').forEach((b) => { b.onclick = async () => {
    const r = todos.find((x) => x.id === b.dataset.baixar); b.disabled = true;
    try { const blob = r.pdf_path ? await baixarPDF(r.pdf_path) : await gerarPDF(r, porCodigo[r.codigo]); await salvarArquivo(nomeArquivo(r), blob); }
    catch (e) { toast('Não foi possível baixar: ' + (e?.message || e), 'erro'); }
    b.disabled = false;
  }; });
}

// ---------- etiquetas QR ----------
function qrSvg(texto) {
  const gerar = typeof qrcode === 'function' ? qrcode : qrcode.default || qrcode.qrcode;
  const qr = gerar(0, 'M'); qr.addData(texto); qr.make();
  const n = qr.getModuleCount(), mg = 2; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + mg} ${r + mg}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + mg * 2} ${n + mg * 2}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function etiquetas(el) {
  let base = URL_APP;
  const desenhar = () => {
    el.querySelector('[data-grid]').innerHTML = Object.keys(SETORES).map((s) => `<h2 class="h2">${SETORES[s].nome}</h2><div class="etq-grid">${MAQUINAS.filter((m) => m.setor === s).map((m) => {
      const url = `${base.replace(/#.*$/, '')}#m-${m.slug}`;
      return `<div class="etq"><div class="etq-faixa"></div><div class="etq-corpo"><div class="etq-txt"><img src="logo-vetore.png" alt="Vetore" /><b>${m.codigo}</b><span>${esc(m.equipamento)}</span><span>${esc(m.modelo)}</span><em>Preventiva · escaneie</em></div><div class="etq-qr">${qrSvg(url)}</div></div>
        <button type="button" class="link" data-copiar="${esc(url)}">${ic('copiar')} Copiar link</button></div>`;
    }).join('')}</div>`).join('');
    el.querySelectorAll('[data-copiar]').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copiar); toast('Link copiado.'); } catch { toast(b.dataset.copiar, 'info'); } }; });
  };
  el.innerHTML = `<div class="pag"><div class="pag-topo"><h1 class="tit">Etiquetas QR</h1><p class="sub">Uma por máquina. O manutentor escaneia e cai direto no formulário daquela máquina.</p></div>
    <div class="bloco etq-config"><label for="url">Endereço do sistema usado no QR</label><input id="url" class="campo" value="${esc(base)}" readonly />
    <p class="sub">Imprima (Ctrl+P) em etiqueta de poliéster ou plastificada, resistente a óleo e calor. O manutentor entra uma vez com o login da manutenção e, depois, cada QR abre direto o formulário da máquina.</p></div>
    <div data-grid></div></div>`;
  desenhar();
}

// ---------- feriados e dias sem expediente ----------
function feriados(el) {
  const ext = folgasExtra(), trab = new Set(trabalhaEm()), lista = itens();
  const movidas = lista.filter((i) => i.autoRemarcada);
  const linhas = [
    ...Object.entries(FERIADOS_NACIONAIS).map(([d, n]) => ({ d, n, tipo: 'nacional', ativo: !trab.has(d) })),
    ...Object.entries(ext).map(([d, n]) => ({ d, n, tipo: 'extra', ativo: true })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  el.innerHTML = `<div class="pag estreita"><div class="pag-topo"><h1 class="tit">Feriados e dias sem expediente</h1>
    <p class="sub">Vale só para o cronograma de preventivas. Ao marcar um dia, só as preventivas daquele dia mudam: o sistema sugere o dia útil livre mais próximo do mesmo mês, sem outra máquina parada. Você pode trocar o dia depois.</p></div>
    <section class="bloco"><h2>Acrescentar dia</h2>
      <div class="fer-add"><input type="date" class="campo" data-novo-d min="2026-12-01" max="2027-12-31" aria-label="Data" /><input class="campo" data-novo-n placeholder="Ex.: Carnaval, aniversário da cidade, férias coletivas" aria-label="Motivo" />
      <button type="button" class="btn btn-pri" data-add>${ic('plus')} Acrescentar</button></div>
      <p class="sub">Carnaval e Corpus Christi não são feriados nacionais (são ponto facultativo); acrescente se a fábrica não trabalhar.</p></section>
    ${movidas.length ? `<section class="bloco destaque-amarelo"><h2>Preventivas remarcadas por feriado</h2><ul class="agenda">${movidas.map((i) => `<li><button type="button" class="ag" data-prog="${i.id}"><span class="ag-dia"><b>${i.data.slice(8)}</b><small>${semana(i.data)} · ${MESES[+i.data.slice(5, 7) - 1].slice(0, 3)}</small></span><span class="ag-maq"><b>${esc(i.codigo)}</b><small>era ${dataBR(i.dataOriginal)} · ${esc(i.motivo)}</small></span><span class="pill" style="--c:#ffc20e">Sugerida</span></button></li>`).join('')}</ul><p class="sub">Toque para confirmar ou trocar o dia.</p></section>` : ''}
    <section class="bloco"><h2>Dez/2026 a dez/2027</h2>
      <ul class="fer-lista">${linhas.map((x) => `<li class="${x.ativo ? '' : 'off'}"><span class="fer-d"><b>${dataBR(x.d)}</b><small>${semana(x.d)}</small></span><span class="fer-n">${esc(x.n)}<small>${x.tipo === 'nacional' ? 'Feriado nacional' : 'Acrescentado'}${x.ativo ? '' : ' · a fábrica trabalha'}</small></span>
        ${x.tipo === 'nacional' ? `<button type="button" class="btn btn-sec btn-sm" data-nac="${x.d}">${x.ativo ? 'Fábrica trabalha' : 'Voltar a ser feriado'}</button>` : `<button type="button" class="btn btn-sec btn-sm" data-rm="${x.d}">Remover</button>`}</li>`).join('')}</ul></section></div>`;
  el.querySelector('[data-add]').onclick = () => {
    const d = el.querySelector('[data-novo-d]').value, n = el.querySelector('[data-novo-n]').value.trim();
    if (!d) { toast('Escolha a data.', 'erro'); return; }
    const afetadas = lista.filter((i) => i.data === d);
    addFolga(d, n || 'Sem expediente');
    toast(afetadas.length ? `${dataBR(d)} sem expediente. ${afetadas.map((i) => i.codigo).join(', ')} ganhou nova data sugerida.` : `${dataBR(d)} marcado sem expediente.`);
    feriados(el);
  };
  el.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { rmFolga(b.dataset.rm); feriados(el); }; });
  el.querySelectorAll('[data-nac]').forEach((b) => { b.onclick = () => { alternarNacional(b.dataset.nac); feriados(el); }; });
  ligarItens(el);
}

// ---------- roteador ----------
function rotear() {
  const rota = (location.hash || '#painel').slice(1) || 'painel';
  window.scrollTo(0, 0);
  if (rota === 'tv') { telaTV(app); return; }
  sairTV();
  if (rota === 'corretivas') { telaCorretivas(casca(rota), { gestao: gestao() }); return; }
  if (rota.startsWith('c-')) { telaCorretivasMaquina(casca(rota), rota.slice(2), { gestao: gestao() }); return; }
  if (rota.startsWith('m-')) {
    const m = porSlug[rota.slice(2)];
    const el = casca(rota);
    if (!m) { el.innerHTML = '<div class="pag"><p class="vazio-p">Máquina não encontrada.</p></div>'; return; }
    const s = porMaquina()[m.codigo];
    if (s.aguardando && !s.atual) { location.hash = 'r-' + s.aguardando.reg.id; return; }
    telaFormulario(el, { maq: s, item: s.atual, aoTerminar: (r) => { telaEnviado(el, r); } });
    return;
  }
  if (rota.startsWith('v-')) { telaVerificacao(app, rota.slice(2)); return; }
  if (rota.startsWith('r-')) { const el = casca(rota); telaRelatorio(el, { id: rota.slice(2), perfil, maqDe: (c) => porCodigo[c] }); return; }
  const el = casca(rota);
  if (rota === 'calendario' || rota === 'ano') { if (rota === 'ano') visao = 'ano'; location.replace('#cal-' + (pref('prev-setor') || 'al')); return; }
  if (/^cal-(al|pps|fornos)$/.test(rota)) { pref('prev-setor', rota.slice(4)); calendario(el, rota.slice(4)); }
  else if (rota.startsWith('layout')) layout(el, ['layout', 'layout-pps', 'layout-fornos'].includes(rota) ? rota : 'layout');
  else if (rota === 'registros') telaRegistros(el);
  else if (rota === 'etiquetas' && gestao()) etiquetas(el);
  else if (rota === 'feriados' && gestao()) feriados(el);
  else if (rota === 'acoes') telaAcoes(el, { perfil });
  else if (rota === 'indicadores' && gestao()) telaIndicadores(el);
  else if (rota === 'avisos' && gestao()) telaAvisos(el);
  else if (rota.startsWith('h-')) telaHistorico(el, rota.slice(2));
  else painel(el);
}
// ---------- início: Supabase, login e perfil ----------
function telaAviso(titulo, texto, botoes = '') {
  app.innerHTML = `<div class="login"><div class="login-box"><img src="logo-vetore.png" alt="Vetore" class="login-logo" />
    <div class="bloco"><h2>${titulo}</h2><p>${texto}</p>${botoes}</div></div></div>`;
  app.querySelector('[data-rec]')?.addEventListener('click', () => location.reload());
  app.querySelector('[data-sair]')?.addEventListener('click', () => sb.auth.signOut());
}
async function telaLogin() {
  const { default: render } = await import('./login.js');
  render(app, { sb, dominio: EMAIL_DOMINIO, maquina: porSlug[(location.hash.match(/^#m-(.+)$/) || [])[1]] }, entrar);
}
let rodando = false;
async function entrar(session) {
  usuario = session.user;
  const { data, error } = await sb.from('perfis').select('perfil').eq('user_id', usuario.id).maybeSingle();
  if (error) return telaAviso('Erro ao carregar o perfil', esc(error.message), '<button class="btn btn-pri" data-rec>Recarregar</button>');
  if (!data) return telaAviso('Login sem perfil', `O usuário <b>${esc(usuario.email)}</b> entrou, mas ainda não tem perfil. Rode o script <b>02_perfis.sql</b> no Supabase com este e-mail.`, '<button class="btn btn-sec" data-sair>Sair</button>');
  perfil = data.perfil;
  app.innerHTML = esqueleto('Carregando preventivas');
  try { await carregar(); } catch (e) { return telaAviso('Sem conexão com o banco', esc(e.message || e), '<button class="btn btn-pri" data-rec>Tentar de novo</button>'); }
  rodando = true; rotear();
}
async function iniciar() {
  let mod;
  try { mod = await import('./supabase.js'); } catch { return telaAviso('Não foi possível carregar o sistema', 'Verifique a internet e recarregue a página.', '<button class="btn btn-pri" data-rec>Recarregar</button>'); }
  if (!mod.configurado) return telaAviso('Falta configurar o Supabase', 'Abra o arquivo <b>config.js</b> no GitHub e cole a <b>Publishable key</b> do projeto. A Vercel publica sozinha em cerca de 1 minuto.');
  sb = mod.sb; ligar(sb, mod.msgErro);
  // verificação do selo do PDF: pública, não precisa de login
  if (location.hash.startsWith('#v-')) { telaVerificacao(app, location.hash.slice(3)); window.addEventListener('hashchange', () => location.reload(), { once: true }); return; }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { rodando = false; perfil = null; telaLogin(); } });
  const { data } = await sb.auth.getSession();
  if (!data.session) return telaLogin();
  entrar(data.session);
}
window.addEventListener('hashchange', () => { if (rodando) rotear(); });
// chamados mandados pelo botão de favorito do SM: guarda e abre a tela de Corretivas
ouvirFavorito(() => { if (location.hash !== '#corretivas') location.hash = 'corretivas'; else if (rodando) rotear(); });
// telas com campos para digitar não são redesenhadas sozinhas (não perde o que está sendo digitado)
aoMudar(() => { if (rodando && !/^#(m-|r-|c-|layout|avisos|feriados|corretivas)/.test(location.hash)) { const y = scrollY; rotear(); requestAnimationFrame(() => scrollTo(0, y)); } });
aoErro((m) => toast('Não foi gravado: ' + m, 'erro'));
// atualiza sozinho: ao voltar para a aba e a cada 2 minutos (assinaturas feitas em outro celular)
const atualizar = () => { if (rodando && document.visibilityState === 'visible') carregar().catch(() => {}); };
document.addEventListener('visibilitychange', atualizar);
setInterval(atualizar, 120000);
iniciar();
