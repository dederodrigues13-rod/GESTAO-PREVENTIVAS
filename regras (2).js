// =====================================================================
// Regras do cronograma — módulo puro (sem navegador e sem banco)
//
// Usado pelo sistema (situacao.js) e pela função de avisos automáticos do
// Supabase (supabase/functions/avisos). Assim os dois enxergam as mesmas
// datas: cronograma base + remarcações + dias sem expediente.
// =====================================================================
import { CRONOGRAMA, FERIADOS_NACIONAIS, diasUteis } from './dados.js';

const pad = (n) => String(n).padStart(2, '0');
const paraData = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
export const diasEntre = (a, b) => Math.round((paraData(b) - paraData(a)) / 86400000);
export const hojeEm = (fuso = 'America/Sao_Paulo') => new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const somaDias = (iso, n) => { const d = paraData(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// dias sem expediente = feriados nacionais (menos os que a fábrica trabalha) + acrescentados
export function montarFolgas(trabalha = [], extras = {}) {
  const t = new Set(trabalha), out = {};
  Object.entries(FERIADOS_NACIONAIS).forEach(([d, n]) => { if (!t.has(d)) out[d] = n; });
  return Object.assign(out, extras);
}
export const uteisCiclo = (ciclo, folgas) => diasUteis(+ciclo.slice(0, 4), +ciclo.slice(5), folgas);

// dia útil livre mais próximo de "alvo" no mês (de hoje em diante quando der);
// os 2 últimos dias úteis só entram se não houver outro
export function sugerirDia(ciclo, alvo, ocupadas, folgas, hoje, evitar = null) {
  const lista = uteisCiclo(ciclo, folgas);
  const livres = lista.filter((d) => !ocupadas.has(d) && d !== evitar);
  const pref = livres.filter((d) => d >= hoje && lista.indexOf(d) < lista.length - 2);
  const base = pref.length ? pref : livres.filter((d) => d >= hoje).length ? livres.filter((d) => d >= hoje) : livres;
  if (!base.length) return lista.find((d) => d !== evitar) || alvo;
  return base.slice().sort((a, b) => Math.abs(diasEntre(alvo, a)) - Math.abs(diasEntre(alvo, b)) || b.localeCompare(a))[0];
}

// Lista de preventivas com a data que vale e a situação.
// regDaProg(progId) -> { status, ... } do relatório enviado (ou null)
export function montarItens({ hoje, reprog = {}, folgas, regDaProg = () => null }) {
  const lista = CRONOGRAMA.map((p) => ({ ...p, data: reprog[p.id] || p.data, sugerida: p.data, reprogramada: !!reprog[p.id], motivo: null }));
  const porMes = {};
  lista.forEach((i) => (porMes[i.ciclo] ??= []).push(i));
  Object.values(porMes).forEach((doMes) => {
    const ocup = new Set(doMes.filter((i) => !folgas[i.data]).map((i) => i.data));
    doMes.filter((i) => folgas[i.data]).forEach((i) => {
      i.motivo = folgas[i.data]; i.dataOriginal = i.data;
      i.data = sugerirDia(i.ciclo, i.data, ocup, folgas, hoje); i.autoRemarcada = true; ocup.add(i.data);
    });
  });
  return lista.map((p) => {
    const reg = regDaProg(p.id);
    let st;
    if (reg?.status === 'concluida') st = 'concluida';
    else if (reg?.status === 'ag_sup' || reg?.status === 'ag_ger') st = reg.status;
    else if (hoje > p.janelaFim) st = 'atrasada';
    else if (hoje > p.data) st = 'pendente';
    else if (hoje === p.data) st = 'hoje';
    else if (diasEntre(hoje, p.data) <= 7) st = 'semana';
    else st = 'programada';
    return { ...p, reg, st, dias: diasEntre(hoje, p.data) };
  }).sort((a, b) => a.data.localeCompare(b.data) || a.codigo.localeCompare(b.codigo));
}
