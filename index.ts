// Avisos automáticos da Gestão de Preventivas (Teams e e-mail pelo Outlook)
// Chamado todo dia útil às 6h30 pelo agendador do banco (pg_cron) com o token
// da tabela config_avisos, ou pelo botão "Enviar teste agora" (login da gestão).
// E-mail: o fluxo do Teams/Outlook LÊ o feed RSS desta função (GET ?feed=<token>) e envia pelo Outlook.
// (A Vetore bloqueia fluxos que recebem chamadas de fora; por isso é o fluxo que vem buscar.)
// Alternativas: webhook do canal do Teams (se a TI liberar) e Resend (segredo RESEND_API_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { montarAvisos, cartaoTeams, emailHtml, montarFeed } from './avisos-core.js';
import { hojeEm } from './regras.js';
import { FERIADOS_NACIONAIS } from './dados.js';

const URL_APP = 'https://gestao-preventivas.vercel.app/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const resp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const lista = (s?: string | null) => (s || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'));
const horaBR = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const tituloDe = (hoje: string, teste: boolean) => `${teste ? 'TESTE · ' : ''}Preventivas · ${hoje.split('-').reverse().join('/')}`;

// lê o banco e monta os avisos do dia
async function dadosAvisos(admin: any, teste: boolean) {
  const [r, rp, fo, tr, ac] = await Promise.all([
    admin.from('registros').select('id, prog, codigo, status, fim, manutentor'),
    admin.from('reprogramacoes').select('prog_id, data'),
    admin.from('folgas').select('data, nome'),
    admin.from('trabalha').select('data'),
    admin.from('acoes').select('codigo, item, acao, responsavel, prazo, status'),
  ]);
  const hoje = hojeEm();
  const extras = Object.fromEntries((fo.data || []).map((x: any) => [x.data, x.nome]));
  const trabalha = (tr.data || []).map((x: any) => x.data);
  const w = new Date(hoje + 'T12:00:00Z').getUTCDay();
  const folgaHoje = (extras[hoje] || FERIADOS_NACIONAIS[hoje]) && !trabalha.includes(hoje);
  const util = !(w === 0 || w === 6 || folgaHoje);
  const av = montarAvisos({ hoje, registros: r.data || [], reprog: Object.fromEntries((rp.data || []).map((x: any) => [x.prog_id, x.data])), extras, trabalha, acoes: ac.data || [], teste });
  return { hoje, util, av };
}

// itens (e-mails) do feed: o do dia, a partir das 06:30, e o de teste (vale por 6 h depois do botão)
function itensEmail(hoje: string, av: any, cfg: any, teste: boolean, em: number) {
  const out: any[] = [], g = lista(cfg.emails), pc = lista(cfg.emails_pcp), tag = teste ? `teste-${em}` : hoje;
  const titulo = tituloDe(hoje, teste);
  if (g.length && (av.secoes.length || teste)) out.push({ id: `gestao-${tag}`, titulo, para: g.join(';'), em,
    html: emailHtml(titulo, av.secoes.length ? av.secoes : [{ titulo: 'Nada pendente', linhas: ['Tudo em dia.'] }], URL_APP) });
  if (pc.length && av.pcp) out.push({ id: `pcp-${tag}`, titulo: `${teste ? 'TESTE · ' : ''}${av.pcp.titulo}`, para: pc.join(';'), em: em + 1000,
    html: emailHtml(av.pcp.titulo, [av.pcp], URL_APP) });
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg, error: eCfg } = await admin.from('config_avisos').select('*').eq('id', 1).single();
  if (eCfg || !cfg) return resp({ erro: 'configuração dos avisos não encontrada' }, 500);

  // ---------- feed RSS (o fluxo do Outlook vem buscar) ----------
  if (req.method === 'GET') {
    const tk = new URL(req.url).searchParams.get('feed');
    if (!tk || tk !== cfg.token) return new Response('não autorizado', { status: 401 });
    await admin.from('config_avisos').update({ feed_lido_em: new Date().toISOString() }).eq('id', 1);
    const itens: any[] = [];
    if (cfg.ativo && horaBR() >= '06:30') {
      const d = await dadosAvisos(admin, false);
      if (d.util) itens.push(...itensEmail(d.hoje, d.av, cfg, false, Date.parse(d.hoje + 'T06:30:00-03:00')));
    }
    if (cfg.teste_em && Date.now() - Date.parse(cfg.teste_em) < 6 * 3600e3) {
      const d = await dadosAvisos(admin, true);
      itens.push(...itensEmail(d.hoje, d.av, cfg, true, Date.parse(cfg.teste_em)));
    }
    return new Response(montarFeed(itens, URL_APP), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const body = await req.json().catch(() => ({}));

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

  const { hoje, util, av } = await dadosAvisos(admin, teste);
  if (!teste && !util) return resp({ resultado: 'dia sem expediente' });
  if (teste) await admin.from('config_avisos').update({ teste_em: new Date().toISOString() }).eq('id', 1);
  if (av.vazio && !teste) { await admin.from('config_avisos').update({ ultimo_envio: new Date().toISOString(), ultimo_resultado: 'nada a avisar' }).eq('id', 1); return resp({ resultado: 'nada a avisar' }); }

  const feitos: string[] = [], falhas: string[] = [];
  if (cfg.teams_webhook) {
    const t = await fetch(cfg.teams_webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartaoTeams(av, URL_APP, teste)) }).catch((e) => ({ ok: false, status: String(e) }));
    (t.ok ? feitos : falhas).push(t.ok ? 'Teams' : `Teams (${(t as Response).status})`);
  }
  const chave = Deno.env.get('RESEND_API_KEY'), de = Deno.env.get('AVISOS_REMETENTE') || 'Preventivas Vetore <onboarding@resend.dev>';
  const mandar = async (para: string[], assunto: string, html: string, rot: string) => {
    if (!chave || !para.length) return;
    const e = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: de, to: para, subject: assunto, html }) }).catch(() => null);
    (e?.ok ? feitos : falhas).push(e?.ok ? rot : `${rot} (${e?.status || 'erro'})`);
  };
  const titulo = tituloDe(hoje, teste);
  if (av.secoes.length || teste) await mandar(lista(cfg.emails), titulo, emailHtml(titulo, av.secoes.length ? av.secoes : [{ titulo: 'Nada pendente', linhas: ['Tudo em dia.'] }], URL_APP), 'e-mail gestão');
  if (av.pcp) await mandar(lista(cfg.emails_pcp), `${teste ? 'TESTE · ' : ''}${av.pcp.titulo}`, emailHtml(av.pcp.titulo, [av.pcp], URL_APP), 'e-mail PCP');
  // sem Resend, os e-mails ficam no feed e o fluxo do Outlook busca sozinho
  const temEmail = lista(cfg.emails).length || lista(cfg.emails_pcp).length;
  if (temEmail && !chave) feitos.push(teste ? 'Outlook: o fluxo busca o teste em alguns minutos' : 'Outlook: e-mails no feed para o fluxo');
  if (!cfg.teams_webhook && !temEmail) falhas.push('nenhum destino configurado (cadastre os e-mails)');

  const resultado = [feitos.length ? 'enviado: ' + feitos.join(', ') : '', falhas.length ? 'falhou: ' + falhas.join(', ') : ''].filter(Boolean).join(' · ');
  await admin.from('config_avisos').update({ ultimo_envio: new Date().toISOString(), ultimo_resultado: (teste ? 'teste · ' : '') + resultado }).eq('id', 1);
  return resp({ resultado, secoes: av.secoes.length, pcp: !!av.pcp }, falhas.length && !feitos.length ? 502 : 200);
});
