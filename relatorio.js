// =====================================================================
// Relatório FR.06.08.002-A em 2 folhas A4, igual ao papel
//
// A mesma folha aparece na tela, sai no PDF (para a pasta das preventivas)
// e na impressão. Todas as seções do papel são impressas; as que não fazem
// parte da máquina ficam em branco, como no formulário preenchido à mão.
// Nome do arquivo: "VTIA 07 - 2026-12-02 - Preventiva.pdf" (ordena por
// máquina e data dentro da pasta).
// =====================================================================
import { SECOES, ORDEM_PAPEL } from './dados.js';
import { esc } from './ui.js';

const pad = (n) => String(n).padStart(2, '0');
const partes = (ts) => { const d = new Date(ts); return { d: pad(d.getDate()), m: pad(d.getMonth() + 1), a: String(d.getFullYear()).slice(2), h: pad(d.getHours()), mi: pad(d.getMinutes()), iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }; };
const X = '<svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#111" stroke-width="1.5" stroke-linecap="round"/></svg>';
const cb = (on) => `<span class="cb">${on ? X : ''}</span>`;
const caixas = (...v) => v.map((x) => `<span class="cx">${esc(x)}</span>`).join('');
export const ASSINANTES = [['manutentor', 'MANUTENTOR'], ['supervisor', 'SUPERVISOR DA ÁREA'], ['gerente', 'GERENTE DE MANUTENÇÃO']];

export const nomeArquivo = (r) => `${r.codigo} - ${partes(r.inicio).iso} - Preventiva.pdf`;

function secao(k, r) {
  const s = SECOES[k], usada = r.secoes.includes(k);
  return `<section class="fr-sec"><div class="fr-sec-t"><span>${s.papel}</span><i>OK</i><i>NOK</i><i>N.A</i></div>
    ${s.itens.map((t, i) => { const v = usada ? (r.respostas[`${k}.${i}`]?.v || '') : ''; return `<div class="fr-it"><span><em>${i + 1}</em>${esc(t)}</span>${cb(v === 'ok')}${cb(v === 'nok')}${cb(v === 'na')}</div>`; }).join('')}
  </section>`;
}

export function folhasA4(r, m) {
  const ini = partes(r.inicio), fim = r.fim ? partes(r.fim) : null;
  const min = r.fim ? Math.max(0, Math.round((r.fim - r.inicio) / 60000)) : null;
  const cab = `<header class="fr-cab"><div class="fr-logo"><img src="logo-vetore.png" alt="Vetore" /></div><div class="fr-tit">RELATÓRIO DE MANUTENÇÃO PREVENTIVA</div>
    <table class="fr-rev"><tr><th>REV</th><th>FR. 06.08.002 - A</th></tr><tr><td>5</td><td>16/09/2025</td></tr></table></header>`;
  const rod = (n) => `<footer class="fr-rod">Gestão de Preventivas · ${esc(r.codigo)} · preventiva de ${r.ciclo.slice(5)}/${r.ciclo.slice(0, 4)}${r.dataPrevista ? ` (programada ${r.dataPrevista.split('-').reverse().join('/')})` : ''}${r.antecipada ? ' · antecipada' : ''} · reg. ${esc(r.id)} · página ${n}/2</footer>`;
  const plano = r.plano.map((p) => ({ item: p.key ? `${SECOES[p.key.split('.')[0]].titulo.split(' · ')[0]} ${+p.key.split('.')[1] + 1}` : p.item, acao: p.acao, resp: p.resp, data: p.prazo ? p.prazo.split('-').reverse().join('/') : '' }));
  while (plano.length < 8) plano.push({ item: '', acao: '', resp: '', data: '' });
  const achados = Object.entries(r.respostas).filter(([k, v]) => v.v === 'nok' && v.obs && r.secoes.includes(k.split('.')[0]))
    .map(([k, v]) => `${SECOES[k.split('.')[0]].titulo.split(' · ')[0]} ${+k.split('.')[1] + 1}: ${v.obs}`);
  const obs = ['LIMPEZA DO TANQUE DE ÓLEO DEVE SER REALIZADA ANUALMENTE', ...achados, ...(r.obs ? r.obs.split('\n') : [])];
  while (obs.length < 4) obs.push('');
  const pag1 = ORDEM_PAPEL.slice(0, 4), pag2 = ORDEM_PAPEL.slice(4);
  return `
  <div class="a4"><div class="a4-in">${cab}
    <div class="fr-dados"><b class="fr-h">DADOS</b>
      <div class="fr-lin"><span class="fr-r">CÓDIGO VETORE</span><span class="fr-box">${esc(r.codigo)}</span><span class="fr-r fr-r2">DATA</span>${caixas(ini.d, ini.m, ini.a)}</div>
      <div class="fr-lin"><span class="fr-r">MODELO MÁQUINA</span><span class="fr-box">${esc(m?.modelo || '')}</span><span class="fr-r fr-r2">HORA</span>${caixas(ini.h)}<b class="dp">:</b>${caixas(ini.mi)}</div>
    </div>
    ${pag1.map((k) => secao(k, r)).join('')}
  </div>${rod(1)}</div>
  <div class="a4"><div class="a4-in">
    ${pag2.map((k) => secao(k, r)).join('')}
    <section class="fr-plano"><b class="fr-h">PLANO DE AÇÃO</b><table><thead><tr><th>ITEM</th><th>AÇÃO</th><th>RESPONSÁVEL</th><th>DATA</th></tr></thead>
      <tbody>${plano.map((p) => `<tr><td>${esc(p.item)}</td><td>${esc(p.acao)}</td><td>${esc(p.resp)}</td><td>${esc(p.data)}</td></tr>`).join('')}</tbody></table></section>
    <section class="fr-obs"><b class="fr-h">OBSERVAÇÕES</b>${obs.map((l) => `<p>${esc(l)}</p>`).join('')}</section>
    <section class="fr-fech"><b class="fr-h">FECHAMENTO</b>
      <div class="fr-lin"><span class="fr-r">DATA</span>${fim ? caixas(fim.d, fim.m, fim.a) : caixas('', '', '')}<span class="fr-r fr-r2">HORA</span>${fim ? caixas(fim.h) : caixas('')}<b class="dp">:</b>${fim ? caixas(fim.mi) : caixas('')}
        <span class="fr-r fr-r2">TEMPO TOTAL GASTO</span>${min != null ? caixas(pad(Math.floor(min / 60))) : caixas('')}<b class="dp">:</b>${min != null ? caixas(pad(min % 60)) : caixas('')}</div>
      <div class="fr-ass">${ASSINANTES.map(([k, rot]) => { const a = r[k]; return `<figure>${a ? `<img src="${a.ass}" alt="Assinatura" />` : '<div class="fr-ass-v"></div>'}<figcaption><b>${rot}</b>${a ? `${esc(a.nome)} · ${partes(a.em).d}/${partes(a.em).m}/${partes(a.em).a} ${partes(a.em).h}:${partes(a.em).mi}` : '&nbsp;'}</figcaption></figure>`; }).join('')}</div>
    </section>
  </div>${rod(2)}</div>`;
}

// ---------- PDF ----------
const carregar = (src, global) => window[global] ? Promise.resolve(window[global]) : new Promise((ok, erro) => {
  const s = document.createElement('script'); s.src = src; s.onload = () => ok(window[global]); s.onerror = () => erro(new Error('não carregou ' + src)); document.head.append(s);
});
export async function gerarPDF(r, m) {
  const [h2c, jspdf] = await Promise.all([
    carregar('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas'),
    carregar('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf'),
  ]);
  const box = document.createElement('div'); box.className = 'a4-render'; box.innerHTML = folhasA4(r, m); document.body.append(box);
  try {
    await Promise.all([...box.querySelectorAll('img')].map((i) => i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; })));
    try { await document.fonts?.ready; } catch { /* segue */ }
    const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const folhas = [...box.querySelectorAll('.a4')];
    for (let i = 0; i < folhas.length; i++) {
      const c = await h2c(folhas[i], { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i) doc.addPage();
      doc.addImage(c.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 210, 297);
    }
    doc.setProperties({ title: `${r.codigo} · Relatório de manutenção preventiva`, subject: 'FR.06.08.002-A', creator: 'Gestão de Preventivas · Vetore' });
    return doc.output('blob');
  } finally { box.remove(); }
}

// salva o arquivo: no protótipo pelo Claude (pede confirmação); no sistema publicado, download normal
export async function salvarArquivo(nome, blob) {
  const cl = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (cl) { await cl.save({ filename: nome, data: blob }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
