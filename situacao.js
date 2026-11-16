// =====================================================================
// Situação de cada preventiva programada e de cada máquina
//
// Preventiva:  concluída (3 assinaturas) · aguardando supervisor · aguardando
//   gerente · atrasada (o mês acabou e não foi feita) · pendente (passou da
//   data, mas o mês ainda não acabou) · hoje · próximos 7 dias · programada
// Máquina (cor no 3D):  vermelho = atrasada · azul = aguardando assinatura
//   amarelo = preventiva neste mês ou em até 15 dias · verde = em dia
//
// Feriados: se um dia vira "sem expediente" (tela Feriados), só as preventivas
// daquele dia mudam: o sistema sugere o dia útil livre mais próximo do mesmo
// mês, sem bater com outra máquina. A gestão pode trocar quando quiser.
// =====================================================================
import { CRONOGRAMA, MAQUINAS, FERIADOS_NACIONAIS, diasUteis } from './dados.js';
import { registroDaProg, reprog, folgasExtra, trabalhaEm } from './store.js';
import { diasEntre, diaMes } from './ui.js';

export const ST = {
  concluida: { nome: 'Concluída', cor: '#4cc38a' },
  ag_sup: { nome: 'Aguardando supervisor', cor: '#5aa2ff' },
  ag_ger: { nome: 'Aguardando gerente', cor: '#a98bff' },
  atrasada: { nome: 'Atrasada', cor: '#ff5a36' },
  pendente: { nome: 'Passou da data · ainda no mês', cor: '#f0a93b' },
  hoje: { nome: 'Hoje', cor: '#ffc20e' },
  semana: { nome: 'Próximos 7 dias', cor: '#ffc20e' },
  programada: { nome: 'Programada', cor: '#8a939d' },
};
export const ST3D = { bx: 'Atrasada', ag: 'Aguardando assinaturas', at: 'Preventiva próxima', ok: 'Em dia' };
export const COR3D = { bx: '#ff5a36', ag: '#5aa2ff', at: '#f0a93b', ok: '#4cc38a', na: '#7b848e' };
export const aguardando = (st) => st === 'ag_sup' || st === 'ag_ger';

// data de referência (o protótipo deixa simular outro dia)
let refHoje = null;
export const definirHoje = (iso) => { refHoje = iso || null; };
const pad = (n) => String(n).padStart(2, '0');
export const hoje = () => refHoje || (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

// ---------- dias sem expediente ----------
export function folgas() {
  const t = new Set(trabalhaEm()), out = {};
  Object.entries(FERIADOS_NACIONAIS).forEach(([d, n]) => { if (!t.has(d)) out[d] = n; });
  return Object.assign(out, folgasExtra());
}
export const uteis = (ano, mes, f = folgas()) => diasUteis(ano, mes, f);
const uteisCiclo = (ciclo, f) => uteis(+ciclo.slice(0, 4), +ciclo.slice(5), f);

// dia útil livre mais próximo de "alvo" no mês (de hoje em diante quando der);
// os 2 últimos dias úteis só entram se não houver outro
export function sugerirDia(ciclo, alvo, ocupadas, f = folgas(), evitar = null) {
  const lista = uteisCiclo(ciclo, f), h = hoje();
  const livres = lista.filter((d) => !ocupadas.has(d) && d !== evitar);
  const pref = livres.filter((d) => d >= h && lista.indexOf(d) < lista.length - 2);
  const base = pref.length ? pref : livres.filter((d) => d >= h).length ? livres.filter((d) => d >= h) : livres;
  if (!base.length) return lista.find((d) => d !== evitar) || alvo;
  return base.slice().sort((a, b) => Math.abs(diasEntre(alvo, a)) - Math.abs(diasEntre(alvo, b)) || b.localeCompare(a))[0];
}

export function itens() {
  const h = hoje(), rp = reprog(), f = folgas();
  // 1) data que vale: reprogramada pela gestão ou a do cronograma
  const lista = CRONOGRAMA.map((p) => ({ ...p, data: rp[p.id] || p.data, sugerida: p.data, reprogramada: !!rp[p.id], motivo: null }));
  // 2) quem caiu em dia sem expediente ganha uma data sugerida (só essas mudam)
  const porMes = {};
  lista.forEach((i) => (porMes[i.ciclo] ??= []).push(i));
  Object.values(porMes).forEach((doMes) => {
    const ocup = new Set(doMes.filter((i) => !f[i.data]).map((i) => i.data));
    doMes.filter((i) => f[i.data]).forEach((i) => {
      i.motivo = f[i.data]; i.dataOriginal = i.data;
      i.data = sugerirDia(i.ciclo, i.data, ocup, f); i.autoRemarcada = true; ocup.add(i.data);
    });
  });
  // 3) situação
  return lista.map((p) => {
    const reg = registroDaProg(p.id);
    let st;
    if (reg?.status === 'concluida') st = 'concluida';
    else if (reg?.status === 'ag_sup' || reg?.status === 'ag_ger') st = reg.status;
    else if (h > p.janelaFim) st = 'atrasada';
    else if (h > p.data) st = 'pendente';
    else if (h === p.data) st = 'hoje';
    else if (diasEntre(h, p.data) <= 7) st = 'semana';
    else st = 'programada';
    return { ...p, reg, st, dias: diasEntre(h, p.data) };
  }).sort((a, b) => a.data.localeCompare(b.data) || a.codigo.localeCompare(b.codigo));
}

// visão por máquina: próxima em aberto, última feita, cor do 3D e texto da etiqueta
export function porMaquina(lista = itens()) {
  const h = hoje(), out = {};
  MAQUINAS.forEach((m) => {
    const minhas = lista.filter((i) => i.codigo === m.codigo);
    const abertas = minhas.filter((i) => i.st !== 'concluida' && !aguardando(i.st));
    const atrasada = abertas.find((i) => i.st === 'atrasada');
    const ag = minhas.find((i) => aguardando(i.st));
    const proxima = abertas.find((i) => i.st !== 'atrasada') || null;
    const ultima = minhas.filter((i) => i.st === 'concluida').at(-1) || null;
    let st3d, rotulo;
    if (atrasada) { st3d = 'bx'; rotulo = 'ATRASADA'; }
    else if (ag) { st3d = 'ag'; rotulo = 'ASSINAR'; }
    else if (proxima && (proxima.ciclo === h.slice(0, 7) || proxima.dias <= 15)) { st3d = 'at'; rotulo = proxima.dias === 0 ? 'HOJE' : diaMes(proxima.data); }
    else { st3d = 'ok'; rotulo = proxima ? diaMes(proxima.data) : 'OK'; }
    // o formulário (QR) é ligado à atrasada mais antiga ou à próxima
    out[m.codigo] = { maquina: m, atrasada, aguardando: ag, proxima, ultima, atual: atrasada || proxima || null, st3d, rotulo, nome: m.codigo };
  });
  return out;
}
