// Indicação de amigos (servidor). O código fica no perfil (gerado só pelo servidor). A recompensa automática (mês grátis) saiu junto
// com a Asaas: a venda é só pela App Store, e o prêmio pela Apple ainda não foi definido (rewardsEnabled fica sempre desligado).
import { randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
export const REFERRAL_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
export const CLAIM_WINDOW_DAYS = 7; // só vale para conta recém-criada

export const genReferralCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const rewardsEnabled = () => false;

/** Devolve o código de indicação do usuário, criando um se ainda não tiver. */
export async function ensureReferralCode(admin: SupabaseClient, userId: string): Promise<string | null> {
  const read = async () => (await admin.from('profiles').select('referral_code').eq('id', userId).maybeSingle()).data?.referral_code as string | null | undefined;
  const existing = await read();
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.from('profiles').update({ referral_code: genReferralCode() }).eq('id', userId).is('referral_code', null).select('referral_code');
    if (!error) return data && data.length ? (data[0].referral_code as string) : (await read()) ?? null; // sem linha = outra chamada gravou antes
    // erro de código repetido (único): sorteia outro
  }
  return null;
}
