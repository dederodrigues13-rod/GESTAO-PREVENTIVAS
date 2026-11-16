-- =====================================================================
-- GESTÃO DE PREVENTIVAS — Script 02: definir o perfil de cada login
--
-- Rodar DEPOIS de criar os usuários em
-- Supabase > Authentication > Users > Add user > Create new user
-- (marque "Auto Confirm User"). Logins sugeridos:
--   manutencao@vetore.com  -> manutentor  (preenche e assina no celular)
--   supervisor@vetore.com  -> supervisor  (2ª assinatura, remarca datas)
--   gerente@vetore.com     -> gerente     (3ª assinatura, remarca datas)
-- Para dar um login a cada pessoa, crie mais usuários e acrescente linhas abaixo.
-- =====================================================================

insert into public.perfis (user_id, perfil)
select id, 'manutentor' from auth.users where email = 'manutencao@vetore.com'
union all
select id, 'supervisor' from auth.users where email = 'supervisor@vetore.com'
union all
select id, 'gerente'    from auth.users where email = 'gerente@vetore.com'
on conflict (user_id) do update set perfil = excluded.perfil;

-- Conferência: deve listar os três e-mails com o perfil certo
select u.email, p.perfil
from public.perfis p
join auth.users u on u.id = p.user_id
order by p.perfil;
