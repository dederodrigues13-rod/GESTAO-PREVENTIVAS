-- =====================================================================
-- GESTÃO DE PREVENTIVAS — Script 01: tabelas, regras de acesso e pasta dos PDFs
--
-- Rodar uma vez no Supabase: SQL Editor > New query > colar tudo > Run.
-- As máquinas e o cronograma (FR.06.08.068) ficam no código (dados.js);
-- aqui ficam só os registros feitos no sistema.
-- =====================================================================

-- ---------- perfis: quem é manutentor, supervisor da área ou gerente ----------
create table if not exists public.perfis (
  user_id uuid primary key references auth.users on delete cascade,
  perfil text not null check (perfil in ('manutentor', 'supervisor', 'gerente')),
  criado_em timestamptz not null default now()
);

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.perfis where user_id = auth.uid()
$$;
create or replace function public.tem_perfil()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_perfil() is not null
$$;
create or replace function public.e_gestao()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() in ('supervisor', 'gerente'), false)
$$;

-- ---------- registros de preventiva (formulário FR.06.08.002-A) ----------
-- status: rascunho -> ag_sup (manutentor assinou) -> ag_ger (supervisor assinou) -> concluida (gerente assinou)
create table if not exists public.registros (
  id text primary key,
  prog text,                         -- preventiva programada: "vtia-07-2026-12"
  codigo text not null,              -- "VTIA 07"
  ciclo text not null,               -- "2026-12"
  data_prevista date,
  status text not null default 'rascunho' check (status in ('rascunho', 'ag_sup', 'ag_ger', 'concluida')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  conteudo jsonb not null default '{}'::jsonb,   -- seções, respostas, plano de ação, observações
  manutentor jsonb,                  -- { nome, ass (imagem da assinatura), em }
  supervisor jsonb,
  gerente jsonb,
  pdf_path text,                     -- caminho do PDF na pasta "relatorios"
  criado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now()
);
-- uma preventiva programada só pode ter um relatório enviado (rascunhos não contam)
create unique index if not exists registros_prog_unico on public.registros (prog) where status <> 'rascunho' and prog is not null;
create index if not exists registros_codigo on public.registros (codigo, ciclo);

-- regras do fluxo de assinaturas (valem mesmo se alguém tentar pular a tela)
create or replace function public.validar_registro()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text := public.meu_perfil();
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    if new.status not in ('rascunho', 'ag_sup') then raise exception 'Registro novo precisa começar pelo manutentor.'; end if;
    return new;
  end if;
  if old.status = 'concluida' then
    -- concluída: só a gestão pode anexar/trocar o PDF; o resto fica travado
    if public.e_gestao() and new.status = old.status and new.conteudo = old.conteudo and new.manutentor is not distinct from old.manutentor
       and new.supervisor is not distinct from old.supervisor and new.gerente is not distinct from old.gerente then return new; end if;
    raise exception 'Preventiva concluída não pode ser alterada.';
  end if;
  if old.status = 'rascunho' then
    if new.status not in ('rascunho', 'ag_sup') then raise exception 'O manutentor assina primeiro.'; end if;
    if new.status = 'ag_sup' and (new.manutentor is null or new.fim is null) then raise exception 'Falta a assinatura do manutentor.'; end if;
    return new;
  end if;
  -- depois que o manutentor assina, o conteúdo não muda mais
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
    return new;
  end if;
  return new;
end $$;
drop trigger if exists registros_validar on public.registros;
create trigger registros_validar before insert or update on public.registros
for each row execute function public.validar_registro();

-- ---------- remarcações e dias sem expediente (gestão) ----------
create table if not exists public.reprogramacoes (
  prog_id text primary key,          -- "vtia-07-2026-12"
  data date not null,
  por uuid default auth.uid(),
  em timestamptz not null default now()
);
create table if not exists public.folgas (       -- dias sem expediente acrescentados (Carnaval, emendas, férias coletivas)
  data date primary key,
  nome text not null default 'Sem expediente'
);
create table if not exists public.trabalha (     -- feriados nacionais em que a fábrica trabalha
  data date primary key
);

-- ---------- regras de acesso (RLS) ----------
alter table public.perfis enable row level security;
alter table public.registros enable row level security;
alter table public.reprogramacoes enable row level security;
alter table public.folgas enable row level security;
alter table public.trabalha enable row level security;

drop policy if exists "le o proprio perfil" on public.perfis;
create policy "le o proprio perfil" on public.perfis for select to authenticated using (user_id = auth.uid());

drop policy if exists "logins leem registros" on public.registros;
create policy "logins leem registros" on public.registros for select to authenticated using (public.tem_perfil());
drop policy if exists "logins criam registros" on public.registros;
create policy "logins criam registros" on public.registros for insert to authenticated with check (public.tem_perfil());
drop policy if exists "logins atualizam registros" on public.registros;
create policy "logins atualizam registros" on public.registros for update to authenticated using (public.tem_perfil()) with check (public.tem_perfil());
drop policy if exists "apaga rascunho ou gerente" on public.registros;
create policy "apaga rascunho ou gerente" on public.registros for delete to authenticated using (status = 'rascunho' or public.meu_perfil() = 'gerente');

do $$ declare t text; begin
  foreach t in array array['reprogramacoes', 'folgas', 'trabalha'] loop
    execute format('drop policy if exists "logins leem" on public.%I', t);
    execute format('create policy "logins leem" on public.%I for select to authenticated using (public.tem_perfil())', t);
    execute format('drop policy if exists "gestao altera" on public.%I', t);
    execute format('create policy "gestao altera" on public.%I for all to authenticated using (public.e_gestao()) with check (public.e_gestao())', t);
  end loop;
end $$;

-- ---------- pasta dos PDFs (Storage > relatorios) ----------
insert into storage.buckets (id, name, public) values ('relatorios', 'relatorios', false) on conflict (id) do nothing;
drop policy if exists "logins leem relatorios" on storage.objects;
create policy "logins leem relatorios" on storage.objects for select to authenticated using (bucket_id = 'relatorios' and public.tem_perfil());
drop policy if exists "gestao grava relatorios" on storage.objects;
create policy "gestao grava relatorios" on storage.objects for insert to authenticated with check (bucket_id = 'relatorios' and public.e_gestao());
drop policy if exists "gestao troca relatorios" on storage.objects;
create policy "gestao troca relatorios" on storage.objects for update to authenticated using (bucket_id = 'relatorios' and public.e_gestao());

-- ---------- funções internas: só para quem está logado ----------
revoke execute on function public.meu_perfil(), public.tem_perfil(), public.e_gestao(), public.validar_registro() from public, anon;
revoke execute on function public.validar_registro() from authenticated;
grant execute on function public.meu_perfil(), public.tem_perfil(), public.e_gestao() to authenticated;

-- ---------- gerente pode apagar o PDF ao excluir um registro ----------
drop policy if exists "gerente apaga relatorios" on storage.objects;
create policy "gerente apaga relatorios" on storage.objects for delete to authenticated using (bucket_id = 'relatorios' and public.meu_perfil() = 'gerente');
