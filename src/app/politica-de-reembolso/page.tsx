import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de reembolso | Jakash",
  description: "Teste grátis de 7 dias, cancelamento a qualquer momento e como pedir reembolso da assinatura do Jakash feita pela App Store.",
  alternates: { canonical: "/politica-de-reembolso" },
};

export default function ReembolsoPage() {
  return (
    <LegalPage path="/politica-de-reembolso" title="Política de reembolso" subtitle="Cancelar é simples e sem multa.">
      <p>A assinatura do Jakash (plano Mensal ou Anual) é feita no app para iPhone e cobrada pela <strong>Apple</strong>, na sua conta da App Store. Por isso, cancelamento e reembolso seguem as regras da Apple, explicadas abaixo.</p>

      <h2>1. Teste grátis</h2>
      <p>Os planos Mensal e Anual começam com <strong>7 dias grátis</strong>. Se você cancelar até 24 horas antes do fim do teste, nada é cobrado.</p>

      <h2>2. Cancelamento</h2>
      <p>Você pode cancelar a renovação quando quiser, sem multa, em <strong>Ajustes do iPhone › seu nome › Assinaturas › Jakash</strong> (ou, no app, em Configurações › Planos e assinatura › Gerenciar assinatura). Depois de cancelar, você continua usando o Jakash até o fim do período já pago e não é cobrado de novo.</p>

      <h2>3. Como pedir reembolso</h2>
      <p>Como o pagamento é feito à Apple, o pedido de reembolso também é feito à Apple, pelo site <strong>reportaproblem.apple.com</strong> (entre com o seu Apple ID, escolha a compra do Jakash e informe o motivo). Quem analisa e devolve o valor é a Apple, conforme as regras dela. O Jakash não consegue devolver diretamente um pagamento feito na App Store.</p>

      <h2>4. Direito de arrependimento</h2>
      <p>O Código de Defesa do Consumidor (art. 49) garante o direito de desistir de uma compra feita fora do estabelecimento em até 7 dias. Nas assinaturas da App Store, esse pedido também é feito à Apple, pelo caminho da seção 3.</p>

      <h2>5. Troca entre Mensal e Anual</h2>
      <p>A troca é feita em Ajustes do iPhone › seu nome › Assinaturas › Jakash. Quando o novo plano começa a valer e como fica a cobrança seguem as regras da Apple.</p>

      <h2>6. Precisa de ajuda?</h2>
      <p>Se tiver dificuldade com cancelamento ou reembolso, ou se notar uma cobrança que não reconhece, fale conosco pela página de <Link href="/contato">Contato</Link> informando o e-mail da sua conta. Ajudamos a encontrar o caminho junto à Apple.</p>

      <p>Veja também os <Link href="/termos-de-uso">Termos de uso</Link>.</p>
    </LegalPage>
  );
}
