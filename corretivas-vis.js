// =====================================================================
// Visualizações das corretivas: números com tendência (mini-gráfico),
// mapa de calor dia × hora, Pareto, máquinas × meses e o relatório
// mensal em A4. Só montam HTML; quem liga os cliques é corretivas.js.
// =====================================================================
import { horasParada, fechado } from './corretivas-regras.js';
import { esc } from './ui.js';

export const hrs = (h) => (h >= 48 ? `${(h / 24).toFixed(1).replace('.', ',')} d` : `${h.toFixed(1).replace('.', ',')} h`);
export const diaDe = (ts) => (ts ? ts.slice(0, 10) : '');
export const ehPL = (c) => /parada/i.test(c.prioridade || '');
const MES_C = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const somaDiasIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt1 = (v) => v.toFixed(1).replace('.', ',');
// data/hora local (Brasília) de um timestamp
const local = (ts) => new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

// ---------- períodos ----------
// devolve [ini, fim] do período escolhido e do período anterior de mesmo tamanho (fim exclusivo)
export function janelas(per, h) {
  const amanha = somaDiasIso(h, 1);
  if (per === '30' || per === '90') { const n = +per, ini = somaDiasIso(h, -n + 1); return { atual: [ini, amanha], ant: [somaDiasIso(ini, -n), ini], rot: `${n} dias anteriores` }; }
  if (per === 'mes') { const ini = h.slice(0, 8) + '01', d = new Date(ini + 'T12:00:00'); d.setMonth(d.getMonth() - 1); const iniA = d.toISOString().slice(0, 10), dia = +h.slice(8);
    const fimA = somaDiasIso(iniA, dia); return { atual: [ini, amanha], ant: [iniA, fimA < ini ? fimA : ini], rot: 'mesmo trecho do mês anterior' }; }
  if (per === 'ano') { const ini = h.slice(0, 4) + '-01-01', a = +h.slice(0, 4) - 1; return { atual: [ini, amanha], ant: [`${a}-01-01`, `${a}${h.slice(4)}`], rot: `mesmo trecho de ${a}` }; }
  return { atual: ['0000', amanha], ant: null, rot: '' };
}
export const noIntervalo = (c, [a, b]) => { const d = diaDe(c.abertura); return d >= a && d < b; };

// últimos 12 meses (inclui o atual) de uma métrica
export function serie12(lista, h, fn) {
  const out = []; let a = +h.slice(0, 4), m = +h.slice(5, 7);
  for (let i = 0; i < 12; i++) { out.unshift(`${a}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; a--; } }
  const por = {}; lista.forEach((c) => { if (c.abertura) (por[diaDe(c.abertura).slice(0, 7)] ??= []).push(c); });
  return out.map((k) => fn(por[k] || []));
}
export const mttr = (l) => { const f = l.filter(fechado); return f.length ? f.reduce((s, c) => s + horasParada(c), 0) / f.length : 0; };

// ---------- mini-gráfico (linha + área) ----------
export function sparkline(v, cor, { w = 300, h = 90, pad = 10, id = 's' + Math.random().toString(36).slice(2, 7), classe = 'spark' } = {}) {
  if (!v.length || v.every((x) => !x)) return '';
  const mx = Math.max(...v), mn = Math.min(...v);
  const pts = v.map((y, i) => [i / (v.length - 1 || 1) * w, pad + (1 - (y - mn) / (mx - mn || 1)) * (h - pad * 2)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const u = pts.at(-1);
  return `<svg class="${classe}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".32"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${(u[0] - 3).toFixed(1)}" cy="${u[1].toFixed(1)}" r="4" fill="${cor}" stroke="var(--panel)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------- cartão de número com variação ----------
// menorMelhor: se cair é bom (verde)
export function cartaoKpi({ rot, val, sub = '', atual, anterior, menorMelhor = true, serie = [], cor = '#5aa2ff', corVal = '', rotAnt = '' }) {
  let chip = '';
  if (anterior != null && anterior > 0 && atual != null) {
    const d = (atual - anterior) / anterior * 100, igual = Math.abs(d) < 2;
    const bom = igual ? null : (d < 0) === menorMelhor;
    chip = `<span class="kpi2-var ${igual ? 'igual' : bom ? 'bom' : 'ruim'}" title="${esc(rotAnt)}">${igual ? '=' : d < 0 ? '▼' : '▲'} ${Math.abs(Math.round(d))}%</span>`;
  }
  return `<div class="kpi2"><div class="kpi2-topo"><span>${rot}</span>${chip}</div>
    <b class="kpi2-val" ${corVal ? `style="color:${corVal}"` : ''} data-contar>${val}</b><small>${sub}</small>${sparkline(serie, cor)}</div>`;
}

// ---------- mapa de calor: dia da semana × hora ----------
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ESC_CALOR = ['#232830', '#3a2a24', '#5a3424', '#8a3e22', '#c44a24', '#ff5a36'];
export function contarCalor(lista) {
  const m = DIAS.map(() => Array(24).fill(0));
  lista.forEach((c) => { if (!c.abertura) return; const d = local(c.abertura); m[(d.getDay() + 6) % 7][d.getHours()]++; });
  return m;
}
export const chamadosDoHorario = (lista, dia, hora) => lista.filter((c) => { if (!c.abertura) return false; const d = local(c.abertura); return (d.getDay() + 6) % 7 === dia && d.getHours() === hora; });
export function mapaCalor(lista, sel) {
  const m = contarCalor(lista), tot = lista.filter((c) => c.abertura).length;
  if (!tot) return '<p class="vazio-p">Sem chamados no período.</p>';
  const max = Math.max(1, ...m.flat());
  // destaques: horário de pico, turno e dia com mais chamados
  let pico = [0, 0]; m.forEach((l, d) => l.forEach((n, h) => { if (n > m[pico[0]][pico[1]]) pico = [d, h]; }));
  const turno = (h) => (h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2), porTurno = [0, 0, 0];
  m.forEach((l) => l.forEach((n, h) => { porTurno[turno(h)] += n; }));
  const tMax = porTurno.indexOf(Math.max(...porTurno)), nomesT = ['1º turno (6h–14h)', '2º turno (14h–22h)', '3º turno (22h–6h)'];
  const porDia = m.map((l) => l.reduce((a, b) => a + b, 0)), dMax = porDia.indexOf(Math.max(...porDia));
  const troca = [5, 6, 7, 13, 14, 15, 21, 22, 23].reduce((s, h) => s + m.reduce((a, l) => a + l[h], 0), 0);
  const nivel = (n) => (n === 0 ? 0 : Math.min(5, 1 + Math.floor((n / max) * 4.999)));
  const horas = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
  return `<div class="calor-dest">
      <span><b>Pico:</b> ${DIAS[pico[0]]} às ${horas[pico[1]]}h (${m[pico[0]][pico[1]]})</span>
      <span><b>Turno com mais chamados:</b> ${nomesT[tMax]} · ${Math.round(porTurno[tMax] / tot * 100)}%</span>
      <span><b>Dia:</b> ${DIAS[dMax]} · ${Math.round(porDia[dMax] / tot * 100)}%</span>
      <span><b>Perto da troca de turno</b> (1h antes/depois): ${Math.round(troca / tot * 100)}%</span></div>
    <div class="calor-rolar"><div class="calor-grade">
      <div></div><div class="calor-turno t3" style="grid-column: span 6">3º turno · 22h–6h</div><div class="calor-turno t1" style="grid-column: span 8">1º turno · 6h–14h</div><div class="calor-turno t2" style="grid-column: span 8">2º turno · 14h–22h</div><div class="calor-turno t3" style="grid-column: span 2">3º</div>
      <div></div>${horas.map((h) => `<div class="calor-h">${h}</div>`).join('')}
      ${m.map((l, d) => `<div class="calor-dia">${DIAS[d]}</div>${l.map((n, h) => { const k = nivel(n), s = sel && sel[0] === d && sel[1] === h;
        return `<button type="button" class="calor-c ${s ? 'sel' : ''}" data-calor="${d}-${h}" ${n ? '' : 'disabled'} style="background:${ESC_CALOR[k]};color:${k >= 4 ? '#1a0b05' : 'var(--text)'}" title="${DIAS[d]} ${horas[h]}h: ${n} chamados" aria-label="${DIAS[d]} ${horas[h]} horas: ${n} chamados">${n >= max * .5 ? n : ''}</button>`; }).join('')}`).join('')}
    </div></div>
    <div class="calor-leg"><span>menos</span>${ESC_CALOR.map((c) => `<i style="background:${c}"></i>`).join('')}<span>mais chamados</span><span class="muted">· clique num quadrado para ver os chamados daquele horário</span></div>`;
}
export const nomeHorario = ([d, h]) => `${['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][d]} às ${String(h).padStart(2, '0')}h`;

// ---------- Pareto (barras + linha acumulada + marca de 80%) ----------
export function pareto(lista, agora) {
  const sis = {}; lista.forEach((o) => { const s = (sis[o.sistema || 'Outros / máquina'] ??= { n: 0, h: 0, pl: 0 }); s.n++; s.h += horasParada(o, agora); if (ehPL(o)) s.pl++; });
  let l = Object.entries(sis).sort((a, b) => b[1].n - a[1].n);
  if (!l.length) return '<p class="vazio-p">Sem chamados no período.</p>';
  if (l.length > 10) { const resto = l.slice(9).reduce((a, [, v]) => ({ n: a.n + v.n, h: a.h + v.h, pl: a.pl + v.pl }), { n: 0, h: 0, pl: 0 }); l = [...l.slice(0, 9), ['Demais', resto]]; }
  const tot = l.reduce((a, [, v]) => a + v.n, 0), max = Math.max(...l.map(([, v]) => v.n));
  let ac = 0; const it = l.map(([nome, v]) => { ac += v.n; return { nome, ...v, cum: ac / tot }; });
  const nTop = Math.min(it.length, it.filter((x) => x.cum < .8).length + 1);
  const n = it.length, pontos = it.map((x, i) => `${i * 100 + 50},${(100 - x.cum * 100).toFixed(2)}`).join(' ');
  return `<p class="pareto-dest"><b>${nTop} ${nTop === 1 ? 'sistema faz' : 'sistemas fazem'} ${Math.round(it[nTop - 1].cum * 100)}%</b> dos chamados: é onde a preventiva mais rende.</p>
    <div class="pareto" style="--n:${n}">
      <div class="pareto-area">
        <i class="pareto-80"><span>80%</span></i>
        <svg viewBox="0 0 ${n * 100} 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pontos}" fill="none" stroke="var(--yellow)" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>
        ${it.map((x, i) => `<div class="pareto-col ${i < nTop ? 'pareto-dest-col' : ''}" title="${esc(x.nome)}: ${x.n} chamados · ${x.pl} parada de linha · ${hrs(x.h)} · ${Math.round(x.cum * 100)}% acumulado">
          <span class="pareto-bar" style="height:${x.n / max * 100}%"><b>${x.n}</b></span><i class="pareto-pt" style="bottom:${x.cum * 100}%"></i></div>`).join('')}
      </div>
      <div class="pareto-rot">${it.map((x) => `<span>${esc(x.nome)}</span>`).join('')}</div>
    </div>`;
}

// ---------- máquinas × meses ----------
const ESC_AZUL = ['#22272e', '#2d3a4a', '#35506b', '#3f6a8f', '#5a8fbf', '#8cc0ef'];
export function matrizMaquinasMeses(lista, h, maquinas, nomeMaq, slugMaq) {
  const meses = []; let a = +h.slice(0, 4), m = +h.slice(5, 7);
  for (let i = 0; i < 12; i++) { meses.unshift({ k: `${a}-${String(m).padStart(2, '0')}`, rot: MES_C[m - 1] + (m === 1 ? `/${String(a).slice(2)}` : '') }); m--; if (!m) { m = 12; a--; } }
  meses[0].rot = MES_C[+meses[0].k.slice(5) - 1] + '/' + meses[0].k.slice(2, 4);
  const cont = {}; lista.forEach((c) => { if (!c.abertura) return; const k = diaDe(c.abertura).slice(0, 7); (cont[c.maquina] ??= {})[k] = (cont[c.maquina][k] || 0) + 1; });
  const linhas = maquinas.map((cod) => { const v = meses.map((x) => cont[cod]?.[x.k] || 0); return { cod, v, tot: v.reduce((p, q) => p + q, 0) }; }).filter((x) => x.tot).sort((p, q) => q.tot - p.tot);
  if (!linhas.length) return '<p class="vazio-p">Sem chamados nos últimos 12 meses.</p>';
  const max = Math.max(1, ...linhas.flatMap((x) => x.v)), nivel = (n) => (n === 0 ? 0 : Math.min(5, 1 + Math.floor((n / max) * 4.999)));
  return `<div class="matriz-rolar"><div class="matriz" style="--n:${meses.length}">
    <div></div>${meses.map((x, i) => `<div class="matriz-mes ${i === meses.length - 1 ? 'atual' : ''}">${x.rot}</div>`).join('')}<div class="matriz-mes">total</div><div class="matriz-mes" title="Últimos 3 meses fechados comparados com os 3 anteriores">3 meses</div>
    ${linhas.map((x) => { const u3 = x.v.slice(-4, -1).reduce((p, q) => p + q, 0), a3 = x.v.slice(-7, -4).reduce((p, q) => p + q, 0), d = a3 ? Math.round((u3 - a3) / a3 * 100) : null;
      return `<a class="matriz-maq" href="#c-${slugMaq(x.cod)}">${esc(nomeMaq(x.cod))}</a>${x.v.map((n, i) => { const k = nivel(n); return `<span class="matriz-c" style="background:${ESC_AZUL[k]};color:${k >= 4 ? '#0c1520' : 'var(--muted)'}" title="${esc(nomeMaq(x.cod))} · ${meses[i].rot}: ${n} chamados">${n || ''}</span>`; }).join('')}
        <b class="matriz-tot">${x.tot}</b><span class="matriz-var ${d == null ? '' : d > 5 ? 'ruim' : d < -5 ? 'bom' : ''}">${d == null ? '–' : `${d > 5 ? '▲' : d < -5 ? '▼' : '='} ${Math.abs(d)}%`}</span>`; }).join('')}
  </div></div>
  <div class="calor-leg"><span>0</span>${ESC_AZUL.map((c) => `<i style="background:${c}"></i>`).join('')}<span>${max} chamados no mês</span></div>`;
}

// ---------- relatório mensal em A4 ----------
export function relatorioMensalA4({ k, lista, maquinasDe, nomeMaq, banner, geradoEm }) {
  const MES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mes = (x) => `${MES_L[+x.slice(5) - 1]} de ${x.slice(0, 4)}`;
  const ant = (() => { let a = +k.slice(0, 4), m = +k.slice(5) - 1; if (!m) { m = 12; a--; } return `${a}-${String(m).padStart(2, '0')}`; })();
  const doMes = (x) => lista.filter((c) => diaDe(c.abertura).startsWith(x));
  const A = doMes(k), B = doMes(ant);
  const vr = (a, b, menorMelhor = true) => { if (!b) return { t: '–', c: '#535c67' }; const d = Math.round((a - b) / b * 100); if (Math.abs(d) < 2) return { t: `= vs ${MES_C[+ant.slice(5) - 1]}`, c: '#535c67' }; return { t: `${d < 0 ? '▼' : '▲'} ${Math.abs(d)}% vs ${MES_C[+ant.slice(5) - 1]}`, c: (d < 0) === menorMelhor ? '#1f9d63' : '#d9431f' }; };
  const kp = [
    ['CHAMADOS', A.length, vr(A.length, B.length), '#2f6fd6'],
    ['PARADA DE LINHA', A.filter(ehPL).length, vr(A.filter(ehPL).length, B.filter(ehPL).length), '#d9431f'],
    ['TEMPO MÉDIO ATÉ FECHAR', hrs(mttr(A)), vr(mttr(A), mttr(B)), '#1f9d63'],
    ['ABERTOS NO FIM DO MÊS', A.filter((c) => !fechado(c)).length, { t: 'ainda sem fechamento', c: '#535c67' }, '#f0a93b'],
  ];
  // 12 meses até o mês do relatório
  const ms = []; let a = +k.slice(0, 4), m = +k.slice(5);
  for (let i = 0; i < 12; i++) { ms.unshift(`${a}-${String(m).padStart(2, '0')}`); m--; if (!m) { m = 12; a--; } }
  const ser = ms.map((x) => { const l = doMes(x); return { x, n: l.length, pl: l.filter(ehPL).length }; }), mx = Math.max(1, ...ser.map((s) => s.n));
  const porMaq = (l) => { const o = {}; l.forEach((c) => { (o[c.maquina] ??= []).push(c); }); return o; };
  const pmA = porMaq(A), pmB = porMaq(B);
  const top = Object.entries(pmA).sort((p, q) => q[1].length - p[1].length).slice(0, 6);
  const sis = {}; A.forEach((c) => { sis[c.sistema] = (sis[c.sistema] || 0) + 1; }); const ts = Object.entries(sis).sort((p, q) => q[1] - p[1]).slice(0, 6);
  const media12 = ser.reduce((s, x) => s + x.n, 0) / 12;
  const dest = [];
  if (top[0]) { const [c, l] = top[0], s2 = {}; l.forEach((o) => { s2[o.sistema] = (s2[o.sistema] || 0) + 1; }); const ps = Object.entries(s2).sort((p, q) => q[1] - p[1])[0];
    dest.push(`${esc(nomeMaq(c))} foi a máquina com mais chamados (${l.length})${ps ? `, ${ps[1]} de ${esc(ps[0].toLowerCase())}` : ''}.`); }
  dest.push(`${A.length} chamados no mês, contra a média de ${fmt1(media12)} por mês nos últimos 12 meses.`);
  if (B.length) dest.push(`Tempo médio até fechar: ${hrs(mttr(A))} (em ${MES_C[+ant.slice(5) - 1]}: ${hrs(mttr(B))}).`);
  return `<div class="a4 rel-corr">
    <div class="rc-cab">${banner ? `<img src="${banner}" alt="">` : ''}<div><small>MANUTENÇÃO INJEÇÃO · RELATÓRIO MENSAL</small><h1>Corretivas · ${mes(k)}</h1></div><div class="rc-fonte">Fonte: portal SM<br>Gerado em ${esc(geradoEm)}</div></div>
    <div class="rc-corpo">
      <div class="rc-kpis">${kp.map(([r, v, x, c]) => `<div style="border-top-color:${c}"><small>${r}</small><b>${v}</b><span style="color:${x.c}">${x.t}</span></div>`).join('')}</div>
      <section><div class="rc-tit"><h2>Chamados nos últimos 12 meses</h2><span><i style="background:#d9431f"></i>parada de linha <i style="background:#8aa0b8"></i>outros</span></div>
        <div class="rc-graf">${ser.map((s, i) => `<div><em>${s.n}</em><span style="height:${s.n / mx * 86}%"><i style="flex:${s.n - s.pl};background:${i === 11 ? '#5c7a99' : '#8aa0b8'}"></i><i style="flex:${s.pl};background:#d9431f"></i></span><small ${i === 11 ? 'class="at"' : ''}>${MES_C[+s.x.slice(5) - 1]}${+s.x.slice(5) === 1 || !i ? '/' + s.x.slice(2, 4) : ''}</small></div>`).join('')}</div></section>
      <div class="rc-2">
        <section><h2>Máquinas com mais chamados</h2><table><thead><tr><th>Máquina</th><th>Chamados</th><th>Parada de linha</th><th>vs ${MES_C[+ant.slice(5) - 1]}</th></tr></thead><tbody>
          ${top.map(([c, l]) => { const b = (pmB[c] || []).length, d = b ? Math.round((l.length - b) / b * 100) : null; return `<tr><td><b>${esc(nomeMaq(c))}</b></td><td>${l.length}</td><td>${l.filter(ehPL).length}</td><td style="color:${d == null ? '#535c67' : d > 2 ? '#d9431f' : d < -2 ? '#1f9d63' : '#535c67'}">${d == null ? 'novo' : `${d > 2 ? '▲' : d < -2 ? '▼' : '='} ${Math.abs(d)}%`}</td></tr>`; }).join('') || '<tr><td colspan="4">Sem chamados.</td></tr>'}</tbody></table></section>
        <section><h2>Maiores problemas</h2>${ts.map(([n, q]) => `<div class="rc-bar"><span>${esc(n)}</span><i><b style="width:${q / ts[0][1] * 100}%"></b></i><strong>${q}</strong></div>`).join('') || '<p>Sem chamados.</p>'}</section>
      </div>
      <section class="rc-dest"><b>Destaques do mês</b>${dest.map((t) => `<p>· ${t}</p>`).join('')}</section>
    </div>
    <div class="rc-pe"><span>Gestão de Preventivas · Vetore · chamados do portal SM</span><span>Página 1 de 1</span></div>
  </div>`;
}
