import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Contato | Jakash",
  description: "Fale com o Jakash: Instagram, WhatsApp de suporte e outros canais.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  const support = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "").replace(/\D/g, "");

  return (
    <LegalPage path="/contato" title="Contato" subtitle="Dúvidas, suporte, pedidos sobre seus dados ou reembolso." updated={false}>
      <h2>Como falar com a gente</h2>
      <ul>
        <li>
          <strong>Instagram:</strong>{" "}
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@{INSTAGRAM_HANDLE}</a>, é só mandar uma mensagem direta.
        </li>
        {support && (
          <li>
            <strong>Suporte no WhatsApp:</strong>{" "}
            <a href={`https://wa.me/${support}`} target="_blank" rel="noopener noreferrer">abrir conversa</a>. É uma conversa normal no seu WhatsApp, só para suporte.
          </li>
        )}
        <li><strong>Dentro do app:</strong> entre na sua conta e veja Configurações para ajustes de perfil, plano e dados.</li>
      </ul>

      <h2>Ao pedir ajuda, informe</h2>
      <ul>
        <li>O e-mail da sua conta (nunca envie sua senha).</li>
        <li>O que aconteceu e, se puder, um print da tela.</li>
        <li>Para <strong>reembolso</strong>, o motivo e a data da cobrança. Veja a <Link href="/politica-de-reembolso">Política de reembolso</Link>.</li>
        <li>Para <strong>pedidos sobre seus dados</strong> (LGPD), o que você quer fazer. Veja a <Link href="/politica-de-privacidade">Política de privacidade</Link>.</li>
      </ul>
    </LegalPage>
  );
}
