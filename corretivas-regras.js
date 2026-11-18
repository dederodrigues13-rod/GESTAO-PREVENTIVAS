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
export const SEM_MAQUINA = 'SEM';
// quem abre chamado pelos fornos (solicitante pessoa → Fornos); os outros nomes viram "sem máquina"
// até o assunto dizer qual é (ex.: "estampo máquina 13") ou alguém escolher à mão
export const SOLICITANTES_FORNOS = [/jaisson/];
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
  const daFornos = SOLICITANTES_FORNOS.some((re) => re.test(normal(solicitante)));
  if (!daFornos) {
    // outra pessoa (engenharia, produção…): tenta achar a máquina no assunto
    const vt = /\b(vt[a-z]{2})\s*-?\s*(\d{1,2})\b/.exec(a);
    if (vt) return { maquina: `${vt[1].toUpperCase()} ${vt[2].padStart(2, '0')}`, origem: 'assunto' };
    const mq = /\b(?:maquina|maq\.?)\s*0?(\d{1,2})\b/.exec(a);
    if (mq && +mq[1] >= 2 && +mq[1] <= 13 && !/forno/.test(a)) return { maquina: `VTIA ${mq[1].padStart(2, '0')}`, origem: 'assunto' };
    if (!/forno|fusao|queimador/.test(a)) return { maquina: SEM_MAQUINA, origem: 'pessoa' };
  }
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

// valores conhecidos do SM (servem para achar cada coluna pelo conteúdo, mesmo se vierem colunas a mais)
const PRI = /^(parada de linha|cr[ií]tico|normal|baixo|baixa|alto|alta|m[eé]dia|urgente)$/i;
const STS = /^(fechado|aberto|em atendimento|aguardando atendimento|aguardando retorno|atendimento pausado|lixeira|resolvido|cancelado|novo|reaberto)$/i;
const DT = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/;
// títulos das colunas (quando vierem): usados para solicitante, atendente e datas
const TITULOS = { prioridade: /priorid/, os: /identifica/, status: /^status/, tipo: /^tipo/, solicitante: /solicit/, atendente: /^atendente/,
  ultMod: /ultima modifica/, abertura: /abertura/, ultAtend: /ultimo atend/ };
function mapaTitulos(cel) {
  const n = cel.map(normal), m = {};
  Object.entries(TITULOS).forEach(([k, re]) => { const i = n.findIndex((x) => re.test(x.trim())); if (i >= 0) m[k] = i; });
  return m.os != null && m.solicitante != null ? m : null;
}
const lixo = (c) => /lixeira|exclu|cancel/i.test(c.status || '');

// uma linha da tabela -> chamado. Acha número/assunto, prioridade, status e datas pelo conteúdo;
// solicitante e atendente pelo título da coluna (se veio) ou logo depois do status.
function lerLinha(bruto, tit, celulaVTFE) {
  const cel = bruto.map((c) => String(c || '').replace(/\s+/g, ' ').trim());
  let iOs = cel.findIndex((c) => /^\d{4,7}\s+\S/.test(c) && !DT.test(c));
  let assunto;
  if (iOs >= 0) assunto = /^\d{4,7}\s+(.*)$/.exec(cel[iOs])[1];
  else { iOs = tit?.os != null && /^\d{4,7}$/.test(cel[tit.os]) ? tit.os : -1; if (iOs < 0) return null; assunto = cel[iOs + 1] || ''; }
  const os = +/^(\d{4,7})/.exec(cel[iOs])[1];
  const iPri = cel.findIndex((c) => PRI.test(c)), iSt = cel.findIndex((c, k) => k !== iOs && STS.test(c));
  const status = iSt >= 0 ? cel[iSt] : '';
  const limpo = (v) => (!v || v === '-' ? '' : v);
  const pega = (k) => (tit?.[k] != null ? cel[tit[k]] : undefined);
  // datas: pelo título, se bater; senão na ordem da tela (Última modificação, Abertura, Último atendimento)
  const datas = cel.filter((c) => DT.test(c));
  let ultMod = pega('ultMod'), abertura = pega('abertura'), ultAtend = pega('ultAtend');
  const okData = (v) => v === undefined || v === '' || v === '-' || DT.test(v);
  if (!(okData(ultMod) && okData(abertura) && okData(ultAtend)) || (abertura === undefined && datas.length)) {
    if (datas.length === 3) [ultMod, abertura, ultAtend] = datas;
    else if (datas.length === 2) [ultMod, abertura] = datas;
    else if (datas.length) { const ord = datas.slice().sort((a, b) => dataSM(a).localeCompare(dataSM(b))); abertura = ord[0]; ultMod = ord.at(-1); ultAtend = ord.length > 1 ? ord.at(-1) : ''; }
  }
  let solicitante = pega('solicitante'), atendente = pega('atendente');
  const estranho = (v) => v === undefined || PRI.test(v) || STS.test(v) || DT.test(v || '') || /^\d{4,7}/.test(v || '') || /sla/i.test(v || '');
  if (estranho(solicitante)) { solicitante = iSt >= 0 ? cel[iSt + 1] : ''; atendente = iSt >= 0 ? cel[iSt + 2] : ''; }
  if (/^manuten/i.test(solicitante || '') && iSt >= 0) { solicitante = cel[iSt + 2]; atendente = cel[iSt + 3]; }   // coluna "Tipo" no meio
  solicitante = limpo(solicitante); atendente = limpo(atendente);
  const mq = maquinaDe(solicitante, assunto, celulaVTFE);
  return {
    os, prioridade: iPri >= 0 ? cel[iPri] : null, assunto: assunto.trim(), status: status || null,
    solicitante: solicitante || null, atendente: atendente || null,
    ultima_mod: dataSM(limpo(ultMod)), abertura: dataSM(limpo(abertura)), ultimo_atend: dataSM(limpo(ultAtend)),
    maquina: mq.maquina, maquina_origem: mq.origem, celula: mq.celula || null, sistema: sistemaDe(assunto),
  };
}

// lê o texto colado (ou mandado pelo botão de favorito): uma OM por linha, colunas separadas por TAB.
export function lerChamados(texto, celulaVTFE = {}) {
  const out = [], vistos = new Set();
  let tit = null;
  String(texto || '').split(/\r?\n/).forEach((linha) => {
    const bruto = linha.split('\t');
    if (!bruto.some((c) => DT.test(c.trim()))) { const t = mapaTitulos(bruto); if (t) tit = t; return; }
    const c = lerLinha(bruto, tit, celulaVTFE);
    if (c && !vistos.has(c.os) && !lixo(c)) { vistos.add(c.os); out.push(c); }
  });
  return out;
}

// confere se a leitura faz sentido antes de gravar (evita gravar colunas trocadas)
export function conferirLeitura(lista) {
  if (!lista.length) return { ok: false, motivo: 'nenhum chamado encontrado' };
  const n = lista.length, comSt = lista.filter((c) => STS.test(c.status || '')).length, comAb = lista.filter((c) => c.abertura).length;
  const comSol = lista.filter((c) => c.solicitante && !PRI.test(c.solicitante) && !/sla/i.test(c.solicitante)).length;
  const ok = comSt / n >= 0.8 && comAb / n >= 0.8 && comSol / n >= 0.8;
  return { ok, motivo: ok ? '' : `status reconhecido em ${comSt} de ${n}, data de abertura em ${comAb}, solicitante em ${comSol}` };
}

// horas de máquina parada / reparo: da abertura ao último atendimento (fechada) ou até agora (aberta)
export const fechado = (c) => /fechad|conclu|resolvid/i.test(c.status || '');
export function horasParada(c, agora = Date.now()) {
  if (!c.abertura) return 0;
  const fim = fechado(c) ? (c.ultimo_atend || c.ultima_mod) : null;
  const ms = (fim ? Date.parse(fim) : agora) - Date.parse(c.abertura);
  return Math.max(0, ms / 3600e3);
}
