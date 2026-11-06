// Endereços de fora do app, definidos por variável de ambiente (Vercel > Settings > Environment Variables).
// Sem a variável, vale "#" e o botão não aparece.

/** Página do Jakash na App Store (ex.: https://apps.apple.com/br/app/jakash/id0000000000). */
export const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || "#";
