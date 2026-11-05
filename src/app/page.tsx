import { redirect } from "next/navigation";

// Este repositório é só o app: não há landing aqui (a página de vendas fica em outro repositório).
// O middleware já manda quem acessa "/" para o painel (logado) ou para o login; isto cobre o caso sem middleware.
export default function Home() {
  redirect("/login");
}
