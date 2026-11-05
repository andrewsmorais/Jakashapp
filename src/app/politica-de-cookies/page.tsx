import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de cookies | Jakash",
  description: "Quais cookies e armazenamento local o Jakash usa e como você pode controlá-los.",
  alternates: { canonical: "/politica-de-cookies" },
};

export default function CookiesPage() {
  return (
    <LegalPage path="/politica-de-cookies" title="Política de cookies" subtitle="O Jakash usa apenas o essencial para funcionar.">
      <h2>1. O que são cookies</h2>
      <p>Cookies são pequenos arquivos que o site guarda no seu navegador. Tecnologias parecidas, como o armazenamento local do navegador, servem a propósitos semelhantes. Usamos os dois.</p>

      <h2>2. O que usamos</h2>
      <ul>
        <li><strong>Essenciais (login e segurança):</strong> mantêm você conectado à sua conta e protegem o acesso. Sem eles o app não funciona.</li>
        <li><strong>Preferências:</strong> guardam escolhas como tema claro/escuro, cor do app, idioma e moeda de exibição, para você não precisar configurar de novo.</li>
        <li><strong>App instalável e modo offline:</strong> o armazenamento do navegador guarda arquivos do app para abrir mais rápido e funcionar com a conexão ruim.</li>
      </ul>

      <h2>3. O que não usamos</h2>
      <p>Hoje o Jakash <strong>não usa cookies de publicidade nem de análise de terceiros</strong> (como pixels de anúncios ou ferramentas de rastreamento). Se isso mudar, atualizaremos esta página e pediremos o seu consentimento antes.</p>

      <h2>4. Cookies de terceiros</h2>
      <p>Ao abrir a página de pagamento do Asaas ou o nosso perfil no Instagram, você sai do Jakash e esses sites seguem as próprias políticas de cookies.</p>

      <h2>5. Como controlar</h2>
      <p>Você pode apagar ou bloquear cookies nas configurações do seu navegador. Atenção: bloquear os essenciais impede o login e o uso do aplicativo.</p>

      <p>Mais detalhes sobre dados pessoais na <Link href="/politica-de-privacidade">Política de privacidade</Link>.</p>
    </LegalPage>
  );
}
