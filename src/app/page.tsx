import { redirect } from "next/navigation";

// Este repositório é só o app: não há landing aqui (a página de vendas fica em outro repositório).
// O middleware já manda quem acessa "/" para o painel (logado) ou para o login; isto cobre o caso sem middleware.
// Mantém os parâmetros do endereço (o link de indicação é /?ref=CODIGO).
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  const qs = q.toString();
  redirect(qs ? `/login?${qs}` : "/login");
}
