import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Sobre o Jakash",
  description: "Quem somos e por que criamos o Jakash: organizar o dinheiro no dia a dia, sem complicação.",
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <LegalPage path="/sobre" title="Sobre o Jakash" subtitle="Organizar o dinheiro no dia a dia, sem complicação." updated={false}>
      <p>O Jakash nasceu de uma ideia simples: controlar o dinheiro não deveria dar trabalho. Em vez de abrir planilhas e se perder em campos, você lança seus gastos, acompanha contas e cartões e vê no painel para onde o seu dinheiro está indo. Dentro do app, a Jaki, nossa assistente de inteligência artificial, ajuda a tirar dúvidas sobre as suas finanças.</p>

      <h2>O que fazemos</h2>
      <ul>
        <li><strong>Assistente de IA dentro do app</strong> (Chat da Jaki) para perguntar sobre as suas finanças.</li>
        <li><strong>Painel completo:</strong> saldos, limites de gastos, contas a pagar, cartões e parcelas, lista de compras, objetivos, reserva de emergência, plano para sair das dívidas e investimentos.</li>
        <li><strong>Gestão compartilhada</strong> para casal, família ou sócios.</li>
        <li><strong>Ferramentas para MEI:</strong> limite anual, DASN, recibos e relatórios.</li>
      </ul>

      <h2>No que acreditamos</h2>
      <ul>
        <li><strong>Simplicidade:</strong> se dá trabalho demais, você para de usar.</li>
        <li><strong>Transparência:</strong> preços claros, cancelamento sem multa e conversa honesta sobre o que o app faz e o que ainda não faz.</li>
        <li><strong>Privacidade:</strong> seus dados financeiros são seus. Não vendemos informações.</li>
      </ul>

      <h2>Feito no Brasil 🇧🇷</h2>
      <p>O Jakash é um produto brasileiro, pensado para a realidade de quem vive de salário, de autônomo ou de MEI no Brasil.</p>

      <p>Quer falar com a gente? Veja a página de <Link href="/contato">Contato</Link>.</p>
    </LegalPage>
  );
}
