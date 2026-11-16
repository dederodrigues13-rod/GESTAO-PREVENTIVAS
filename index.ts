// Avisos automáticos da Gestão de Preventivas (Teams e e-mail)
// Chamado todo dia útil às 6h30 pelo agendador do banco (pg_cron) com o token
// da tabela config_avisos, ou pelo botão "Enviar teste agora" (login da gestão).
// E-mail: opcional, precisa do segredo RESEND_API_KEY (e AVISOS_REMETENTE) no Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { montarAvisos, cartaoTeams, emailHtml } from './avisos-core.js';
import { hojeEm } from './regras.js';

const URL_APP = 'https://gestao-preventivas.vercel.app/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg, error: eCfg } = await admin.from('config_avisos').select('*').eq('id', 1).single();
  if (eCfg || !cfg) return resp({ erro: 'configuração dos avisos não encontrada' }, 500);

  let teste = false;
  if (body?.token) {
    if (body.token !== cfg.token) return resp({ erro: 'não autorizado' }, 401);
  } else {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return resp({ erro: 'faça login' }, 401);
    const { data: p } = await admin.from('perfis').select('perfil').eq('user_id', u.user.id).maybeSingle();
    if (!['supervisor', 'gerente'].includes(p?.perfil)) return resp({ erro: 'só a gestão pode enviar teste' }, 403);
    teste = true;
  }
  if (!cfg.ativo && !teste) return resp({ resultado: 'avisos desligados' });

  const [r, rp, fo, tr, ac] = await Promise.all([
    admin.from('registros').select('id, prog, codigo, status, fim, manutentor'),
    admin.from('reprogramacoes').select('prog_id, data'),
    admin.from('folgas').select('data, nome'),
    admin.from('trabalha').select('data'),
    admin.from('acoes').select('codigo, item, acao, responsavel, prazo, status'),
  ]);
  const hoje = hojeEm();
  const extras = Object.fromEntries((fo.data || []).map((x) => [x.data, x.nome]));
  const trabalha = (tr.data || []).map((x) => x.data);
  const w = new Date(hoje + 'T12:00:00Z').getUTCDay();
  const folgaHoje = (extras[hoje] || (await import('./dados.js')).FERIADOS_NACIONAIS[hoje]) && !trabalha.includes(hoje);
  if (!teste && (w === 0 || w === 6 || folgaHoje)) return resp({ resultado: 'dia sem expediente' });

  const av = montarAvisos({ hoje, registros: r.data || [], reprog: Object.fromEntries((rp.data || []).map((x) => [x.prog_id, x.data])), extras, trabalha, acoes: ac.data || [], teste });
  if (av.vazio && !teste) { await admin.from('config_avisos').update({ ultimo_envio: new Date().toISOString(), ultimo_resultado: 'nada a avisar' }).eq('id', 1); return resp({ resultado: 'nada a avisar' }); }

  const feitos: string[] = [], falhas: string[] = [];
  if (cfg.teams_webhook) {
    const t = await fetch(cfg.teams_webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartaoTeams(av, URL_APP, teste)) }).catch((e) => ({ ok: false, status: String(e) }));
    (t.ok ? feitos : falhas).push(t.ok ? 'Teams' : `Teams (${(t as Response).status})`);
  }
  const chave = Deno.env.get('RESEND_API_KEY'), de = Deno.env.get('AVISOS_REMETENTE') || 'Preventivas Vetore <onboarding@resend.dev>';
  const lista = (s?: string | null) => (s || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
  const mandar = async (para: string[], assunto: string, html: string, rot: string) => {
    if (!chave || !para.length) return;
    const e = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: de, to: para, subject: assunto, html }) }).catch(() => null);
    (e?.ok ? feitos : falhas).push(e?.ok ? rot : `${rot} (${e?.status || 'erro'})`);
  };
  const titulo = `${teste ? 'TESTE · ' : ''}Preventivas · ${hoje.split('-').reverse().join('/')}`;
  if (av.secoes.length || teste) await mandar(lista(cfg.emails), titulo, emailHtml(titulo, av.secoes.length ? av.secoes : [{ titulo: 'Nada pendente', linhas: ['Tudo em dia.'] }], URL_APP), 'e-mail gestão');
  if (av.pcp) await mandar(lista(cfg.emails_pcp), `${teste ? 'TESTE · ' : ''}${av.pcp.titulo}`, emailHtml(av.pcp.titulo, [av.pcp], URL_APP), 'e-mail PCP');
  if (!cfg.teams_webhook && !(chave && (lista(cfg.emails).length || lista(cfg.emails_pcp).length))) falhas.push('nenhum destino configurado');

  const resultado = [feitos.length ? 'enviado: ' + feitos.join(', ') : '', falhas.length ? 'falhou: ' + falhas.join(', ') : ''].filter(Boolean).join(' · ');
  await admin.from('config_avisos').update({ ultimo_envio: new Date().toISOString(), ultimo_resultado: (teste ? 'teste · ' : '') + resultado }).eq('id', 1);
  return resp({ resultado, secoes: av.secoes.length, pcp: !!av.pcp }, falhas.length && !feitos.length ? 502 : 200);
});
