// Só aceita caminhos internos como destino depois do login (evita redirecionamento para sites externos).
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Tab e quebra de linha são ignorados pelo navegador ("/\t/site.com" viraria "//site.com"): recusa qualquer caractere de controle.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

export function authError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada (e no spam).";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esse e-mail já tem conta. Use Entrar ou recupere a senha.";
  if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak"))) return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (m.includes("same password") || m.includes("different from the old")) return "Escolha uma senha diferente da anterior.";
  return "Não foi possível concluir. Tente novamente.";
}

// Entrada provisória: com os campos vazios, "Entrar" abre o app sem login (as telas abrem, mas sem dados da conta).
// Desligue quando o login for fechado, junto com NEXT_PUBLIC_REQUIRE_LOGIN=1 (ativa o bloqueio das telas no middleware).
export const LOGIN_BYPASS = true;
