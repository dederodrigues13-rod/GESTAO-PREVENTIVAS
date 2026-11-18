// =====================================================================
// Tela Corretivas (#corretivas): chamados do portal SM cruzados com as
// preventivas. As OMs entram colando a tabela de Chamados do SM ou pelo
// botão de favorito "Enviar ao sistema" (lê a tabela na tela do SM e
// manda para cá; funciona de dentro da rede da Vetore, sem a TI).
// =====================================================================
import { MAQUINAS, porCodigo, SETORES, CELULA_VTFE } from './dados.js';
import { itens, hoje } from './situacao.js';
import { corretivas, importarCorretivas, definirMaquinaCorretiva } from './store.js';
import { lerChamados, conferirLeitura, horasParada, fechado, FORNOS_GERAL, SEM_MAQUINA } from './corretivas-regras.js';
import { pdfDeHtml, salvarArquivo } from './relatorio.js';
import { esc, ic, dataBR, dataHoraBR, toast, abrirModal, contarNumeros, esqueleto } from './ui.js';
import { janelas, noIntervalo, serie12, mttr, sparkline, cartaoKpi, mapaCalor, chamadosDoHorario, nomeHorario, pareto, matrizMaquinasMeses, relatorioMensalA4, ehPL } from './corretivas-vis.js';

const APP = location.origin;
const ORIGEM_SM = /^https:\/\/([a-z0-9-]+\.)*suporte\.com$/i;   // de onde o botão de favorito pode mandar
const PENDENTE = 'prev-sm-pendente';
const JANELA = 90;                // dias antes/depois da preventiva para comparar
const LOGO_DEPOIS = 15;           // quebra até 15 dias depois da preventiva = alerta
const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['mes', 'Este mês'], ['ano', 'Este ano'], ['tudo', 'Tudo']];
const nomeMaq = (c) => (c === FORNOS_GERAL ? 'Fornos (geral)' : c === SEM_MAQUINA ? 'Sem máquina' : c);
// endereço da página de corretivas de cada máquina: #c-vtia-05, #c-fornos, #c-sem
export const slugMaq = (c) => (c === FORNOS_GERAL ? 'fornos' : c === SEM_MAQUINA ? 'sem' : porCodigo[c]?.slug || String(c).toLowerCase().replace(/\s+/g, '-'));
const maqDoSlug = (sl) => (sl === 'fornos' ? FORNOS_GERAL : sl === 'sem' ? SEM_MAQUINA : MAQUINAS.find((m) => m.slug === sl)?.codigo);
const hrs = (h) => (h >= 48 ? `${(h / 24).toFixed(1).replace('.', ',')} d` : `${h.toFixed(1).replace('.', ',')} h`);
const diaDe = (ts) => (ts ? ts.slice(0, 10) : '');
const somaDiasIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ---------- botão de favorito (bookmarklet) ----------
// Lê as linhas da tabela que está na tela do SM e manda para o sistema numa janela nova.
// Grades com colunas congeladas guardam cada linha em duas tabelas: junta pelo índice da linha.
export function codigoFavorito() {
  const js = `(()=>{const A=${JSON.stringify(APP)};const V=x=>{const s=getComputedStyle(x);return s.display!=='none'&&s.visibility!=='hidden'&&x.offsetWidth>0};const g=new Map();let n=0;document.querySelectorAll('tr').forEach(t=>{const k=t.getAttribute('datagrid-row-index')??t.getAttribute('data-index')??t.getAttribute('aria-rowindex')??('r'+(n++));const c=[...t.cells].filter(V).map(x=>(x.innerText||'').replace(/\\s+/g,' ').trim());g.set(k,(g.get(k)||[]).concat(c))});const R=[...g.values()].map(c=>c.join('\\t'));const L=R.filter(x=>/\\b\\d{4,7}\\b/.test(x)&&/\\d{2}\\/\\d{2}\\/\\d{4}/.test(x));const H=[...document.querySelectorAll('tr')].filter(t=>/Priorid|Solicitante|Identifica/.test(t.innerText||'')&&!/\\d{2}\\/\\d{2}\\/\\d{4}/.test(t.innerText||''));const h=H.flatMap(t=>[...t.cells].filter(V).map(x=>(x.innerText||'').replace(/\\s+/g,' ').trim())).join('\\t');if(!L.length){alert('Nenhum chamado na tela. Abra a lista de Chamados do SM e tente de novo.');return}const w=window.open(A+'/#corretivas','gestao-preventivas');if(!w){alert('O navegador bloqueou a janela. Libere pop-ups para este site.');return}const m={tipo:'sm-chamados',texto:(h?h+'\\n':'')+L.join('\\n'),qtd:L.length};let k=0;const i=setInterval(()=>{try{w.postMessage(m,A)}catch(e){}if(++k>80)clearInterval(i)},500);addEventListener('message',e=>{if(e.origin===A&&e.data==='sm-ok')clearInterval(i)})})()`;
  return 'javascript:' + encodeURIComponent(js);
}

// recebe o que o botão de favorito mandou (antes mesmo do login: guarda e importa depois)
export function ouvirFavorito(aoChegar) {
  window.addEventListener('message', (e) => {
    if (!ORIGEM_SM.test(e.origin) || e.data?.tipo !== 'sm-chamados' || typeof e.data.texto !== 'string') return;
    try { sessionStorage.setItem(PENDENTE, e.data.texto.slice(0, 2_000_000)); } catch (er) { /* sem espaço */ }
    try { e.source?.postMessage('sm-ok', e.origin); } catch (er) { /* janela fechou */ }
    aoChegar?.();
  });
}
// importa o que ficou pendente (chamado depois do login)
export async function importarPendente() {
  let txt = null; try { txt = sessionStorage.getItem(PENDENTE); sessionStorage.removeItem(PENDENTE); } catch (e) { /* ok */ }
  if (!txt) return null;
  return importarTexto(txt);
}
async function importarTexto(txt) {
  const lidos = lerChamados(txt, CELULA_VTFE);
  if (!lidos.length) { toast('Não encontrei chamados nesse texto. Copie as linhas da tabela de Chamados do SM.', 'erro'); return null; }
  const conf = conferirLeitura(lidos);
  if (!conf.ok) {
    abrirModal({ titulo: 'Não importei: as colunas vieram diferentes', html: `<p>Li ${lidos.length} chamados, mas as colunas não bateram (${esc(conf.motivo)}). Nada foi gravado.</p>
      <p>Confira se a tela de Chamados do SM está com as colunas <b>Status</b>, <b>Solicitante</b>, <b>Data de Abertura</b> e <b>Data Último Atendimento</b> visíveis e tente de novo. Se continuar, mande ao Claude este trecho:</p>
      <textarea class="campo" rows="5" readonly>${esc(txt.split('\n').slice(0, 3).join('\n').slice(0, 1500))}</textarea>` });
    return null;
  }
  const r = await importarCorretivas(lidos);
  toast(`${lidos.length} chamados do SM: ${r.novas} novos, ${r.atualizadas} atualizados.`);
  return r;
}

// ---------- cruzamento com as preventivas ----------
function preventivasFeitas() {
  // data em que cada preventiva foi feita (assinatura do manutentor), por máquina
  const out = {};
  itens().forEach((i) => { const r = i.reg; if (!r || r.status === 'rascunho' || !r.fim) return; (out[i.codigo] ??= []).push(new Date(r.fim).toISOString().slice(0, 10)); });
  Object.values(out).forEach((l) => l.sort());
  return out;
}
function antesDepois(cods, todas, prev) {
  // para cada preventiva feita: corretivas JANELA dias antes x depois (só conta janelas que já passaram)
  let antes = 0, depois = 0, n = 0; const h = hoje();
  cods.forEach((c) => (prev[c] || []).forEach((d) => {
    const fimJan = somaDiasIso(d, JANELA); if (fimJan > h) return;
    const ini = somaDiasIso(d, -JANELA); n++;
    todas.forEach((o) => { if (o.maquina !== c) return; const a = diaDe(o.abertura); if (a >= ini && a < d) antes++; else if (a > d && a <= fimJan) depois++; });
  }));
  return { antes, depois, n };
}

// ---------- tela ----------
export async function telaCorretivas(el, { gestao } = {}) {
  el.innerHTML = esqueleto('Carregando corretivas');
  let todas;
  try { await importarPendente(); todas = await corretivas(); }
  catch (e) { el.innerHTML = `<div class="pag"><p class="aviso aviso-red">${ic('alert')}<span>Não foi possível carregar as corretivas: ${esc(e?.message || e)}</span></p></div>`; return; }
  const st = { per: sessionStorage.getItem('prev-corr-per') || '90', setor: 'todos', ord: 'os', mes: null, calor: null };
  const desenhar = () => {
    const h = hoje(), agora = Date.now();
    const jan = janelas(st.per, h);
    const setorDe = (c) => (c === FORNOS_GERAL ? 'fornos' : porCodigo[c]?.setor || 'outros');
    const base = todas.filter((c) => st.setor === 'todos' || setorDe(c.maquina) === st.setor);
    const lista = base.filter((c) => noIntervalo(c, jan.atual)).sort((a, b) => String(b.abertura).localeCompare(String(a.abertura)));
    const ant = jan.ant ? base.filter((c) => noIntervalo(c, jan.ant)) : null;
    const horasDe = (l) => l.reduce((s, c) => s + horasParada(c, agora), 0);
    const abertas = base.filter((c) => !fechado(c));
    const prev = preventivasFeitas();
    // por máquina
    const cods = [...new Set([...MAQUINAS.map((m) => m.codigo), FORNOS_GERAL, SEM_MAQUINA])].filter((c) => st.setor === 'todos' || setorDe(c) === st.setor);
    const linhas = cods.map((c) => {
      const os = lista.filter((o) => o.maquina === c), hh = os.reduce((s, o) => s + horasParada(o, agora), 0);
      const ult = (prev[c] || []).at(-1), ad = antesDepois([c], todas, prev);
      const s12 = serie12(base.filter((o) => o.maquina === c), h, (l) => l.length);
      const u3 = s12.slice(-4, -1).reduce((p, q) => p + q, 0), a3 = s12.slice(-7, -4).reduce((p, q) => p + q, 0);   // meses fechados
      return { c, os: os.length, hh, ult, ad, pl: os.filter(ehPL).length, s12, var3: a3 ? Math.round((u3 - a3) / a3 * 100) : null };
    }).filter((x) => x.os || x.ult).sort((a, b) => (st.ord === 'hh' ? b.hh - a.hh : st.ord === 'pl' ? b.pl - a.pl : 0) || b.os - a.os || b.hh - a.hh);
    const maxH = Math.max(1, ...linhas.map((x) => x.hh));
    const comPrev = linhas.some((x) => x.ult);
    // quebras logo depois da preventiva
    const alertas = [];
    Object.entries(prev).forEach(([c, datas]) => datas.forEach((d) => todas.forEach((o) => {
      const a = diaDe(o.abertura); if (o.maquina === c && a > d && a <= somaDiasIso(d, LOGO_DEPOIS)) alertas.push({ o, d, dias: Math.round((new Date(a) - new Date(d)) / 864e5) });
    })));
    const opcoesMaq = [SEM_MAQUINA, FORNOS_GERAL, ...MAQUINAS.map((m) => m.codigo)];
    const total = antesDepois(Object.keys(prev), todas, prev);
    const rotAnt = jan.rot ? `comparado com ${jan.rot}` : '';
    const kpis = [
      { rot: 'Chamados no período', val: lista.length, atual: lista.length, anterior: ant?.length, serie: serie12(base, h, (l) => l.length), cor: '#5aa2ff', sub: ant ? `${ant.length} no período anterior` : 'todo o histórico' },
      { rot: 'Parada de linha', val: lista.filter(ehPL).length, atual: lista.filter(ehPL).length, anterior: ant?.filter(ehPL).length, serie: serie12(base, h, (l) => l.filter(ehPL).length), cor: '#ff5a36', corVal: 'var(--danger)', sub: lista.length ? `${Math.round(lista.filter(ehPL).length / lista.length * 100)}% dos chamados` : '' },
      { rot: 'Tempo médio até fechar', val: hrs(mttr(lista)), atual: mttr(lista), anterior: ant ? mttr(ant) : null, serie: serie12(base, h, mttr), cor: '#4cc38a', sub: ant && mttr(ant) ? `antes: ${hrs(mttr(ant))}` : 'da abertura ao fechamento' },
      { rot: 'Tempo com chamado aberto', val: hrs(horasDe(lista)), atual: horasDe(lista), anterior: ant ? horasDe(ant) : null, serie: serie12(base, h, (l) => l.reduce((s, c) => s + horasParada(c, agora), 0)), cor: '#f0a93b', sub: 'soma de todos os chamados' },
      { rot: 'Abertos agora no SM', val: abertas.length, serie: [], cor: '#f0a93b', corVal: abertas.length ? '#f0a93b' : '', sub: abertas.length ? `mais antigo de ${dataBR(diaDe(abertas.map((c) => c.abertura).filter(Boolean).sort()[0] || ''))}` : 'nenhum em aberto' },
    ];

    el.innerHTML = `<div class="pag">
      <div class="pag-topo pag-topo-acao"><div><h1 class="tit">Corretivas · portal SM</h1><p class="sub">${todas.length} chamados no sistema · máquina pelo solicitante (fornos pelo assunto)</p></div>
        <div class="acoes-topo"><button type="button" class="btn btn-sec" data-relatorio>${ic('grafico')} Relatório do mês (PDF)</button>
        <button type="button" class="btn btn-pri" data-importar>${ic('baixar')} Importar do SM</button></div></div>
      <div class="corr-filtros">
        <div class="ma-abas">${PERIODOS.map(([k, n]) => `<button type="button" class="chip ${st.per === k ? 'on' : ''}" data-per="${k}">${n}</button>`).join('')}</div>
        <div class="ma-abas">${[['todos', 'Todos'], ...Object.keys(SETORES).map((k) => [k, SETORES[k].curto])].map(([k, n]) => `<button type="button" class="chip ${st.setor === k ? 'on' : ''}" data-setor="${k}">${n}</button>`).join('')}</div>
      </div>
      ${todas.length ? '' : `<section class="bloco vazio-corr"><h2>Nenhum chamado ainda</h2><p class="sub">Clique em <b>Importar do SM</b>: cole a tabela de Chamados ou instale o botão de favorito.</p></section>`}
      <div class="kpi2-grade">${kpis.map((k) => cartaoKpi({ ...k, rotAnt })).join('')}</div>
      ${jan.rot ? `<p class="kpi2-nota">Setas: ${rotAnt} · verde = melhorou · linha = últimos 12 meses</p>` : '<p class="kpi2-nota">Linha = últimos 12 meses</p>'}

      ${(() => { const ms = mesesDe(lista, h, agora), md = ms.length ? lista.filter((o) => o.abertura).length / ms.length : 0; return ms.length > 1 ? `<section class="bloco"><div class="bloco-topo"><h2>Chamados mês a mês</h2>
        <div class="sem-leg"><span><i class="lg-atr"></i>Parada de linha</span><span><i class="lg-outros"></i>Outros</span><span><i class="lg-media"></i>Média ${md.toFixed(1).replace('.', ',')}/mês</span><span class="muted">Clique num mês para ver os chamados</span></div></div>
        ${graficoMeses(ms, md, st.mes)}${st.mes ? painelMes(st.mes, lista, ms, agora, true) : ''}</section>` : ''; })()}

      <section class="bloco"><div class="bloco-topo"><h2>Quando os chamados abrem</h2><p class="sub">Dia da semana × hora da abertura, no período escolhido</p></div>
        ${mapaCalor(lista, st.calor)}${st.calor ? painelChamados({ eyebrow: 'Horário selecionado', titulo: nomeHorario(st.calor)[0].toUpperCase() + nomeHorario(st.calor).slice(1), lista: chamadosDoHorario(lista, ...st.calor), agora, comMaquina: true, fechar: 'data-fechar-calor' }) : ''}</section>

      <section class="bloco"><div class="bloco-topo"><h2>Preventiva × corretiva por máquina</h2>
        <p class="sub">${comPrev ? `Compara os chamados ${JANELA} dias antes e ${JANELA} dias depois de cada preventiva feita. ${total.n ? `No total: <b>${total.antes}</b> antes → <b>${total.depois}</b> depois.` : 'O antes → depois aparece quando a primeira preventiva completar ' + JANELA + ' dias.'}` : 'Linha = chamados nos últimos 12 meses · 3 meses = últimos 3 meses fechados contra os 3 anteriores. As colunas da preventiva aparecem quando houver preventiva assinada.'}</p></div>
        <div class="corr-tab-box"><table class="corr-tab"><thead><tr><th>Máquina</th>${[['os', 'Chamados'], ['hh', 'Tempo em chamado'], ['pl', 'Parada de linha']].map(([k, n]) => `<th aria-sort="${st.ord === k ? 'descending' : 'none'}"><button type="button" class="th-ord ${st.ord === k ? 'on' : ''}" data-ord="${k}" title="Ordenar por ${n.toLowerCase()} (maior primeiro)">${n}${st.ord === k ? ' ▼' : ''}</button></th>`).join('')}<th>12 meses</th><th title="Últimos 3 meses fechados contra os 3 anteriores">3 meses</th>${comPrev ? '<th>Última preventiva</th><th>Antes → depois</th>' : ''}</tr></thead><tbody>
        ${linhas.map((x) => {
          const v = x.ad.n ? (x.ad.depois < x.ad.antes ? 'melhor' : x.ad.depois > x.ad.antes ? 'pior' : 'igual') : '';
          const vv = x.var3 == null ? '' : x.var3 > 5 ? 'ruim' : x.var3 < -5 ? 'bom' : '';
          return `<tr><th scope="row"><a href="#c-${slugMaq(x.c)}">${esc(nomeMaq(x.c))}</a><small>${esc(porCodigo[x.c]?.modelo || (x.c === SEM_MAQUINA ? 'aberto por pessoa, sem máquina no assunto' : 'forno sem código no SM'))}</small></th>
            <td>${x.os}</td><td><div class="corr-barra"><i style="width:${x.hh / maxH * 100}%"></i><span>${hrs(x.hh)}</span></div></td><td>${x.pl || '–'}</td>
            <td class="td-spark">${sparkline(x.s12, x.var3 > 5 ? '#ff5a36' : x.var3 < -5 ? '#4cc38a' : '#8aa0b8', { w: 120, h: 30, pad: 4, classe: 'spark-mini' }) || '<span class="muted">–</span>'}</td>
            <td><span class="matriz-var ${vv}">${x.var3 == null ? '–' : `${x.var3 > 5 ? '▲' : x.var3 < -5 ? '▼' : '='} ${Math.abs(x.var3)}%`}</span></td>
            ${comPrev ? `<td>${x.ult ? dataBR(x.ult) : '<span class="muted">ainda não</span>'}</td>
            <td>${x.ad.n ? `<span class="corr-ad corr-${v}">${x.ad.antes} → ${x.ad.depois} ${v === 'melhor' ? '▼' : v === 'pior' ? '▲' : '='}</span>` : '<span class="muted">aguardando dados</span>'}</td>` : ''}</tr>`;
        }).join('') || `<tr><td colspan="${comPrev ? 8 : 6}" class="muted">Nenhum chamado no período.</td></tr>`}
        </tbody></table></div>
      </section>

      <section class="bloco"><div class="bloco-topo"><h2>Sistemas que mais param · Pareto</h2><p class="sub">Barras = chamados por sistema (pelo assunto) · linha amarela = % acumulado · passe o mouse para ver tempo e parada de linha</p></div>
        ${pareto(lista, agora)}</section>

      <section class="bloco"><div class="bloco-topo"><h2>Máquinas × meses</h2><p class="sub">Chamados por máquina nos últimos 12 meses${st.setor === 'todos' ? '' : ' · ' + esc(SETORES[st.setor]?.nome || '')} · clique na máquina para abrir</p></div>
        ${matrizMaquinasMeses(base, h, cods, nomeMaq, slugMaq)}</section>

      <div class="col2 col2-igual">
        ${rankingAtendentes(lista, { sub: 'Chamados atendidos no período (segue o filtro de setor) · máquinas que mais atendeu · tempo médio até fechar', limite: 10, comMaquina: true })}
        <section class="bloco"><div class="bloco-topo"><h2>Quebrou logo depois da preventiva</h2><p class="sub">Chamado até ${LOGO_DEPOIS} dias depois da preventiva: vale revisar o item do formulário</p></div>
          ${alertas.length ? `<ul class="corr-alertas">${alertas.sort((a, b) => b.o.abertura.localeCompare(a.o.abertura)).slice(0, 12).map((a) => `<li><b>${esc(a.o.maquina)}</b> · OM ${a.o.os} · ${esc(a.o.assunto)}<small>${a.dias} ${a.dias === 1 ? 'dia' : 'dias'} depois da preventiva de ${dataBR(a.d)} · ${esc(a.o.sistema)}</small></li>`).join('')}</ul>` : '<p class="vazio-p">Nenhum caso até agora.</p>'}
        </section>
      </div>

      <section class="bloco"><div class="bloco-topo"><h2>Chamados</h2><p class="sub">${lista.length} no período${gestao ? ' · a máquina pode ser trocada quando a regra errar' : ''}</p></div>
        <div class="corr-tab-box"><table class="corr-tab corr-lista"><thead><tr><th>OM</th><th>Máquina</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th>Tempo</th></tr></thead><tbody>
        ${lista.slice(0, 300).map((o) => `<tr>
          <td class="corr-os">${o.os}</td>
          <td>${gestao ? `<select class="campo campo-sm" data-maq="${o.os}" aria-label="Máquina da OM ${o.os}">${opcoesMaq.map((c) => `<option value="${c}" ${c === o.maquina ? 'selected' : ''}>${esc(nomeMaq(c))}</option>`).join('')}</select>${o.maquina_manual ? '<small class="muted">escolhida à mão</small>' : o.celula ? `<small class="muted">forno da célula ${esc(o.celula)}</small>` : ''}` : esc(nomeMaq(o.maquina))}</td>
          <td>${esc(o.assunto)}<small class="muted">${esc(o.sistema || '')} · ${esc(o.atendente || 'sem atendente')}</small></td>
          <td><span class="corr-pri corr-pri-${ehPL(o) ? 'pl' : /cr[ií]tico/i.test(o.prioridade || '') ? 'cr' : 'nm'}">${esc(o.prioridade || '–')}</span></td>
          <td>${esc(o.status || '')}</td><td>${dataHoraBR(o.abertura)}</td><td>${hrs(horasParada(o, agora))}${fechado(o) ? '' : ' <small class="muted">em aberto</small>'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum chamado no período.</td></tr>'}
        </tbody></table>${lista.length > 300 ? '<p class="sub">Mostrando os 300 mais recentes.</p>' : ''}</div>
      </section>
    </div>`;
    contarNumeros(el);
    el.querySelectorAll('[data-per]').forEach((b) => { b.onclick = () => { st.per = b.dataset.per; st.mes = null; st.calor = null; try { sessionStorage.setItem('prev-corr-per', st.per); } catch (e) { /* ok */ } desenhar(); }; });
    el.querySelectorAll('[data-setor]').forEach((b) => { b.onclick = () => { st.setor = b.dataset.setor; st.calor = null; desenhar(); }; });
    ligarMeses(el, st, desenhar);
    ligarCalor(el, st, desenhar);
    el.querySelectorAll('[data-ord]').forEach((b) => { b.onclick = () => { st.ord = b.dataset.ord; desenhar(); }; });
    el.querySelectorAll('[data-maq]').forEach((s) => { s.onchange = async () => {
      const os = +s.dataset.maq, o = todas.find((x) => x.os === os), val = s.value === o.maquina_auto ? null : s.value;
      try { await definirMaquinaCorretiva(os, val); todas = await corretivas(); toast(`OM ${os} agora é da ${nomeMaq(s.value)}.`); desenhar(); } catch (e) { toast('Não foi possível trocar: ' + (e?.message || e), 'erro'); }
    }; });
    el.querySelector('[data-importar]').onclick = () => abrirImportar(async () => { todas = await corretivas(); desenhar(); });
    el.querySelector('[data-relatorio]').onclick = () => abrirRelatorioMensal(todas);
  };
  desenhar();
}

function abrirImportar(depois) {
  abrirModal({ titulo: 'Importar chamados do SM', html: `
    <div class="corr-imp">
      <section><h3>1 · Botão de favorito (recomendado)</h3>
        <p>Arraste o botão abaixo para a <b>barra de favoritos</b> do navegador (uma vez só). Depois, na tela de <b>Chamados</b> do SM, escolha o período e clique no favorito: os chamados chegam aqui sozinhos.</p>
        <p class="centro"><a class="btn btn-pri corr-fav" href="${codigoFavorito()}" draggable="true" title="Arraste para a barra de favoritos">${ic('baixar')} Enviar ao sistema</a></p>
        <p class="sub">Barra de favoritos escondida? Ctrl + Shift + B. Precisa estar com as colunas <b>Data de Abertura</b> e <b>Data Último Atendimento</b> visíveis no SM.</p></section>
      <section><h3>2 · Colar</h3>
        <p>No SM, selecione as linhas da tabela de Chamados, copie (Ctrl + C) e cole aqui:</p>
        <textarea class="campo" rows="6" data-colar placeholder="Cole aqui as linhas copiadas do SM"></textarea>
        <p class="sub" data-previa></p>
        <button type="button" class="btn btn-pri" data-ok disabled>Importar</button></section>
    </div>`,
  onAbrir: (c, fechar) => {
    c.querySelector('.corr-fav').onclick = (e) => { e.preventDefault(); toast('Arraste este botão para a barra de favoritos do navegador.'); };
    const ta = c.querySelector('[data-colar]'), pv = c.querySelector('[data-previa]'), ok = c.querySelector('[data-ok]');
    ta.oninput = () => { const l = lerChamados(ta.value, CELULA_VTFE); ok.disabled = !l.length;
      const cf = conferirLeitura(l); if (l.length && !cf.ok) { pv.textContent = `Colunas não reconhecidas (${cf.motivo}). Copie desde a linha dos títulos.`; ok.disabled = true; return; }
      pv.textContent = l.length ? `${l.length} chamados encontrados · ${new Set(l.map((x) => x.maquina)).size} máquinas · de ${dataBR(l.map((x) => diaDe(x.abertura)).filter(Boolean).sort()[0] || '')} a ${dataBR(l.map((x) => diaDe(x.abertura)).filter(Boolean).sort().at(-1) || '')}` : (ta.value.trim() ? 'Não encontrei chamados nesse texto.' : ''); };
    ok.onclick = async () => { ok.disabled = true; ok.textContent = 'Importando…'; try { await importarTexto(ta.value); fechar(); depois?.(); } catch (e) { toast('Não foi possível importar: ' + (e?.message || e), 'erro'); ok.disabled = false; ok.textContent = 'Importar'; } };
  } });
}

// chamados de uma máquina (para o histórico da máquina)
export async function corretivasDaMaquina(codigo) {
  return (await corretivas()).filter((c) => c.maquina === codigo).sort((a, b) => String(b.abertura).localeCompare(String(a.abertura)));
}

// ---------- página de corretivas de uma máquina (#c-vtia-05) ----------
const MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const chaveAssunto = (a) => String(a || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(maq|maquina|na|no|da|do|de|com|em|a|o|e)\b/g, ' ').replace(/\s+/g, ' ').trim();
export async function telaCorretivasMaquina(el, slug, { gestao } = {}) {
  const cod = maqDoSlug(slug);
  if (!cod) { el.innerHTML = `<div class="pag"><p class="aviso aviso-red">${ic('alert')}<span>Máquina não encontrada.</span></p></div>`; return; }
  el.innerHTML = esqueleto('Carregando chamados da máquina');
  let todas; try { todas = await corretivas(); } catch (e) { el.innerHTML = `<div class="pag"><p class="aviso aviso-red">${ic('alert')}<span>${esc(e?.message || e)}</span></p></div>`; return; }
  const m = porCodigo[cod];
  const st = { per: 'tudo', pri: 'todas', busca: '', mostrar: 60, mes: null, calor: null };
  const desenhar = () => {
    const h = hoje(), agora = Date.now();
    const jan = janelas(st.per, h);
    const daMaq = todas.filter((c) => c.maquina === cod).sort((a, b) => String(b.abertura).localeCompare(String(a.abertura)));
    const lista = daMaq.filter((c) => noIntervalo(c, jan.atual));
    const ant = jan.ant ? daMaq.filter((c) => noIntervalo(c, jan.ant)) : null;
    const horasDe = (l) => l.reduce((s, c) => s + horasParada(c, agora), 0), horas = horasDe(lista);
    // evolução mês a mês (do primeiro chamado do período até este mês)
    const meses = mesesDe(lista, h, agora);
    const maxM = Math.max(1, ...meses.map((x) => x.n));
    const media = meses.length ? lista.length / meses.length : 0;
    // maiores problemas: por sistema e pelos assuntos que mais se repetem
    const sis = {}; lista.forEach((o) => { const s2 = (sis[o.sistema] ??= { n: 0, h: 0, pl: 0 }); s2.n++; s2.h += horasParada(o, agora); if (ehPL(o)) s2.pl++; });
    const sisL = Object.entries(sis).sort((a, b) => b[1].n - a[1].n || b[1].h - a[1].h), maxS = Math.max(1, ...sisL.map(([, v]) => v.n));
    const rep = {}; lista.forEach((o) => { const k = chaveAssunto(o.assunto); if (!k) return; const r = (rep[k] ??= { n: 0, ex: o.assunto, ult: o.abertura }); r.n++; });
    const repL = Object.values(rep).filter((r) => r.n > 1).sort((a, b) => b.n - a.n).slice(0, 10);
    // lista filtrada
    const q = chaveAssunto(st.busca);
    const filtrada = lista.filter((o) => (st.pri === 'todas' || (st.pri === 'pl' ? ehPL(o) : st.pri === 'cr' ? /cr[ií]tico/i.test(o.prioridade || '') : !ehPL(o) && !/cr[ií]tico/i.test(o.prioridade || ''))) && (!q || chaveAssunto(`${o.os} ${o.assunto} ${o.atendente}`).includes(q)));
    el.innerHTML = `<div class="pag">
      <div class="pag-topo pag-topo-acao"><div><a class="link" href="#corretivas">‹ Corretivas</a>
        <h1 class="tit">${esc(nomeMaq(cod))} · corretivas</h1><p class="sub">${m ? `${esc(m.equipamento)} · ${esc(m.modelo)} · ${esc(SETORES[m.setor].nome)}` : cod === FORNOS_GERAL ? 'Chamados dos fornos sem forno identificado no assunto' : 'Chamados abertos por pessoas, sem máquina no assunto'} · ${daMaq.length} chamados no total</p></div>
        ${m ? `<a class="btn btn-sec" href="#h-${m.slug}">${ic('historico')} Preventivas desta máquina</a>` : ''}</div>
      <div class="corr-filtros"><div class="ma-abas">${PERIODOS.map(([k, n]) => `<button type="button" class="chip ${st.per === k ? 'on' : ''}" data-per="${k}">${n}</button>`).join('')}</div></div>
      <div class="kpi2-grade">${[
        { rot: st.per === 'tudo' ? 'Chamados' : 'Chamados no período', val: lista.length, atual: lista.length, anterior: ant?.length, serie: serie12(daMaq, h, (l) => l.length), cor: '#5aa2ff', sub: ant ? `${ant.length} no período anterior` : 'todo o histórico' },
        { rot: 'Parada de linha', val: lista.filter(ehPL).length, atual: lista.filter(ehPL).length, anterior: ant?.filter(ehPL).length, serie: serie12(daMaq, h, (l) => l.filter(ehPL).length), cor: '#ff5a36', corVal: 'var(--danger)', sub: lista.length ? `${Math.round(lista.filter(ehPL).length / lista.length * 100)}% dos chamados` : '' },
        { rot: 'Tempo com chamado aberto', val: hrs(horas), atual: horas, anterior: ant ? horasDe(ant) : null, serie: serie12(daMaq, h, horasDe), cor: '#f0a93b', sub: 'soma de todos os chamados' },
        { rot: 'Tempo médio até fechar', val: hrs(mttr(lista)), atual: mttr(lista), anterior: ant ? mttr(ant) : null, serie: serie12(daMaq, h, mttr), cor: '#4cc38a', sub: ant && mttr(ant) ? `antes: ${hrs(mttr(ant))}` : 'da abertura ao fechamento' },
        { rot: 'Chamados por mês', val: media.toFixed(1).replace('.', ','), serie: [], cor: '#8aa0b8', sub: 'média no período' },
      ].map((k) => cartaoKpi({ ...k, rotAnt: jan.rot ? `comparado com ${jan.rot}` : '' })).join('')}</div>


      <section class="bloco"><div class="bloco-topo"><h2>Chamados mês a mês</h2>
        <div class="sem-leg"><span><i class="lg-atr"></i>Parada de linha</span><span><i class="lg-outros"></i>Outros</span><span><i class="lg-media"></i>Média ${media.toFixed(1).replace('.', ',')}/mês</span><span class="muted">Clique num mês para ver os chamados</span></div></div>
        ${meses.length ? graficoMeses(meses, media, st.mes) : '<p class="vazio-p">Sem chamados no período.</p>'}
        ${st.mes ? painelMes(st.mes, lista, meses, agora) : ''}
      </section>

      <section class="bloco"><div class="bloco-topo"><h2>Maiores problemas · Pareto</h2><p class="sub">Chamados por sistema (pelo assunto) · linha amarela = % acumulado</p></div>
        ${pareto(lista, agora)}</section>

      <section class="bloco"><div class="bloco-topo"><h2>Quando os chamados abrem</h2><p class="sub">Dia da semana × hora da abertura</p></div>
        ${mapaCalor(lista, st.calor)}${st.calor ? painelChamados({ eyebrow: 'Horário selecionado', titulo: nomeHorario(st.calor)[0].toUpperCase() + nomeHorario(st.calor).slice(1), lista: chamadosDoHorario(lista, ...st.calor), agora, fechar: 'data-fechar-calor' }) : ''}</section>

      <div class="col2 col2-igual">
        <section class="bloco"><div class="bloco-topo"><h2>Problemas que se repetem</h2><p class="sub">Mesmo assunto aberto mais de uma vez</p></div>
          ${repL.length ? `<ul class="corr-rep">${repL.map((r) => `<li><b>${r.n}×</b><span>${esc(r.ex)}<small>último em ${dataBR(diaDe(r.ult))}</small></span></li>`).join('')}</ul>` : '<p class="vazio-p">Nenhum assunto repetido.</p>'}
        </section>
        ${rankingAtendentes(lista, { sub: 'Chamados atendidos nesta máquina · tempo médio até fechar' })}
      </div>

      <section class="bloco"><div class="bloco-topo"><h2>Todos os chamados</h2><p class="sub">${filtrada.length} de ${lista.length}</p></div>
        <div class="corr-busca"><input class="campo" type="search" data-busca placeholder="Buscar por assunto, número ou atendente" value="${esc(st.busca)}" aria-label="Buscar chamados">
          <div class="ma-abas">${[['todas', 'Todas'], ['pl', 'Parada de linha'], ['cr', 'Crítico'], ['ou', 'Outras']].map(([k, n]) => `<button type="button" class="chip ${st.pri === k ? 'on' : ''}" data-pri="${k}">${n}</button>`).join('')}</div></div>
        <div class="corr-tab-box"><table class="corr-tab corr-lista"><thead><tr><th>OM</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Abertura</th><th>Fechamento</th><th>Tempo</th>${gestao ? '<th>Máquina</th>' : ''}</tr></thead><tbody>
          ${filtrada.slice(0, st.mostrar).map((o) => `<tr><td class="corr-os">${o.os}</td><td>${esc(o.assunto)}<small class="muted">${esc(o.sistema || '')} · ${esc(o.atendente || 'sem atendente')}</small></td>
            <td><span class="corr-pri corr-pri-${ehPL(o) ? 'pl' : /cr[ií]tico/i.test(o.prioridade || '') ? 'cr' : 'nm'}">${esc(o.prioridade || '–')}</span></td><td>${esc(o.status || '')}</td>
            <td>${dataHoraBR(o.abertura)}</td><td>${fechado(o) ? dataHoraBR(o.ultimo_atend || o.ultima_mod) : '<span class="muted">em aberto</span>'}</td><td>${hrs(horasParada(o, agora))}</td>
            ${gestao ? `<td><select class="campo campo-sm" data-maq="${o.os}" aria-label="Máquina da OM ${o.os}">${[SEM_MAQUINA, FORNOS_GERAL, ...MAQUINAS.map((x) => x.codigo)].map((c) => `<option value="${c}" ${c === o.maquina ? 'selected' : ''}>${esc(nomeMaq(c))}</option>`).join('')}</select></td>` : ''}</tr>`).join('') || `<tr><td colspan="${gestao ? 8 : 7}" class="muted">Nenhum chamado.</td></tr>`}
        </tbody></table></div>
        ${filtrada.length > st.mostrar ? `<p class="centro"><button type="button" class="btn btn-sec" data-mais>Mostrar mais ${Math.min(100, filtrada.length - st.mostrar)}</button></p>` : ''}
      </section>
    </div>`;
    contarNumeros(el);
    el.querySelectorAll('[data-per]').forEach((b) => { b.onclick = () => { st.per = b.dataset.per; st.mes = null; st.calor = null; desenhar(); }; });
    ligarCalor(el, st, desenhar);
    el.querySelectorAll('[data-pri]').forEach((b) => { b.onclick = () => { st.pri = b.dataset.pri; desenhar(); }; });
    ligarMeses(el, st, desenhar);
    const bus = el.querySelector('[data-busca]'); let t;
    bus.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.busca = bus.value; const pos = bus.selectionStart; desenhar(); const b2 = el.querySelector('[data-busca]'); b2.focus(); b2.setSelectionRange(pos, pos); }, 250); };
    const mais = el.querySelector('[data-mais]'); if (mais) mais.onclick = () => { st.mostrar += 100; desenhar(); };
    el.querySelectorAll('[data-maq]').forEach((sel) => { sel.onchange = async () => {
      const os = +sel.dataset.maq, o = todas.find((x) => x.os === os), val = sel.value === o.maquina_auto ? null : sel.value;
      try { await definirMaquinaCorretiva(os, val); todas = await corretivas(); toast(`OM ${os} agora é da ${nomeMaq(sel.value)}.`); desenhar(); } catch (e) { toast('Não foi possível trocar: ' + (e?.message || e), 'erro'); }
    }; });
  };
  desenhar();
}

// ---------- ranking "quem mais atendeu" (geral e por máquina) ----------
const iniciais = (n) => {
  const p = n.split(/\s+/).filter((x) => x && !/^(dos|das|de|da|do|e|júnior|junior|filho|neto)$/i.test(x));
  return ((p[0]?.[0] || '') + (p.length > 1 ? p.at(-1)[0] : '')).toUpperCase();
};
function rankingAtendentes(lista, { sub, limite = 8, comMaquina = false } = {}) {
  const atend = {};
  lista.forEach((o) => {
    if (!o.atendente) return;
    const a = (atend[o.atendente] ??= { n: 0, hf: 0, nf: 0, maq: {} }); a.n++;
    if (fechado(o)) { a.nf++; a.hf += horasParada(o); }
    a.maq[o.maquina] = (a.maq[o.maquina] || 0) + 1;
  });
  const l = Object.entries(atend).sort((a, b) => b[1].n - a[1].n).slice(0, limite);
  if (!l.length) return '';
  const max = Math.max(1, ...l.map(([, v]) => v.n)), tot = lista.filter((o) => o.atendente).length || 1;
  return `<section class="bloco"><div class="bloco-topo"><h2>Quem mais atendeu</h2><p class="sub">${sub}</p></div>
    <ol class="atend-lista">${l.map(([n, v], i) => {
      const top = Object.entries(v.maq).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c, q]) => `${nomeMaq(c)} (${q})`).join(', ');
      return `<li title="${esc(n)}: ${v.n} chamados">
      <span class="atend-pos">${i + 1}º</span><span class="atend-av" aria-hidden="true">${esc(iniciais(n))}</span>
      <span class="atend-nome">${esc(n)}${comMaquina ? `<small>mais em ${esc(top)}</small>` : ''}</span>
      <span class="atend-barra"><i style="width:${v.n / max * 100}%"></i></span>
      <b class="atend-n">${v.n}<small>${Math.round(v.n / tot * 100)}%</small></b>
      <span class="atend-t">${v.nf ? hrs(v.hf / v.nf) : '–'}<small>médio</small></span></li>`;
    }).join('')}</ol></section>`;
}

// ---------- gráfico mês a mês (barras finas, grade discreta, média, dica ao passar o mouse, clique abre o mês) ----------
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (k) => { const t = `${MES_LONGO[+k.slice(5) - 1]} de ${k.slice(0, 4)}`; return t[0].toUpperCase() + t.slice(1); };
function escalaBonita(max) {
  const bruto = max / 4, mag = 10 ** Math.floor(Math.log10(Math.max(1, bruto))), passo = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((p) => p >= bruto) || mag * 10;
  return { passo, topo: Math.max(passo, Math.ceil(max / passo) * passo) };
}
function graficoMeses(meses, media, sel) {
  const max = Math.max(1, ...meses.map((x) => x.n)), { passo, topo } = escalaBonita(max);
  const ticks = []; for (let v = 0; v <= topo; v += passo) ticks.push(v);
  const iMax = meses.findIndex((x) => x.n === max), ult = meses.length - 1;
  return `<div class="cm2 ${sel ? 'tem-sel' : ''}" style="--n:${meses.length}">
    <div class="cm2-eixo" aria-hidden="true">${ticks.slice().reverse().map((v) => `<span style="bottom:${v / topo * 100}%">${v}</span>`).join('')}</div>
    <div class="cm2-rolar"><div class="cm2-plot">
      ${ticks.map((v) => `<i class="cm2-grade" style="bottom:${v / topo * 100}%"></i>`).join('')}
      <i class="cm2-media" style="bottom:${media / topo * 100}%"></i>
      ${meses.map((x, i) => {
        const pct = (x.n / topo) * 100, rot = i === iMax || i === ult || x.k === sel;
        return `<button type="button" class="cm2-col ${x.k === sel ? 'sel' : ''}" data-mes="${x.k}" aria-pressed="${x.k === sel}" aria-label="${nomeMes(x.k)}: ${x.n} chamados, ${x.pl} parada de linha">
          <span class="cm2-barra" style="height:${pct}%">${rot && x.n ? `<b class="cm2-val">${x.n}</b>` : ''}${x.n - x.pl ? `<i class="cm2-o" style="flex:${x.n - x.pl}"></i>` : ''}${x.pl ? `<i class="cm2-pl" style="flex:${x.pl}"></i>` : ''}</span>
          <span class="cm2-x">${x.rot}</span>
          <span class="cm2-dica" role="presentation"><b>${nomeMes(x.k)}</b><span><i class="lg-outros"></i>${x.n} chamados</span><span><i class="lg-atr"></i>${x.pl} parada de linha</span><span class="muted">${hrs(x.h)} em chamado</span></span>
        </button>`;
      }).join('')}
    </div></div>
  </div>`;
}
function painelMes(k, lista, meses, agora, comMaquina = false) {
  const m = meses.find((x) => x.k === k) || { n: 0, pl: 0, h: 0 };
  return painelChamados({ eyebrow: 'Mês selecionado', titulo: nomeMes(k), lista: lista.filter((o) => diaDe(o.abertura).startsWith(k)), agora, comMaquina, fechar: 'data-fechar-mes', resumo: `${m.n} chamados · ${m.pl} parada de linha · ${hrs(m.h)} em chamado` });
}
// painel de chamados que abre embaixo de um gráfico (mês clicado, horário clicado)
function painelChamados({ eyebrow, titulo, lista, agora, comMaquina = false, fechar, resumo }) {
  const doL = lista.slice().sort((a, b) => String(a.abertura).localeCompare(String(b.abertura)));
  const sis = {}; doL.forEach((o) => { sis[o.sistema] = (sis[o.sistema] || 0) + 1; });
  const top = Object.entries(sis).sort((a, b) => b[1] - a[1]).slice(0, 4);
  resumo ??= `${doL.length} chamados · ${doL.filter(ehPL).length} parada de linha · ${hrs(doL.reduce((s, c) => s + horasParada(c, agora), 0))} em chamado`;
  return `<div class="cm-painel" role="region" aria-label="Chamados: ${esc(titulo)}">
    <div class="cm-painel-topo"><div><span class="eyebrow">${eyebrow}</span><h3>${esc(titulo)}</h3>
      <p class="sub">${resumo}${top.length ? ` · mais: ${top.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}` : ''}</p></div>
      <button type="button" class="btn btn-sec btn-sm" ${fechar}>${ic('x')} Fechar</button></div>
    <div class="corr-tab-box"><table class="corr-tab corr-lista"><thead><tr><th>OM</th>${comMaquina ? '<th>Máquina</th>' : ''}<th>Assunto</th><th>Prioridade</th><th>Abertura</th><th>Fechamento</th><th>Tempo</th><th>Atendente</th></tr></thead><tbody>
      ${doL.map((o) => `<tr><td class="corr-os">${o.os}</td>${comMaquina ? `<td><a href="#c-${slugMaq(o.maquina)}">${esc(nomeMaq(o.maquina))}</a></td>` : ''}<td>${esc(o.assunto)}<small class="muted">${esc(o.sistema || '')}</small></td>
        <td><span class="corr-pri corr-pri-${ehPL(o) ? 'pl' : /cr[ií]tico/i.test(o.prioridade || '') ? 'cr' : 'nm'}">${esc(o.prioridade || '–')}</span></td>
        <td>${dataHoraBR(o.abertura)}</td><td>${fechado(o) ? dataHoraBR(o.ultimo_atend || o.ultima_mod) : '<span class="muted">em aberto</span>'}</td><td>${hrs(horasParada(o, agora))}</td><td>${esc(o.atendente || '–')}</td></tr>`).join('') || `<tr><td colspan="${comMaquina ? 8 : 7}" class="muted">Nenhum chamado.</td></tr>`}
    </tbody></table></div>
  </div>`;
}

// chamados agrupados por mês, do primeiro chamado até o mês atual (meses sem chamado entram com zero)
function mesesDe(lista, h, agora) {
  const meses = [], comData = lista.filter((c) => c.abertura), ehPL = (c) => /parada/i.test(c.prioridade || '');
  if (!comData.length) return meses;
  const por = {}; comData.forEach((c) => (por[diaDe(c.abertura).slice(0, 7)] ??= []).push(c));
  const prim = Object.keys(por).sort()[0];
  let a = +prim.slice(0, 4), mm = +prim.slice(5, 7); const af = +h.slice(0, 4), mf = +h.slice(5, 7);
  while (a < af || (a === af && mm <= mf)) {
    const k = `${a}-${String(mm).padStart(2, '0')}`, l = por[k] || [];
    meses.push({ k, rot: MES_C[mm - 1] + (mm === 1 || !meses.length ? `/${String(a).slice(2)}` : ''), n: l.length, pl: l.filter(ehPL).length, h: l.reduce((s2, c) => s2 + horasParada(c, agora), 0) });
    mm++; if (mm > 12) { mm = 1; a++; }
  }
  return meses;
}

function ligarMeses(el, st, desenhar) {
  el.querySelectorAll('[data-mes]').forEach((b) => { b.onclick = () => {
    st.mes = st.mes === b.dataset.mes ? null : b.dataset.mes; const y = scrollY; desenhar(); scrollTo(0, y);
    if (st.mes) el.querySelector('.cm-painel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }; });
  el.querySelectorAll('[data-fechar-mes]').forEach((b) => { b.onclick = () => { st.mes = null; const y = scrollY; desenhar(); scrollTo(0, y); }; });
}

function ligarCalor(el, st, desenhar) {
  el.querySelectorAll('[data-calor]').forEach((b) => { b.onclick = () => {
    const [d, hh] = b.dataset.calor.split('-').map(Number);
    st.calor = st.calor && st.calor[0] === d && st.calor[1] === hh ? null : [d, hh]; const y = scrollY; desenhar(); scrollTo(0, y);
    if (st.calor) el.querySelector('[data-fechar-calor]')?.closest('.cm-painel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }; });
  el.querySelectorAll('[data-fechar-calor]').forEach((b) => { b.onclick = () => { st.calor = null; const y = scrollY; desenhar(); scrollTo(0, y); }; });
}

// ---------- relatório mensal (PDF A4) ----------
export function mesesComChamados(todas) {
  return [...new Set(todas.map((c) => diaDe(c.abertura).slice(0, 7)).filter(Boolean))].sort().reverse();
}
function abrirRelatorioMensal(todas) {
  const meses = mesesComChamados(todas);
  if (!meses.length) { toast('Importe os chamados do SM primeiro.'); return; }
  const h = hoje(), atual = h.slice(0, 7);
  // padrão: o último mês fechado
  const pad = meses.find((k) => k < atual) || meses[0];
  const montar = (k) => relatorioMensalA4({ k, lista: todas, nomeMaq, banner: 'logo-vetore.png', geradoEm: dataBR(h) });
  abrirModal({ titulo: 'Relatório mensal de corretivas', html: `
    <div class="relm">
      <div class="relm-topo"><label>Mês <select class="campo" data-relm-mes>${meses.map((k) => `<option value="${k}" ${k === pad ? 'selected' : ''}>${nomeMes(k)}${k === atual ? ' (em andamento)' : ''}</option>`).join('')}</select></label>
        <button type="button" class="btn btn-pri" data-relm-pdf>${ic('baixar')} Baixar PDF</button></div>
      <div class="relm-previa"><div class="folhas" data-relm-previa></div></div>
      <p class="sub">Uma página A4 com os números do mês, a comparação com o mês anterior, os últimos 12 meses, as máquinas e os problemas que mais pararam.</p>
    </div>`, largo: true,
  onAbrir: (c) => {
    const sel = c.querySelector('[data-relm-mes]'), pv = c.querySelector('[data-relm-previa]'), bt = c.querySelector('[data-relm-pdf]');
    const ver = () => { pv.innerHTML = montar(sel.value); const k = Math.min(1, (pv.clientWidth || 600) / 794); pv.style.setProperty('--k', k); };
    sel.onchange = ver; ver(); requestAnimationFrame(ver);
    bt.onclick = async () => {
      bt.disabled = true; bt.textContent = 'Gerando PDF…';
      try { const blob = await pdfDeHtml(montar(sel.value), { title: `Corretivas · ${nomeMes(sel.value)}`, subject: 'Relatório mensal de corretivas' }); await salvarArquivo(`Corretivas ${sel.value} - Relatório mensal.pdf`, blob); toast('PDF gerado.'); }
      catch (e) { toast('Não foi possível gerar o PDF: ' + (e?.message || e), 'erro'); }
      finally { bt.disabled = false; bt.innerHTML = `${ic('baixar')} Baixar PDF`; }
    };
  } });
}
