// Monta o conteúdo dos avisos (puro: sem rede). Usado pela função "avisos".
import { porCodigo, SETORES, MESES } from './dados.js';
import { montarItens, montarFolgas, somaDias } from './regras.js';

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const br = (iso) => iso.split('-').reverse().join('/');
const dia = (iso) => `${SEM[new Date(iso + 'T12:00:00Z').getUTCDay()]} ${br(iso).slice(0, 5)}`;
const util = (iso, folgas) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && !folgas[iso]; };
const maq = (c) => `${c} (${porCodigo[c]?.modelo || ''})`;
const feita = (st) => st === 'concluida' || st === 'ag_sup' || st === 'ag_ger';

export function montarAvisos({ hoje, agora = Date.now(), registros = [], reprog = {}, extras = {}, trabalha = [], acoes = [], teste = false }) {
  const folgas = montarFolgas(trabalha, extras);
  const regDaProg = (p) => registros.find((r) => r.prog === p && r.status !== 'rascunho') || null;
  const itens = montarItens({ hoje, reprog, folgas, regDaProg });
  let prox = somaDias(hoje, 1); while (!util(prox, folgas)) prox = somaDias(prox, 1);
  const segunda = new Date(hoje + 'T12:00:00Z').getUTCDay() === 1;
  const secoes = [];
  const hojeL = itens.filter((i) => i.data === hoje && !feita(i.st));
  if (hojeL.length) secoes.push({ titulo: `Hoje (${dia(hoje)})`, linhas: hojeL.map((i) => `${maq(i.codigo)} · ${SETORES[i.setor].curto}`) });
  const amanha = itens.filter((i) => i.data === prox && !feita(i.st));
  if (amanha.length) secoes.push({ titulo: `Próximo dia útil (${dia(prox)})`, linhas: amanha.map((i) => `${maq(i.codigo)} · ${SETORES[i.setor].curto}`) });
  const pend = itens.filter((i) => i.st === 'pendente');
  if (pend.length) secoes.push({ titulo: 'Passaram da data, ainda dentro do mês', cor: 'Warning', linhas: pend.map((i) => `${i.codigo} · era ${dia(i.data)} · o mês vai até ${br(i.janelaFim).slice(0, 5)}`) });
  const atr = itens.filter((i) => i.st === 'atrasada');
  if (atr.length) secoes.push({ titulo: 'ATRASADAS (o mês acabou sem a preventiva)', cor: 'Attention', linhas: atr.map((i) => `${i.codigo} · preventiva de ${MESES[+i.ciclo.slice(5) - 1]}/${i.ciclo.slice(0, 4)}`) });
  const ag = registros.filter((r) => (r.status === 'ag_sup' || r.status === 'ag_ger') && r.fim && agora - Date.parse(r.fim) > 24 * 3600e3);
  if (ag.length) secoes.push({ titulo: 'Esperando assinatura há mais de 24 h', cor: 'Warning', linhas: ag.map((r) => `${r.codigo} · ${r.status === 'ag_sup' ? 'falta o supervisor da área' : 'falta o gerente de manutenção'} · feita por ${r.manutentor?.nome || '—'}`) });
  const venc = acoes.filter((a) => a.status !== 'fechada' && a.prazo && a.prazo < hoje);
  if (venc.length) secoes.push({ titulo: 'Ações do plano de ação vencidas', cor: 'Attention', linhas: venc.map((a) => `${a.codigo} · ${a.acao || a.item || ''} · prazo ${br(a.prazo).slice(0, 5)} · ${a.responsavel || 'sem responsável'}`) });
  // lista semanal para o PCP (segunda-feira, ou no teste)
  let pcp = null;
  if (segunda || teste) {
    const ini = hoje, fim = somaDias(hoje, Math.max(0, 5 - new Date(hoje + 'T12:00:00Z').getUTCDay()));
    const sem = itens.filter((i) => i.data >= ini && i.data <= fim && !feita(i.st));
    pcp = { titulo: `Paradas programadas da semana (${br(ini).slice(0, 5)} a ${br(fim).slice(0, 5)})`, linhas: sem.map((i) => `${dia(i.data)} · ${maq(i.codigo)} · ${SETORES[i.setor].nome}`) };
    if (!sem.length) pcp.linhas = ['Nenhuma parada para preventiva nesta semana.'];
  }
  return { hoje, secoes, pcp, vazio: !secoes.length && !(segunda && pcp) };
}

export function cartaoTeams({ hoje, secoes, pcp }, url, teste) {
  const body = [
    { type: 'TextBlock', text: `${teste ? 'TESTE · ' : ''}Gestão de Preventivas · ${dia(hoje)}`, weight: 'Bolder', size: 'Large', wrap: true },
    { type: 'TextBlock', text: 'Vetore · Manutenção Injeção', isSubtle: true, spacing: 'None' },
  ];
  const sec = [...secoes, ...(pcp ? [pcp] : [])];
  if (!sec.length) body.push({ type: 'TextBlock', text: 'Nada pendente. Tudo em dia.', wrap: true });
  sec.forEach((s) => {
    body.push({ type: 'TextBlock', text: s.titulo, weight: 'Bolder', spacing: 'Medium', color: s.cor || 'Default', wrap: true });
    body.push({ type: 'TextBlock', text: s.linhas.map((l) => '- ' + l).join('\r'), wrap: true, spacing: 'Small' });
  });
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body,
    actions: [{ type: 'Action.OpenUrl', title: 'Abrir o sistema', url }] } }] };
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function emailHtml(titulo, secoes, url) {
  return `<div style="font-family:Arial,sans-serif;max-width:640px"><div style="background:#121417;color:#fff;padding:14px 18px;border-bottom:5px solid #ffc20e"><b style="font-size:18px">${esc(titulo)}</b><br><span style="color:#9aa3ad">Vetore · Manutenção Injeção</span></div>
  ${secoes.map((s) => `<h3 style="margin:18px 0 6px;color:${s.cor === 'Attention' ? '#c0392b' : s.cor === 'Warning' ? '#b7791f' : '#111'}">${esc(s.titulo)}</h3><ul style="margin:0;padding-left:20px">${s.linhas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')}
  <p style="margin-top:22px"><a href="${url}" style="background:#ffc20e;color:#111;padding:10px 16px;text-decoration:none;font-weight:bold;border-radius:4px">Abrir o sistema</a></p></div>`;
}

// Feed RSS lido pelo fluxo do Teams/Outlook (conector RSS "Quando um item do feed é publicado").
// Cada item = um e-mail: title = assunto, description = corpo HTML, category = destinatários (separados por ;)
const xml = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const cdata = (v) => '<![CDATA[' + String(v ?? '').replaceAll(']]>', ']]]]><![CDATA[>') + ']]>';
export function montarFeed(itens, url) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
    + `<title>Gestão de Preventivas · avisos</title><link>${xml(url)}</link><description>Avisos automáticos da Gestão de Preventivas (Vetore)</description>`
    + itens.map((i) => `<item><guid isPermaLink="false">${xml(i.id)}</guid><title>${xml(i.titulo)}</title><link>${xml(url)}</link>`
      + `<category>${xml(i.para)}</category><pubDate>${new Date(i.em).toUTCString()}</pubDate><description>${cdata(i.html)}</description></item>`).join('')
    + '</channel></rss>';
}
