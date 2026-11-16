// =====================================================================
// Planta do galpão (desenhada a partir do croqui)
//
// A fábrica é organizada em células numeradas: cada célula junta a VTIA,
// a Polaris (quando existe), a VTPR e a VTTE do mesmo número.
// Para mudar a posição de uma célula, troque o número de lugar na grade.
// null = espaço vazio. Entre as linhas da grade ficam os corredores.
// =====================================================================
import { esc, ordemNatural } from './ui.js';

export const PLANTA = [
  [null, '02', null, null],
  ['03', '04', '13', null],
  ['05', '06', '10', '11'],
  ['07', '08', '09', '12'],
];

// Corredor desenhado depois destas linhas (índice da linha na grade)
export const CORREDOR_APOS = [1, 2, 3];

// Ordem das máquinas dentro de cada célula (igual ao croqui)
const ORDEM = ['VTIA', 'Polaris', 'VTPR', 'VTTE'];

const numeroDe = (nome) => (String(nome).match(/(\d+)\s*$/) || [])[1]?.padStart(2, '0');
const familiaDe = (m) => m.familia || String(m.nome).split(/\s+/)[0];

// Agrupa as máquinas por célula: { '05': [m, m, m], ... } e devolve as que ficaram de fora
export function agruparPorCelula(maqs) {
  const celulas = {}, fora = [];
  const noMapa = new Set(PLANTA.flat().filter(Boolean));
  maqs.forEach((m) => {
    const n = numeroDe(m.nome);
    if (n && noMapa.has(n)) (celulas[n] ??= []).push(m);
    else fora.push(m);
  });
  Object.values(celulas).forEach((l) => l.sort((a, b) => ORDEM.indexOf(familiaDe(a)) - ORDEM.indexOf(familiaDe(b)) || ordemNatural(a.nome, b.nome)));
  return { celulas, fora };
}

// Monta o HTML da planta. tile(m) devolve o HTML de cada máquina.
export function htmlPlanta(maqs, tile, { classe = '' } = {}) {
  const { celulas, fora } = agruparPorCelula(maqs);
  const colunas = Math.max(...PLANTA.map((l) => l.length));
  let html = `<div class="planta ${classe}" style="--cols:${colunas}">`;
  PLANTA.forEach((linha, i) => {
    html += `<div class="planta-linha">${linha.map((n) => n
      ? `<section class="celula" aria-label="Célula ${n}"><h4>Célula ${n}</h4><div class="celula-maqs">${(celulas[n] || []).map(tile).join('') || '<span class="muted small">sem máquinas</span>'}</div></section>`
      : '<div class="celula-vazia"></div>').join('')}</div>`;
    if (CORREDOR_APOS.includes(i)) html += '<div class="corredor"><span>corredor</span></div>';
  });
  html += '</div>';
  if (fora.length) html += `<div class="planta-fora"><h4>Fora do mapa</h4><div class="celula-maqs">${fora.map(tile).join('')}</div></div>`;
  return html;
}

export const rotuloCurto = (nome) => esc(String(nome).replace(/^Polaris\s*/i, 'POL '));
