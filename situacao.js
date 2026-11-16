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
import { MAQUINAS, diasUteis } from './dados.js';
import { montarFolgas, montarItens, sugerirDia as sugerirDiaR } from './regras.js';
import { registroDaProg, reprog, folgasExtra, trabalhaEm } from './store.js';
import { diaMes } from './ui.js';

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

// ---------- dias sem expediente e lista de preventivas (regras em regras.js) ----------
export const folgas = () => montarFolgas(trabalhaEm(), folgasExtra());
export const uteis = (ano, mes, f = folgas()) => diasUteis(ano, mes, f);
export const sugerirDia = (ciclo, alvo, ocupadas, f = folgas(), evitar = null) => sugerirDiaR(ciclo, alvo, ocupadas, f, hoje(), evitar);
export const itens = () => montarItens({ hoje: hoje(), reprog: reprog(), folgas: folgas(), regDaProg: registroDaProg });

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
