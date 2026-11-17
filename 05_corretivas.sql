-- =====================================================================
-- 05 · Corretivas (chamados do portal SM) para cruzar com as preventivas
-- As OMs entram pela tela Corretivas: colando o texto da tela Chamados do
-- SM ou pelo botão de favorito "Enviar ao sistema". Reimportar não duplica
-- (a OM é a chave) e não desfaz a máquina escolhida à mão.
-- =====================================================================
create table if not exists public.corretivas (
  os int primary key,                       -- número do chamado no SM
  prioridade text,                          -- Parada de Linha, Crítico, Normal, Baixo
  assunto text,
  status text,                              -- Fechado, Em atendimento, Aguardando atendimento…
  solicitante text,
  atendente text,
  maquina_auto text,                        -- máquina pela regra (solicitante / assunto)
  maquina_origem text,                      -- solicitante | assunto | pessoa
  maquina_manual text,                      -- quando alguém escolhe a máquina à mão (vale por cima da automática)
  celula text,                              -- "forno da máquina 08" → célula 08
  sistema text,                             -- Prensa, Jato, Carregador… (pelo assunto)
  abertura timestamptz,
  ultimo_atend timestamptz,                 -- nos fechados = hora do fechamento
  ultima_mod timestamptz,
  importado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists corretivas_abertura on public.corretivas (abertura);

create or replace function public.corretiva_atualizada()
returns trigger language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists corretivas_atualizada on public.corretivas;
create trigger corretivas_atualizada before update on public.corretivas for each row execute function public.corretiva_atualizada();
revoke execute on function public.corretiva_atualizada() from public, anon, authenticated;

alter table public.corretivas enable row level security;
drop policy if exists "logins leem corretivas" on public.corretivas;
create policy "logins leem corretivas" on public.corretivas for select to authenticated using (public.tem_perfil());
drop policy if exists "logins importam corretivas" on public.corretivas;
create policy "logins importam corretivas" on public.corretivas for insert to authenticated with check (public.tem_perfil());
drop policy if exists "logins atualizam corretivas" on public.corretivas;
create policy "logins atualizam corretivas" on public.corretivas for update to authenticated using (public.tem_perfil()) with check (public.tem_perfil());
drop policy if exists "gerente apaga corretivas" on public.corretivas;
create policy "gerente apaga corretivas" on public.corretivas for delete to authenticated using (public.meu_perfil() = 'gerente');
revoke all on public.corretivas from anon;
