// =====================================================================
// Cadastro das máquinas, perguntas do formulário e cronograma
//
// Base: FR.06.08.068 (Cronograma de Manutenção Preventiva, rev. 5) e
//       FR.06.08.002-A (Relatório de Manutenção Preventiva, rev. 5).
// Periodicidade: a cada 3 meses. Cada máquina tem uma "janela" de meses:
//   A = jan/abr/jul/out · B = fev/mai/ago/nov · C = mar/jun/set/dez
// Dentro do mês a preventiva pode ser feita em qualquer dia útil; o sistema
// sugere uma data, espalhando as máquinas para não parar tudo no mesmo dia.
// =====================================================================

export const SETORES = {
  al: { nome: 'Injeção de alumínio', curto: 'Alumínio', cod: 'FR.06.08.068-A' },
  pps: { nome: 'Injeção PPS (plástico)', curto: 'PPS', cod: 'FR.06.08.068-C' },
  fornos: { nome: 'Fornos', curto: 'Fornos', cod: 'FR.06.08.068-B' },
};

// [código, setor, equipamento, modelo, janela, célula/obs]
const LISTA = [
  ['VTIA 02', 'al', 'Injetora de alumínio', 'LK 400 t', 'A', '02'],
  ['VTIA 03', 'al', 'Injetora de alumínio', 'LK 800 t', 'A', '03'],
  ['VTIA 04', 'al', 'Injetora de alumínio', 'LK 800 t', 'B', '04'],
  ['VTIA 05', 'al', 'Injetora de alumínio', 'LK 800 t', 'B', '05'],
  ['VTIA 06', 'al', 'Injetora de alumínio', 'LK 800 t', 'B', '06'],
  ['VTIA 07', 'al', 'Injetora de alumínio', 'LK DCC 2000 t', 'C', '07'],
  ['VTIA 08', 'al', 'Injetora de alumínio', 'Haitian 2000 t', 'C', '08'],
  ['VTIA 09', 'al', 'Injetora de alumínio', 'Haitian 2000 t', 'C', '09'],
  ['VTIA 10', 'al', 'Injetora de alumínio', 'Haitian 850 t', 'C', '10'],
  ['VTIA 11', 'al', 'Injetora de alumínio', 'Haitian 850 t', 'A', '11'],
  ['VTIA 12', 'al', 'Injetora de alumínio', 'Haitian 2000 t', 'C', '12'],
  ['VTIA 13', 'al', 'Injetora de alumínio', 'LK DCC 400 t', 'A', '13'],
  ['VTIP 01', 'pps', 'Injetora de plástico', 'ROMI Prática 80', 'A'],
  ['VTIP 02', 'pps', 'Injetora de plástico', 'ROMI Prática 80', 'A'],
  ['VTIP 03', 'pps', 'Injetora de plástico', 'Eurostec', 'B'],
  ['VTIP 04', 'pps', 'Injetora de plástico', 'Haitian 750', 'B'],
  ['VTIP 05', 'pps', 'Injetora de plástico', 'Haitian 750', 'C'],
  ['VTIP 06', 'pps', 'Injetora de plástico', 'Haitian 750', 'C'],
  ['VTIP 07', 'pps', 'Injetora de plástico', 'Haitian 750', 'C'],
  ['VTFT 01', 'fornos', 'Forno torre de fusão', 'FSAGN 900 kg', 'A'],
  ['VTFT 02', 'fornos', 'Forno torre de fusão', 'FSSB 6 t', 'B'],
  ['VTFT 03', 'fornos', 'Forno torre de fusão', 'modelo a confirmar', 'B'], // incluído em 16/11/2026 (fora do FR.06.08.068 rev. 5)
  ['VTFE 01', 'fornos', 'Forno de espera', 'Stotherm 800', 'A'],
  ['VTFE 02', 'fornos', 'Forno de espera', 'Stotherm 800', 'B'],
  ['VTFE 03', 'fornos', 'Forno de espera', 'Stotherm 800', 'C'],
  ['VTFE 04', 'fornos', 'Forno de espera', 'Stotherm 800', 'C'],
  ['VTFE 05', 'fornos', 'Forno de espera', 'Stotherm 800', 'C'],
  ['VTFE 06', 'fornos', 'Forno de espera', 'Stotherm 800', 'C'],
  ['VTFE 07', 'fornos', 'Forno de espera', 'Dosador KM 1700', 'B'],
  ['VTFE 08', 'fornos', 'Forno de espera', 'Dosador KM 1700', 'A'],
  ['VTFE 09', 'fornos', 'Forno de espera', 'Dosador KM 1700', 'B'],
  ['VTFE 10', 'fornos', 'Forno de espera', 'Stotherm 800', 'A'],
];


export const slug = (cod) => cod.toLowerCase().replace(/\s+/g, '-'); // "VTIA 07" -> "vtia-07"

export const MAQUINAS = LISTA.map(([codigo, setor, equipamento, modelo, janela, celula]) => ({
  codigo, setor, equipamento, modelo, janela, celula: celula || null, slug: slug(codigo),
  tipo: codigo.slice(0, 4),
}));
export const porCodigo = Object.fromEntries(MAQUINAS.map((m) => [m.codigo, m]));
export const porSlug = Object.fromEntries(MAQUINAS.map((m) => [m.slug, m]));

export const JANELAS = { A: [1, 4, 7, 10], B: [2, 5, 8, 11], C: [3, 6, 9, 12] };
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ---------- formulário FR.06.08.002-A (perguntas iguais ao papel) ----------
// CONTROLE DE REVISÃO: cada revisão do formulário fica guardada em FORMULARIOS.
// Para mudar perguntas: copie a revisão atual para um número novo (ex.: 6), altere
// e troque REV_ATUAL. Os relatórios já feitos continuam com as perguntas da revisão
// em que foram preenchidos (o número da revisão vai no registro e no PDF).
const BOT = 'Verificar o funcionamento dos Botões de Emergência (funcionamento/quebrado)';
const CHA = 'Verificar o funcionamento das chaves de segurança (funcionamento/quebrado)';
const GER = 'Verificar o funcionamento da chave geral da máquina';
const PAI = 'Verificar condições Painel Elétrico (painel amassado, quebrado, funcionamento da fechadura)';
const SECOES_REV5 = {
  forno: { titulo: 'Sistema forno', papel: 'SISTEMA FORNO', itens: [BOT, CHA, GER,
    'Verificar o funcionamento IHM, tela de operação da injetora', PAI,
    'Verificar funcionamento do ar condicionado e ventiladores do painel elétrico',
    'Avaliar a limpeza ou necessidade de troca dos filtros do painel elétrico',
    'Verificar se o painel elétrico está super aquecendo (utilizar câmera térmica para realizar a atividade)',
    'Verificar as condições do painel de comando (painel do operador)', 'Verificar sensores de segurança das portas'] },
  injetora: { titulo: 'Injetora · sistema mecânico, hidráulico e pneumático', papel: '<b>INJETORA</b> - Sistema Mecânico, Hidráulico e Pneumático', itens: [
    'Limpeza do filtro de óleo hidráulico', 'Verificação do paralelismo das placas', 'Lubrificação de tesouras e guias',
    'Verificar vazamento do conjunto de extração', 'Verificar vazamento de óleo do conjunto de injeção',
    'Remoção do óleo das garrafas de nitrogênio', 'Verificar aperto das porcas e colunas', 'Verificar alinhamento do conjunto de injeção',
    'Verificar pressão nos manômetros', 'Realizado limpeza do tanque (anualmente)', 'Verificação de ruídos e vibração nas bombas'] },
  espera: { titulo: 'Forno de espera', papel: 'FORNO DE ESPERA', itens: ['Verificar funcionamento elétrico', 'Verificar integridade das resistências',
    'Verificar integridade do refratário', BOT, CHA, GER, PAI] },
  hidraulico: { titulo: 'Sistema hidráulico', papel: 'SISTEMA HIDRÁULICO', itens: ['Verificar a pressão dos manômetros (analisar se está dentro do especificado)',
    'Verificar condições das mangueiras hidráulicas', 'Verificar vazamentos de óleo hidráulico'] },
  prensa: { titulo: 'Prensa hidráulica', papel: 'PRENSA HIDRÁULICA', itens: [BOT, CHA, GER, PAI, 'Verificar as condições do painel de comando (painel do operador)',
    'Verificar sensores de segurança das portas', 'Limpeza do filtro de óleo hidráulico', 'Verificar vazamento de óleo do conjunto'] },
  robo: { titulo: 'Robô', papel: 'ROBÔ', itens: [BOT, CHA, GER, PAI, 'Verificar as condições do painel de comando (TP e painel geral)',
    'Verificar sensores de segurança da porta', 'Lubrificação dos eixos do robô', 'Verificar que está isento de vazamento de ar',
    'Verificar que está isento de vazamento de desmoldante (realizar verificação 1 vez por mês)',
    'Verificar bloco de válvulas o funcionamento correto (realizar verificação 1 vez por mês)'] },
  termo: { titulo: 'Thermocontrolador', papel: 'THERMOCONTROLADOR', itens: [BOT, 'Verificar condições das mangueiras', 'Verificar o funcionamento do motor', 'Trocar filtro do thermocontrolador'] },
};
// Ordem das seções no papel. O ROBÔ continua impresso no relatório, mas não é
// preenchido aqui: a preventiva dos robôs fica no Gestão de Fluidos (ABB).
export const FORMULARIOS = {
  5: { rev: 5, data: '16/09/2025', codigo: 'FR. 06.08.002 - A', secoes: SECOES_REV5, ordem: ['forno', 'injetora', 'espera', 'hidraulico', 'prensa', 'robo', 'termo'] },
};
export const REV_ATUAL = 5;
export const formulario = (rev) => FORMULARIOS[rev] || FORMULARIOS[REV_ATUAL];
// seções que podem ser preenchidas (o robô fica só no papel)
export const secoesPreenchiveis = (rev) => formulario(rev).ordem.filter((k) => k !== 'robo');
export const nomeSecao = (rev, k) => formulario(rev).secoes[k].titulo.split(' · ')[0];
// compatibilidade
export const SECOES = FORMULARIOS[REV_ATUAL].secoes;
export const ORDEM_PAPEL = FORMULARIOS[REV_ATUAL].ordem;
export const ORDEM_SECOES = secoesPreenchiveis(REV_ATUAL);

// Seções que já vêm abertas para cada tipo. As outras ficam no botão "Adicionar seção".
export function secoesPadrao(m) {
  if (m.tipo === 'VTIA') return ['injetora', 'prensa', 'termo'];
  if (m.tipo === 'VTIP') return ['injetora'];
  if (m.tipo === 'VTFT') return ['forno'];
  if (m.tipo === 'VTFE') return ['espera'];
  return ['injetora'];
}

// ---------- calendário ----------
// Só feriados NACIONAIS. Carnaval, Corpus Christi, feriados da cidade, emendas e
// férias coletivas se acrescentam na tela "Feriados" do sistema, sem mexer aqui.
export const FERIADOS_NACIONAIS = {
  '2026-12-25': 'Natal',
  '2027-01-01': 'Confraternização Universal', '2027-03-26': 'Sexta-feira Santa', '2027-04-21': 'Tiradentes',
  '2027-05-01': 'Dia do Trabalho', '2027-09-07': 'Independência', '2027-10-12': 'N. Sra. Aparecida',
  '2027-11-02': 'Finados', '2027-11-15': 'Proclamação da República', '2027-11-20': 'Consciência Negra', '2027-12-25': 'Natal',
};
const pad = (n) => String(n).padStart(2, '0');
export const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
// dias úteis do mês (seg a sex), tirando os dias sem expediente informados
export function diasUteis(ano, mes, folgas = FERIADOS_NACIONAIS) {
  const out = [], fim = new Date(ano, mes, 0).getDate();
  for (let d = 1; d <= fim; d++) {
    const s = iso(ano, mes, d), w = new Date(ano, mes - 1, d).getDay();
    if (w !== 0 && w !== 6 && !folgas[s]) out.push(s);
  }
  return out;
}

export const INICIO = { ano: 2026, mes: 12 };
export const FIM = { ano: 2027, mes: 12 };
export function mesesDoPeriodo() {
  const out = []; let a = INICIO.ano, m = INICIO.mes;
  while (a < FIM.ano || (a === FIM.ano && m <= FIM.mes)) { out.push({ ano: a, mes: m, ciclo: `${a}-${pad(m)}` }); m++; if (m > 12) { m = 1; a++; } }
  return out;
}

// Data sugerida: no máximo UMA máquina parada por dia. Pula o 1º dia útil do mês e deixa
// os 2 últimos de folga para reprogramar. Cada setor fica espalhado por igual no mês
// (alumínio, fornos e PPS se alternam), e a ordem é a mesma todo trimestre.
const ORDEM_SETOR = { al: 0, fornos: 1, pps: 2 };
export function montarCronograma() {
  const prog = [];
  mesesDoPeriodo().forEach(({ ano, mes, ciclo }) => {
    const uteis = diasUteis(ano, mes);
    const doMes = MAQUINAS.filter((m) => JANELAS[m.janela].includes(mes));
    const fila = [];
    Object.keys(SETORES).forEach((setor) => {
      const l = doMes.filter((m) => m.setor === setor);
      l.forEach((m, i) => fila.push({ m, pos: (i + .5) / l.length, o: ORDEM_SETOR[setor] }));
    });
    fila.sort((a, b) => a.pos - b.pos || a.o - b.o);
    const ini = 1, fim = uteis.length - 3, vao = fila.length > 1 ? (fim - ini) / (fila.length - 1) : 0;
    fila.forEach(({ m }, i) => {
      const idx = Math.round(ini + vao * i);
      prog.push({ id: `${m.slug}-${ciclo}`, codigo: m.codigo, setor: m.setor, ciclo, data: uteis[idx], janelaIni: uteis[0], janelaFim: uteis.at(-1) });
    });
  });
  return prog.sort((a, b) => a.data.localeCompare(b.data) || a.codigo.localeCompare(b.codigo));
}
export const CRONOGRAMA = montarCronograma();

// Forno de espera de cada célula (para os chamados "forno da máquina 08" do SM).
// Preencher quando o Denis mandar o mapa, ex.: { '08': 'VTFE 03', '10': 'VTFE 05' }
export const CELULA_VTFE = {};
