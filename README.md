# Jakash: página de vendas

Só a vitrine do Jakash (Next.js). **Não vende e não tem login.** Os botões levam para a App Store, e o "Entrar" leva
para o app no computador.

O app (iPhone e site) fica em outro repositório: `andrewsmorais/Jakashapp`. A venda é só pela App Store (assinatura
mensal, 7 dias grátis). Quem assina entra no app e no site com o mesmo e-mail e senha.

## Variáveis de ambiente (Vercel)
- `NEXT_PUBLIC_APP_STORE_URL`: link do Jakash na App Store.
- `NEXT_PUBLIC_APP_URL`: endereço do app no computador (sem barra no final).

Sem elas, os botões apontam para `#`. Veja `.env.example`.

## Rodar
```
npm install
npm run dev
npm run build
```

## Atenção: duas cópias
Preços e textos dos planos estão em `src/lib/plans.ts` e também no app. Se mudar de um lado, mude do outro.
As páginas legais (privacidade, termos, cookies, reembolso) ainda citam a Asaas e precisam ser revisadas.
