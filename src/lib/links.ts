// Endereços de fora da página. Definidos por variável de ambiente (Vercel > Settings > Environment Variables),
// porque dependem de coisas que ainda não estão fechadas: o link da App Store e o endereço do app no computador.
// Enquanto não forem definidos, os botões apontam para "#" (não levam a lugar nenhum, mas também não quebram).

/** Página do Jakash na App Store (ex.: https://apps.apple.com/br/app/jakash/id0000000000). */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "#";

/** Endereço do app para usar no computador (ex.: https://app.jakash.app). Sem barra no final. */
const APP_WEB_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

/** Tela de entrada do app no computador. Quem comprou pela App Store entra com o mesmo e-mail e senha. */
export const APP_LOGIN_URL = APP_WEB_URL ? `${APP_WEB_URL}/login` : "#";
