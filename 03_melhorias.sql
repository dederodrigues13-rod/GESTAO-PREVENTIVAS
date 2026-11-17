-- =====================================================================
-- GESTÃO DE PREVENTIVAS — Script 03: plano de ação, fotos, selo de
-- autenticidade e configuração dos avisos automáticos
-- (já aplicado no projeto em 16/11/2026; guardado aqui como referência)
-- =====================================================================

-- ---------- selo de autenticidade (SHA-256 do relatório concluído) ----------
alter table public.registros add column if not exists selo text;

create or replace function public.selo_de(r public.registros)
returns text language sql stable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(concat_ws('|', r.id, r.codigo, r.ciclo, r.conteudo::text,
    r.manutentor::text, r.supervisor::text, r.gerente::text, extract(epoch from r.inicio)::text, extract(epoch from r.fim)::text), 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.validar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text := public.meu_perfil();
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    -- upsert de um registro que já existe: quem valida é a etapa de UPDATE (logo em seguida)
    if exists (select 1 from public.registros where id = new.id) then return new; end if;
    new.selo := null;
    if new.status not in ('rascunho', 'ag_sup') then raise exception 'Registro novo precisa começar pelo manutentor.'; end if;
    return new;
  end if;
  if old.status = 'concluida' then
    if public.e_gestao() and new.status = old.status and new.conteudo = old.conteudo and new.manutentor is not distinct from old.manutentor
       and new.supervisor is not distinct from old.supervisor and new.gerente is not distinct from old.gerente and new.selo is not distinct from old.selo then return new; end if;
    raise exception 'Preventiva concluída não pode ser alterada.';
  end if;
  new.selo := null;   -- o selo só é gerado pelo banco, na conclusão
  if old.status = 'rascunho' then
    if new.status not in ('rascunho', 'ag_sup') then raise exception 'O manutentor assina primeiro.'; end if;
    if new.status = 'ag_sup' and (new.manutentor is null or new.fim is null) then raise exception 'Falta a assinatura do manutentor.'; end if;
    return new;
  end if;
  if new.conteudo <> old.conteudo or new.manutentor is distinct from old.manutentor or new.inicio <> old.inicio or new.fim is distinct from old.fim then
    raise exception 'Depois da assinatura do manutentor o formulário não pode ser alterado.';
  end if;
  if old.status = 'ag_sup' then
    if new.status = 'ag_sup' then return new; end if;
    if new.status <> 'ag_ger' or p <> 'supervisor' or new.supervisor is null then raise exception 'Agora quem assina é o supervisor da área.'; end if;
    return new;
  end if;
  if old.status = 'ag_ger' then
    if new.supervisor is distinct from old.supervisor then raise exception 'A assinatura do supervisor não pode ser alterada.'; end if;
    if new.status = 'ag_ger' then return new; end if;
    if new.status <> 'concluida' or p <> 'gerente' or new.gerente is null then raise exception 'Agora quem assina é o gerente de manutenção.'; end if;
    new.selo := public.selo_de(new);
    return new;
  end if;
  return new;
end $$;

-- verificação pública (QR do PDF): qualquer pessoa confere se o relatório existe e não foi alterado
create or replace function public.verificar_registro(p_id text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when r.id is null then null else jsonb_build_object(
    'codigo', r.codigo, 'ciclo', r.ciclo, 'status', r.status, 'rev', coalesce((r.conteudo->>'rev')::int, 5),
    'inicio', r.inicio, 'fim', r.fim,
    'manutentor', r.manutentor->>'nome', 'manutentor_em', r.manutentor->>'em',
    'supervisor', r.supervisor->>'nome', 'supervisor_em', r.supervisor->>'em',
    'gerente', r.gerente->>'nome', 'gerente_em', r.gerente->>'em',
    'nok', (select count(*) from jsonb_each(coalesce(r.conteudo->'respostas', '{}')) e where e.value->>'v' = 'nok'),
    'selo', r.selo, 'integro', r.selo is not null and r.selo = public.selo_de(r)) end
  from (select 1) x left join public.registros r on r.id = p_id
$$;
revoke execute on function public.verificar_registro(text) from public;
grant execute on function public.verificar_registro(text) to anon, authenticated;
revoke execute on function public.selo_de(public.registros) from public, anon;

-- ---------- plano de ação com acompanhamento ----------
create table if not exists public.acoes (
  id text primary key,                         -- "<registro>-<n>"
  registro_id text not null references public.registros (id) on delete cascade,
  codigo text not null,
  ciclo text,
  item_key text,                               -- "injetora.2" (vazio = ação acrescentada à mão)
  item text,
  encontrado text,
  acao text,
  responsavel text,
  prazo date,
  status text not null default 'aberta' check (status in ('aberta', 'andamento', 'fechada')),
  fechamento text,                             -- o que foi feito (evidência)
  foto_fechamento text,
  fotos jsonb not null default '[]'::jsonb,    -- fotos do NOK
  fechada_em timestamptz,
  fechada_por text,
  criada_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists acoes_status on public.acoes (status, prazo);
create index if not exists acoes_registro on public.acoes (registro_id);

-- quando o manutentor assina, cada linha do plano vira uma ação para acompanhar
create or replace function public.criar_acoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'ag_sup' and (tg_op = 'INSERT' or old.status = 'rascunho') then
    insert into public.acoes (id, registro_id, codigo, ciclo, item_key, item, encontrado, acao, responsavel, prazo, fotos)
    select new.id || '-' || (t.ord - 1), new.id, new.codigo, new.ciclo, nullif(t.p->>'key', ''), t.p->>'item',
      new.conteudo->'respostas'->(t.p->>'key')->>'obs', t.p->>'acao', nullif(t.p->>'resp', ''),
      case when coalesce(t.p->>'prazo', '') ~ '^\d{4}-\d{2}-\d{2}$' then (t.p->>'prazo')::date end,
      coalesce(new.conteudo->'respostas'->(t.p->>'key')->'fotos', '[]'::jsonb)
    from jsonb_array_elements(coalesce(new.conteudo->'plano', '[]'::jsonb)) with ordinality as t(p, ord)
    on conflict (id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists registros_criar_acoes on public.registros;
create trigger registros_criar_acoes after insert or update on public.registros
for each row execute function public.criar_acoes();

create or replace function public.acao_atualizada()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  if new.status = 'fechada' and old.status <> 'fechada' then new.fechada_em := coalesce(new.fechada_em, now()); end if;
  if new.status <> 'fechada' then new.fechada_em := null; end if;
  if new.registro_id <> old.registro_id or new.codigo <> old.codigo or new.item_key is distinct from old.item_key then
    raise exception 'A origem da ação não pode ser alterada.';
  end if;
  return new;
end $$;
drop trigger if exists acoes_atualizada on public.acoes;
create trigger acoes_atualizada before update on public.acoes for each row execute function public.acao_atualizada();

alter table public.acoes enable row level security;
drop policy if exists "logins leem acoes" on public.acoes;
create policy "logins leem acoes" on public.acoes for select to authenticated using (public.tem_perfil());
drop policy if exists "logins criam acoes" on public.acoes;
create policy "logins criam acoes" on public.acoes for insert to authenticated with check (public.tem_perfil());
drop policy if exists "logins atualizam acoes" on public.acoes;
create policy "logins atualizam acoes" on public.acoes for update to authenticated using (public.tem_perfil()) with check (public.tem_perfil());
drop policy if exists "gerente apaga acoes" on public.acoes;
create policy "gerente apaga acoes" on public.acoes for delete to authenticated using (public.meu_perfil() = 'gerente');

-- ---------- fotos (NOK e evidência de fechamento) ----------
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists "logins leem fotos" on storage.objects;
create policy "logins leem fotos" on storage.objects for select to authenticated using (bucket_id = 'fotos' and public.tem_perfil());
drop policy if exists "logins enviam fotos" on storage.objects;
create policy "logins enviam fotos" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and public.tem_perfil());
drop policy if exists "gerente apaga fotos" on storage.objects;
create policy "gerente apaga fotos" on storage.objects for delete to authenticated using (bucket_id = 'fotos' and public.meu_perfil() = 'gerente');

-- ---------- avisos automáticos (Teams / e-mail) ----------
create table if not exists public.config_avisos (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  teams_webhook text,             -- endereço do fluxo "Postar em um canal quando receber uma solicitação de webhook" (Teams > Workflows)
  outlook_webhook text,           -- fluxo do Workflows/Power Automate que envia e-mail pelo Outlook
  emails text,                    -- e-mails da gestão, separados por vírgula
  emails_pcp text,                -- e-mails do PCP (lista semanal de paradas, toda segunda)
  token text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  ultimo_envio timestamptz,
  ultimo_resultado text
);
insert into public.config_avisos (id) values (1) on conflict (id) do nothing;
alter table public.config_avisos enable row level security;
drop policy if exists "gestao le avisos" on public.config_avisos;
create policy "gestao le avisos" on public.config_avisos for select to authenticated using (public.e_gestao());
drop policy if exists "gestao altera avisos" on public.config_avisos;
create policy "gestao altera avisos" on public.config_avisos for update to authenticated using (public.e_gestao()) with check (public.e_gestao());

revoke execute on function public.criar_acoes(), public.acao_atualizada(), public.validar_registro() from public, anon, authenticated;

alter table public.config_avisos add column if not exists outlook_webhook text;
alter table public.config_avisos add column if not exists teste_em timestamptz;       -- botão "Enviar teste" (o feed mostra o teste por 6 h)
alter table public.config_avisos add column if not exists feed_lido_em timestamptz;   -- última vez que o fluxo do Outlook leu o feed
