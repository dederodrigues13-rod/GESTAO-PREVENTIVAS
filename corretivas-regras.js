// =====================================================================
// Corretivas (portal SM): leitura do texto copiado da tela "Chamados",
// regra da máquina e classificação do assunto por sistema.
// Módulo puro (sem navegador e sem banco).
//
// Colunas da tela de Chamados, nesta ordem:
//   Prioridade · "Nº Assunto" · Status · Solicitante · Atendente ·
//   Última Modificação · Data de Abertura · Data Último Atendimento
// Regra da máquina (combinada com o Denis):
//   - Solicitante é uma máquina (VTIA 02, VTIP 06…) → a OM é dessa máquina.
//   - Solicitante é uma pessoa (Jaisson, responsável pelos fornos) → Fornos;
//     o forno sai do assunto: "Forno T03" → VTFT 03; "forno da máquina 08"
//     → forno de espera da célula 08; sem isso → Fornos (geral).
// =====================================================================

export const FORNOS_GERAL = 'FORNOS';
export const ehMaquina = (s) => /^VT[A-Z]{2} \d{2}$/.test(s);
const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "17/11/2026 07:31" -> ISO com o fuso de Brasília
export function dataSM(txt) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(txt || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00` : null;
}

// máquina a partir do solicitante (e do assunto, quando é dos fornos)
// celulaVTFE: { '08': 'VTFE 03', … } — mapa de qual forno de espera fica em cada célula
export function maquinaDe(solicitante, assunto, celulaVTFE = {}) {
  const sol = String(solicitante || '').trim().toUpperCase().replace(/^(VT[A-Z]{2})\s*-?\s*(\d{1,2})$/, (_, a, n) => `${a} ${n.padStart(2, '0')}`);
  if (ehMaquina(sol)) return { maquina: sol, origem: 'solicitante' };
  const a = normal(assunto);
  const torre = /\bforno\s*(?:torre\s*)?t\s*0?(\d)\b|\bt\s*0?([1-3])\b/.exec(a);
  if (torre) return { maquina: `VTFT 0${torre[1] || torre[2]}`, origem: 'assunto' };
  const cel = /forno\s+(?:de\s+espera\s+)?d[ao]\s+(?:maquina|maq\.?|celula)\s*0?(\d{1,2})/.exec(a);
  if (cel) {
    const c = cel[1].padStart(2, '0');
    return celulaVTFE[c] ? { maquina: celulaVTFE[c], origem: 'assunto' } : { maquina: FORNOS_GERAL, origem: 'assunto', celula: c };
  }
  return { maquina: FORNOS_GERAL, origem: 'pessoa' };
}

// sistema da máquina pelo assunto (para o Pareto e para cruzar com as seções do formulário)
const SISTEMAS = [
  ['Prensa', /prensa|rizzo|estampo|rebarb/],
  ['Robô / extrator', /robo|garra|extrator\b/],
  ['Jato / granalha', /\bjato\b|granalha/],
  ['Carregador', /carregad/],
  ['Forno / fusão / queimador', /forno|fusao|queimador|termopar|massalote|eletrodo|refratar/],
  ['Jet / speed cooling', /jet\s*cool|speed\s*cool/],
  ['Nitrogênio / acumulador', /nitrogen|acumulador|multiplic/],
  ['Thermo', /thermo|termoreg/],
  ['Óleo / vazamento', /oleo|vazament|mangueira|registro/],
  ['Polaris / desmoldante', /polaris|desmoldante/],
  ['Sensores / elétrica', /sensor|inversor|eletric|choque|celeron|micro\b|emergencia|alarme|painel/],
  ['Porta / gaveta / dispositivo', /porta|gaveta|dispositivo|trava/],
  ['Extração / molde', /extracao|molde|camara quente/],
  ['Periféricos (esteira, gravadora, tanque…)', /esteira|gravadora|dosador|secador|ventilador|resfriamento|tanque|tamque/],
];
export function sistemaDe(assunto) {
  const a = normal(assunto);
  for (const [nome, re] of SISTEMAS) if (re.test(a)) return nome;
  return 'Outros / máquina';
}

// lê o texto colado (ou mandado pelo botão de favorito): uma OM por linha, colunas separadas por TAB
export function lerChamados(texto, celulaVTFE = {}) {
  const out = [], vistos = new Set();
  String(texto || '').split(/\r?\n/).forEach((linha) => {
    const cel = linha.split('\t').map((c) => c.replace(/\s+/g, ' ').trim()).filter((c, i, arr) => c !== '' || (i > 0 && i < arr.length - 1));
    const iOs = cel.findIndex((c) => /^\d{4,7}\s+\S/.test(c) || /^\d{4,7}$/.test(c));
    if (iOs < 0) return;
    const m = /^(\d{4,7})\s*(.*)$/.exec(cel[iOs]);
    const os = +m[1]; if (vistos.has(os)) return; vistos.add(os);
    const resto = cel.slice(iOs + 1);
    // se o número veio sozinho numa coluna, o assunto é a coluna seguinte
    let assunto = m[2];
    if (!assunto && resto.length > 6) assunto = resto.shift();
    const [status = '', solicitante = '', atendente = '', ultMod = '', abertura = '', ultAtend = ''] = resto;
    const prioridade = (cel.slice(0, iOs).filter((c) => c && !/^\d+$/.test(c)).pop() || '').trim();
    const limpo = (v) => (v === '-' ? '' : v);
    const mq = maquinaDe(solicitante, assunto, celulaVTFE);
    out.push({
      os, prioridade: prioridade || null, assunto: assunto.trim(), status: status || null,
      solicitante: limpo(solicitante) || null, atendente: limpo(atendente) || null,
      ultima_mod: dataSM(limpo(ultMod)), abertura: dataSM(limpo(abertura)), ultimo_atend: dataSM(limpo(ultAtend)),
      maquina: mq.maquina, maquina_origem: mq.origem, celula: mq.celula || null, sistema: sistemaDe(assunto),
    });
  });
  return out;
}

// horas de máquina parada / reparo: da abertura ao último atendimento (fechada) ou até agora (aberta)
export const fechado = (c) => /fechad|conclu|resolvid/i.test(c.status || '');
export function horasParada(c, agora = Date.now()) {
  if (!c.abertura) return 0;
  const fim = fechado(c) ? (c.ultimo_atend || c.ultima_mod) : null;
  const ms = (fim ? Date.parse(fim) : agora) - Date.parse(c.abertura);
  return Math.max(0, ms / 3600e3);
}
