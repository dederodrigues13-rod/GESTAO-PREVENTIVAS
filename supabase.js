import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const configurado =
  /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY && !SUPABASE_KEY.startsWith('COLE_AQUI');

export const sb = configurado
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gestao-preventivas-auth' },
    })
  : null;

// Traduz as mensagens de erro mais comuns para português
export function msgErro(error) {
  if (!error) return 'Erro desconhecido.';
  const m = String(error.message || error);
  if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Login ainda não confirmado no Supabase (marque "Auto Confirm User").';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  if (/row-level security|permission denied/i.test(m)) return 'Este login não tem permissão para essa ação.';
  if (/registros_prog_unico/i.test(m)) return 'Esta preventiva já foi enviada.';
  if (/duplicate key|unique/i.test(m)) return 'Já existe um cadastro com esse nome ou código.';
  if (/JWT expired/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
  return m;
}
