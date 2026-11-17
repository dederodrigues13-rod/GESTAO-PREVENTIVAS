// =====================================================================
// Tela Corretivas (#corretivas): chamados do portal SM cruzados com as
// preventivas. As OMs entram colando a tabela de Chamados do SM ou pelo
// botão de favorito "Enviar ao sistema" (lê a tabela na tela do SM e
// manda para cá; funciona de dentro da rede da Vetore, sem a TI).
// =====================================================================
import { MAQUINAS, porCodigo, SETORES, CELULA_VTFE } from './dados.js';
import { itens, hoje } from './situacao.js';
import { corretivas, importarCorretivas, definirMaquinaCorretiva } from './store.js';
import { lerChamados, horasParada, fechado, FORNOS_GERAL, SEM_MAQUINA } from './corretivas-regras.js';
import { esc, ic, dataBR, dataHoraBR, toast, abrirModal, contarNumeros, esqueleto } from './ui.js';

const APP = location.origin;
const ORIGEM_SM = /^https:\/\/([a-z0-9-]+\.)*suporte\.com$/i;   // de onde o botão de favorito pode mandar
const PENDENTE = 'prev-sm-pendente';
const JANELA = 90;                // dias antes/depois da preventiva para comparar
const LOGO_DEPOIS = 15;           // quebra até 15 dias depois da preventiva = alerta
const PERIODOS = [['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['mes', 'Este mês'], ['ano', 'Este ano'], ['tudo', 'Tudo']];
const nomeMaq = (c) => (c === FORNOS_GERAL ? 'Fornos (geral)' : c === SEM_MAQUINA ? 'Sem máquina' : c);
const hrs = (h) => (h >= 48 ? `${(h / 24).toFixed(1).replace('.', ',')} d` : `${h.toFixed(1).replace('.', ',')} h`);
const diaDe = (ts) => (ts ? ts.slice(0, 10) : '');
const somaDiasIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ---------- botão de favorito (bookmarklet) ----------
// Lê as linhas da tabela que está na tela do SM e manda para o sistema numa janela nova.
// Grades com colunas congeladas guardam cada linha em duas tabelas: junta pelo índice da linha.
export function codigoFavorito() {
  const js = `(()=>{const A=${JSON.stringify(APP)};const g=new Map();let n=0;document.querySelectorAll('tr').forEach(t=>{const k=t.getAttribute('datagrid-row-index')??t.getAttribute('data-index')??t.getAttribute('aria-rowindex')??('r'+(n++));const c=[...t.cells].map(x=>(x.innerText||'').replace(/\\s+/g,' ').trim());g.set(k,(g.get(k)||[]).concat(c))});const V=[...g.values()].map(c=>c.join('\\t'));const L=V.filter(x=>/\\b\\d{4,7}\\b/.test(x)&&/\\d{2}\\/\\d{2}\\/\\d{4}/.test(x));const H=[...document.querySelectorAll('tr')].filter(t=>/Priorid|Solicitante|Identifica/.test(t.innerText||'')&&!/\\d{2}\\/\\d{2}\\/\\d{4}/.test(t.innerText||''));const h=H.flatMap(t=>[...t.cells].map(x=>(x.innerText||'').replace(/\\s+/g,' ').trim())).join('\\t');if(!L.length){alert('Nenhum chamado na tela. Abra a lista de Chamados do SM e tente de novo.');return}const w=window.open(A+'/#corretivas','gestao-preventivas');if(!w){alert('O navegador bloqueou a janela. Libere pop-ups para este site.');return}const m={tipo:'sm-chamados',texto:(h?h+'\\n':'')+L.join('\\n'),qtd:L.length};let k=0;const i=setInterval(()=>{try{w.postMessage(m,A)}catch(e){}if(++k>80)clearInterval(i)},500);addEventListener('message',e=>{if(e.origin===A&&e.data==='sm-ok')clearInterval(i)})})()`;
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
  const st = { per: sessionStorage.getItem('prev-corr-per') || '90', setor: 'todos' };
  const desenhar = () => {
    const h = hoje(), agora = Date.now();
    const ini = st.per === '30' ? somaDiasIso(h, -30) : st.per === '90' ? somaDiasIso(h, -90) : st.per === 'mes' ? h.slice(0, 8) + '01' : st.per === 'ano' ? h.slice(0, 5) + '01-01' : '0000';
    const setorDe = (c) => (c === FORNOS_GERAL ? 'fornos' : porCodigo[c]?.setor || 'outros');
    const lista = todas.filter((c) => diaDe(c.abertura) >= ini && (st.setor === 'todos' || setorDe(c.maquina) === st.setor))
      .sort((a, b) => String(b.abertura).localeCompare(String(a.abertura)));
    const horas = lista.reduce((s, c) => s + horasParada(c, agora), 0);
    const fech = lista.filter(fechado), mttr = fech.length ? fech.reduce((s, c) => s + horasParada(c), 0) / fech.length : 0;
    const abertas = todas.filter((c) => !fechado(c));
    const pl = lista.filter((c) => /parada/i.test(c.prioridade || '')).length;
    const prev = preventivasFeitas();
    // por máquina
    const cods = [...new Set([...MAQUINAS.map((m) => m.codigo), FORNOS_GERAL, SEM_MAQUINA])].filter((c) => st.setor === 'todos' || setorDe(c) === st.setor);
    const linhas = cods.map((c) => {
      const os = lista.filter((o) => o.maquina === c), hh = os.reduce((s, o) => s + horasParada(o, agora), 0);
      const ult = (prev[c] || []).at(-1), ad = antesDepois([c], todas, prev);
      return { c, os: os.length, hh, ult, ad, pl: os.filter((o) => /parada/i.test(o.prioridade || '')).length };
    }).filter((x) => x.os || x.ult).sort((a, b) => b.hh - a.hh || b.os - a.os);
    const maxH = Math.max(1, ...linhas.map((x) => x.hh));
    // quebras logo depois da preventiva
    const alertas = [];
    Object.entries(prev).forEach(([c, datas]) => datas.forEach((d) => todas.forEach((o) => {
      const a = diaDe(o.abertura); if (o.maquina === c && a > d && a <= somaDiasIso(d, LOGO_DEPOIS)) alertas.push({ o, d, dias: Math.round((new Date(a) - new Date(d)) / 864e5) });
    })));
    // sistemas
    const sis = {}; lista.forEach((o) => { const s = (sis[o.sistema] ??= { n: 0, h: 0 }); s.n++; s.h += horasParada(o, agora); });
    const sisL = Object.entries(sis).sort((a, b) => b[1].n - a[1].n || b[1].h - a[1].h), maxS = Math.max(1, ...sisL.map(([, v]) => v.n));
    const opcoesMaq = [SEM_MAQUINA, FORNOS_GERAL, ...MAQUINAS.map((m) => m.codigo)];
    const total = antesDepois(Object.keys(prev), todas, prev);

    el.innerHTML = `<div class="pag">
      <div class="pag-topo pag-topo-acao"><div><h1 class="tit">Corretivas · portal SM</h1><p class="sub">${todas.length} chamados no sistema · máquina pelo solicitante (fornos pelo assunto)</p></div>
        <button type="button" class="btn btn-pri" data-importar>${ic('baixar')} Importar do SM</button></div>
      <div class="corr-filtros">
        <div class="ma-abas">${PERIODOS.map(([k, n]) => `<button type="button" class="chip ${st.per === k ? 'on' : ''}" data-per="${k}">${n}</button>`).join('')}</div>
        <div class="ma-abas">${[['todos', 'Todos'], ...Object.keys(SETORES).map((k) => [k, SETORES[k].curto])].map(([k, n]) => `<button type="button" class="chip ${st.setor === k ? 'on' : ''}" data-setor="${k}">${n}</button>`).join('')}</div>
      </div>
      ${todas.length ? '' : `<section class="bloco vazio-corr"><h2>Nenhum chamado ainda</h2><p class="sub">Clique em <b>Importar do SM</b>: cole a tabela de Chamados ou instale o botão de favorito.</p></section>`}
      <div class="ind-hero corr-kpis">
        <div class="kpi"><b data-contar>${lista.length}</b><span>chamados no período</span></div>
        <div class="kpi" style="--c:var(--danger)"><b>${hrs(horas)}</b><span>com chamado aberto (da abertura ao fechamento)</span></div>
        <div class="kpi" style="--c:#5aa2ff"><b>${hrs(mttr)}</b><span>tempo médio até fechar</span></div>
        <div class="kpi" style="--c:var(--yellow)"><b data-contar>${pl}</b><span>parada de linha</span></div>
        <div class="kpi" style="--c:#f0a93b"><b data-contar>${abertas.length}</b><span>abertos agora no SM</span></div>
      </div>

      <section class="bloco"><div class="bloco-topo"><h2>Preventiva × corretiva por máquina</h2>
        <p class="sub">Compara os chamados ${JANELA} dias antes e ${JANELA} dias depois de cada preventiva feita. ${total.n ? `No total: <b>${total.antes}</b> antes → <b>${total.depois}</b> depois.` : 'Aparece quando a primeira preventiva completar ' + JANELA + ' dias.'}</p></div>
        <div class="corr-tab-box"><table class="corr-tab"><thead><tr><th>Máquina</th><th>Chamados</th><th>Tempo em chamado</th><th>Parada de linha</th><th>Última preventiva</th><th>Antes → depois</th></tr></thead><tbody>
        ${linhas.map((x) => {
          const v = x.ad.n ? (x.ad.depois < x.ad.antes ? 'melhor' : x.ad.depois > x.ad.antes ? 'pior' : 'igual') : '';
          return `<tr><th scope="row">${porCodigo[x.c] ? `<a href="#h-${porCodigo[x.c].slug}">${esc(x.c)}</a>` : esc(nomeMaq(x.c))}<small>${esc(porCodigo[x.c]?.modelo || (x.c === SEM_MAQUINA ? 'aberto por pessoa, sem máquina no assunto' : 'forno sem código no SM'))}</small></th>
            <td>${x.os}</td><td><div class="corr-barra"><i style="width:${x.hh / maxH * 100}%"></i><span>${hrs(x.hh)}</span></div></td><td>${x.pl || '–'}</td>
            <td>${x.ult ? dataBR(x.ult) : '<span class="muted">ainda não</span>'}</td>
            <td>${x.ad.n ? `<span class="corr-ad corr-${v}">${x.ad.antes} → ${x.ad.depois} ${v === 'melhor' ? '▼' : v === 'pior' ? '▲' : '='}</span>` : '<span class="muted">aguardando dados</span>'}</td></tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">Nenhum chamado no período.</td></tr>'}
        </tbody></table></div>
      </section>

      <div class="col2 col2-igual">
        <section class="bloco"><div class="bloco-topo"><h2>Sistemas que mais param</h2><p class="sub">Pelo assunto do chamado: quantas vezes · tempo em chamado</p></div>
          ${sisL.length ? `<div class="barras corr-sis">${sisL.map(([n, v]) => `<div class="barra-lin"><span>${esc(n)}</span><div class="barra barra-red"><i style="width:${v.n / maxS * 100}%"></i></div><b>${v.n}× · ${hrs(v.h)}</b></div>`).join('')}</div>` : '<p class="vazio-p">Sem chamados no período.</p>'}
        </section>
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
          <td><span class="corr-pri corr-pri-${/parada/i.test(o.prioridade || '') ? 'pl' : /cr[ií]tico/i.test(o.prioridade || '') ? 'cr' : 'nm'}">${esc(o.prioridade || '–')}</span></td>
          <td>${esc(o.status || '')}</td><td>${dataHoraBR(o.abertura)}</td><td>${hrs(horasParada(o, agora))}${fechado(o) ? '' : ' <small class="muted">em aberto</small>'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum chamado no período.</td></tr>'}
        </tbody></table>${lista.length > 300 ? '<p class="sub">Mostrando os 300 mais recentes.</p>' : ''}</div>
      </section>
    </div>`;
    contarNumeros(el);
    el.querySelectorAll('[data-per]').forEach((b) => { b.onclick = () => { st.per = b.dataset.per; try { sessionStorage.setItem('prev-corr-per', st.per); } catch (e) { /* ok */ } desenhar(); }; });
    el.querySelectorAll('[data-setor]').forEach((b) => { b.onclick = () => { st.setor = b.dataset.setor; desenhar(); }; });
    el.querySelectorAll('[data-maq]').forEach((s) => { s.onchange = async () => {
      const os = +s.dataset.maq, o = todas.find((x) => x.os === os), val = s.value === o.maquina_auto ? null : s.value;
      try { await definirMaquinaCorretiva(os, val); todas = await corretivas(); toast(`OM ${os} agora é da ${nomeMaq(s.value)}.`); desenhar(); } catch (e) { toast('Não foi possível trocar: ' + (e?.message || e), 'erro'); }
    }; });
    el.querySelector('[data-importar]').onclick = () => abrirImportar(async () => { todas = await corretivas(); desenhar(); });
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
      pv.textContent = l.length ? `${l.length} chamados encontrados · ${new Set(l.map((x) => x.maquina)).size} máquinas · de ${dataBR(l.map((x) => diaDe(x.abertura)).filter(Boolean).sort()[0] || '')} a ${dataBR(l.map((x) => diaDe(x.abertura)).filter(Boolean).sort().at(-1) || '')}` : (ta.value.trim() ? 'Não encontrei chamados nesse texto.' : ''); };
    ok.onclick = async () => { ok.disabled = true; ok.textContent = 'Importando…'; try { await importarTexto(ta.value); fechar(); depois?.(); } catch (e) { toast('Não foi possível importar: ' + (e?.message || e), 'erro'); ok.disabled = false; ok.textContent = 'Importar'; } };
  } });
}

// chamados de uma máquina (para o histórico da máquina)
export async function corretivasDaMaquina(codigo) {
  return (await corretivas()).filter((c) => c.maquina === codigo).sort((a, b) => String(b.abertura).localeCompare(String(a.abertura)));
}
