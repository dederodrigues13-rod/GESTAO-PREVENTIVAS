-- =====================================================================
-- 04 · Agenda o envio automático dos avisos (dias úteis, 06:30 de Brasília)
-- Rodar DEPOIS de publicar a função "avisos" no Supabase.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('avisos-preventivas')
 where exists (select 1 from cron.job where jobname = 'avisos-preventivas');

-- 09:30 UTC = 06:30 em Brasília, de segunda a sexta.
-- A própria função pula feriados e folgas cadastradas no sistema.
select cron.schedule(
  'avisos-preventivas',
  '30 9 * * 1-5',
  $$
  select net.http_post(
    url     := 'https://qoywvkggknsrajtdzxht.supabase.co/functions/v1/avisos',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('token', (select token from public.config_avisos where id = 1))
  );
  $$
);
