// =====================================================================
// Dados do sistema (Supabase)
//
// Tudo é carregado de uma vez ao entrar (são poucos registros por ano) e fica
// em memória; as telas leem daqui sem esperar. Cada mudança aparece na hora
// e é gravada no banco em seguida. O rascunho do formulário é gravado a cada
// resposta (com uma pequena espera) e também guardado no próprio celular,
// para não se perder se a internet cair no meio da preventiva.
// =====================================================================
let sb = null, msgErro = (e) => String(e?.message || e);
export function ligar(cliente, tradutor) { sb = cliente; if (tradutor) msgErro = tradutor; }

let mem = { registros: [], reprog: {}, folgas: {}, trabalha: [], acoes: [] };
const ouvintes = new Set();
export const aoMudar = (fn) => (ouvintes.add(fn), () => ouvintes.delete(fn));
const avisar = () => ouvintes.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
const erroOuvintes = new Set();
export const aoErro = (fn) => erroOuvintes.add(fn);
const erro = (e) => erroOuvintes.forEach((fn) => fn(msgErro(e)));

// ---------- registro <-> linha da tabela ----------
const paraLinha = (r) => ({
  id: r.id, prog: r.prog, codigo: r.codigo, ciclo: r.ciclo, data_prevista: r.dataPrevista || null, status: r.status,
  inicio: new Date(r.inicio).toISOString(), fim: r.fim ? new Date(r.fim).toISOString() : null,
  conteudo: { rev: r.rev || 5, secoes: r.secoes, respostas: r.respostas, plano: r.plano, obs: r.obs, antecipada: !!r.antecipada },
  manutentor: r.manutentor || null, supervisor: r.supervisor || null, gerente: r.gerente || null, pdf_path: r.pdf_path || null,
});
const deLinha = (l) => ({
  id: l.id, prog: l.prog, codigo: l.codigo, ciclo: l.ciclo, dataPrevista: l.data_prevista, status: l.status,
  inicio: Date.parse(l.inicio), fim: l.fim ? Date.parse(l.fim) : null,
  rev: l.conteudo?.rev || 5, selo: l.selo || null, secoes: l.conteudo?.secoes || [], respostas: l.conteudo?.respostas || {}, plano: l.conteudo?.plano || [], obs: l.conteudo?.obs || '', antecipada: !!l.conteudo?.antecipada,
  manutentor: l.manutentor, supervisor: l.supervisor, gerente: l.gerente, pdf_path: l.pdf_path,
});

// rascunhos guardados no celular (cópia de segurança)
const LOCAL = 'prev-rascunhos';
const locais = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}'); } catch { return {}; } };
const guardarLocal = (r) => { try { const l = locais(); if (r.status === 'rascunho') l[r.id] = r; else delete l[r.id]; localStorage.setItem(LOCAL, JSON.stringify(l)); } catch { /* sem espaço */ } };

export async function carregar() {
  const [a, b, c, d, f] = await Promise.all([
    sb.from('registros').select('*').order('inicio'),
    sb.from('reprogramacoes').select('prog_id, data'),
    sb.from('folgas').select('data, nome'),
    sb.from('trabalha').select('data'),
    sb.from('acoes').select('*').order('criada_em'),
  ]);
  const e = a.error || b.error || c.error || d.error; if (e) throw e;
  const regs = a.data.map(deLinha);
  // rascunho do celular que ainda não chegou ao banco
  Object.values(locais()).forEach((r) => { if (!regs.some((x) => x.id === r.id)) { regs.push(r); persistir(r).catch(() => {}); } });
  mem = {
    registros: regs,
    reprog: Object.fromEntries(b.data.map((x) => [x.prog_id, x.data])),
    folgas: Object.fromEntries(c.data.map((x) => [x.data, x.nome])),
    trabalha: d.data.map((x) => x.data),
    acoes: f.error ? [] : f.data,   // tabela de ações ausente (banco ainda sem o script 03): segue sem ações
  };
  avisar();
}

// ---------- registros ----------
export const registros = () => mem.registros;
export const registro = (id) => mem.registros.find((r) => r.id === id) || null;
export const registroDaProg = (progId) => mem.registros.find((r) => r.prog === progId && r.status !== 'rascunho') || null;
export const rascunhoDaProg = (progId) => mem.registros.find((r) => r.prog === progId && r.status === 'rascunho') || null;
export const nomesUsados = () => [...new Set(mem.registros.map((r) => r.manutentor?.nome).filter(Boolean))];

const esperas = new Map();
async function persistir(r) {
  const { error } = await sb.from('registros').upsert(paraLinha(r));
  if (error) throw error;
}
// Rascunho: grava depois de 1,5 s sem mexer. Mudança de etapa (assinaturas): grava na hora e
// devolve a promessa, para a tela mostrar o erro se o banco recusar.
export function salvarRegistro(r) {
  const i = mem.registros.findIndex((x) => x.id === r.id);
  if (i >= 0) mem.registros[i] = r; else mem.registros.push(r);
  guardarLocal(r);
  clearTimeout(esperas.get(r.id));
  if (r.status === 'rascunho') {
    esperas.set(r.id, setTimeout(() => persistir(r).catch((e) => console.warn('rascunho fica no celular:', msgErro(e))), 1500));
    return Promise.resolve(r);
  }
  avisar();
  // a assinatura do manutentor cria as ações no banco: busca em seguida
  return persistir(r).then(() => { guardarLocal(r); recarregarAcoes().catch(() => {}); return r; });
}
// devolve o registro como está no banco (quando a gravação foi recusada)
export async function recarregarRegistro(id) {
  const { data, error } = await sb.from('registros').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  const i = mem.registros.findIndex((x) => x.id === id);
  if (data) { const r = deLinha(data); if (i >= 0) mem.registros[i] = r; else mem.registros.push(r); }
  avisar();
}

// Exclusão (só o gerente): apaga o registro e o PDF da pasta. Sem volta.
// A preventiva programada volta a ficar em aberto no cronograma.
export async function excluirRegistro(r) {
  const { data, error } = await sb.from('registros').delete().eq('id', r.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('sem permissão para excluir (só o gerente de manutenção).');
  if (r.pdf_path) await sb.storage.from('relatorios').remove([r.pdf_path]).catch(() => {});
  const fotos = fotosDoRegistro(r); if (fotos.length) await sb.storage.from('fotos').remove(fotos).catch(() => {});
  mem.acoes = mem.acoes.filter((x) => x.registro_id !== r.id);
  clearTimeout(esperas.get(r.id));
  mem.registros = mem.registros.filter((x) => x.id !== r.id);
  try { const l = locais(); delete l[r.id]; localStorage.setItem(LOCAL, JSON.stringify(l)); } catch { /* ok */ }
  avisar();
}

// ---------- remarcações e dias sem expediente ----------
export const reprog = () => mem.reprog;
export function reprogramar(progId, data) {
  if (data) mem.reprog[progId] = data; else delete mem.reprog[progId];
  avisar();
  const q = data ? sb.from('reprogramacoes').upsert({ prog_id: progId, data }) : sb.from('reprogramacoes').delete().eq('prog_id', progId);
  q.then(({ error }) => { if (error) { erro(error); carregar().catch(() => {}); } });
}
export const folgasExtra = () => mem.folgas;
export const trabalhaEm = () => mem.trabalha;
const gravarOuDesfazer = (q) => q.then(({ error }) => { if (error) { erro(error); carregar().catch(() => {}); } });
export function addFolga(data, nome) { mem.folgas[data] = nome || 'Sem expediente'; avisar(); gravarOuDesfazer(sb.from('folgas').upsert({ data, nome: nome || 'Sem expediente' })); }
export function rmFolga(data) { delete mem.folgas[data]; avisar(); gravarOuDesfazer(sb.from('folgas').delete().eq('data', data)); }
export function alternarNacional(data) {
  const i = mem.trabalha.indexOf(data);
  if (i >= 0) { mem.trabalha.splice(i, 1); gravarOuDesfazer(sb.from('trabalha').delete().eq('data', data)); }
  else { mem.trabalha.push(data); gravarOuDesfazer(sb.from('trabalha').insert({ data })); }
  avisar();
}

// ---------- pasta dos PDFs (Storage "relatorios") ----------
export const caminhoPDF = (r) => `${r.codigo.replace(/\s+/g, '-')}/${r.ciclo.slice(0, 4)}/${r.codigo.replace(/\s+/g, '-')}_${new Date(r.inicio).toISOString().slice(0, 10)}_${r.id}.pdf`;
export async function enviarPDF(r, blob) {
  const path = caminhoPDF(r);
  const { error } = await sb.storage.from('relatorios').upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  r.pdf_path = path;
  const { error: e2 } = await sb.from('registros').update({ pdf_path: path }).eq('id', r.id);
  if (e2) throw e2;
  avisar();
  return path;
}
export async function baixarPDF(path) {
  const { data, error } = await sb.storage.from('relatorios').download(path);
  if (error) throw error;
  return data;
}
// ---------- plano de ação ----------
export const acoes = () => mem.acoes;
export async function recarregarAcoes() {
  const { data, error } = await sb.from('acoes').select('*').order('criada_em');
  if (error) throw error;
  mem.acoes = data; avisar();
}
export async function atualizarAcao(id, patch) {
  const i = mem.acoes.findIndex((x) => x.id === id); const antes = mem.acoes[i];
  mem.acoes[i] = { ...antes, ...patch }; avisar();
  const { data, error } = await sb.from('acoes').update(patch).eq('id', id).select().maybeSingle();
  if (error) { mem.acoes[i] = antes; avisar(); throw error; }
  if (data) { mem.acoes[i] = data; avisar(); }
  return mem.acoes[i];
}

// ---------- fotos (NOK e evidência) ----------
export const fotosDoRegistro = (r) => Object.values(r.respostas || {}).flatMap((v) => v.fotos || []);
export async function enviarFoto(path, blob) {
  const { error } = await sb.storage.from('fotos').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}
const cacheFotos = new Map();
export async function urlFoto(path) {
  if (cacheFotos.has(path)) return cacheFotos.get(path);
  const p = sb.storage.from('fotos').download(path).then(({ data, error }) => { if (error) throw error; return URL.createObjectURL(data); });
  cacheFotos.set(path, p); p.catch(() => cacheFotos.delete(path));
  return p;
}
export const guardarFotoLocal = (path, blob) => cacheFotos.set(path, Promise.resolve(URL.createObjectURL(blob)));

// ---------- avisos automáticos ----------
export async function lerAvisos() { const { data, error } = await sb.from('config_avisos').select('*').eq('id', 1).maybeSingle(); if (error) throw error; return data; }
export async function salvarAvisos(patch) { const { data, error } = await sb.from('config_avisos').update(patch).eq('id', 1).select().maybeSingle(); if (error) throw error; return data; }
export async function testarAvisos() { const { data, error } = await sb.functions.invoke('avisos', { body: { teste: true } }); if (error) throw error; return data; }

// ---------- verificação pública do selo (funciona sem login) ----------
export async function verificar(id) { const { data, error } = await sb.rpc('verificar_registro', { p_id: id }); if (error) throw error; return data; }

export const novoId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
