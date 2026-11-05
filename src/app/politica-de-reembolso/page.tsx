import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de reembolso | Jakash",
  description: "Teste grátis de 7 dias, cancelamento a qualquer momento e como pedir reembolso no Jakash.",
  alternates: { canonical: "/politica-de-reembolso" },
};

export default function ReembolsoPage() {
  return (
    <LegalPage path="/politica-de-reembolso" title="Política de reembolso" subtitle="Cancelar é simples e sem multa.">
      <h2>1. Teste grátis</h2>
      <p>No site, todo plano começa com <strong>7 dias grátis, sem cadastrar cartão</strong>. Se você cancelar antes do fim do teste, nada é cobrado. O teste grátis não vale para assinaturas feitas pelo app para iPhone (veja a seção 9).</p>

      <h2>2. Cancelamento</h2>
      <p>Você pode cancelar a renovação quando quiser, sem multa, em <strong>Configurações › Planos › Cancelar renovação</strong>. Depois de cancelar, você continua usando o Jakash até o fim do período já pago e não será cobrado de novo. Se a assinatura foi feita pela App Store, cancele em <strong>Ajustes do iPhone › seu nome › Assinaturas</strong>.</p>

      <h2>3. Direito de arrependimento (7 dias)</h2>
      <p>Conforme o art. 49 do Código de Defesa do Consumidor, se você assinou pela internet e se arrependeu, pode pedir o <strong>reembolso integral em até 7 dias corridos</strong> depois da contratação ou da primeira cobrança, sem precisar explicar o motivo. Nas assinaturas feitas pela App Store, esse pedido é feito à Apple (veja a seção 9).</p>

      <h2>4. Depois dos 7 dias</h2>
      <p>Passado esse prazo, não fazemos reembolso proporcional do período mensal já iniciado, porque o acesso ao serviço continua disponível até o fim dele. Os casos abaixo são exceções e sempre analisados.</p>

      <h2>5. Quando reembolsamos</h2>
      <ul>
        <li>Cobrança em duplicidade ou em valor diferente do contratado.</li>
        <li>Cobrança depois de um cancelamento feito corretamente.</li>
        <li>Falha do serviço que tenha impedido o uso por período relevante.</li>
      </ul>

      <h2>6. Como pedir</h2>
      <p>Fale conosco pela página de <Link href="/contato">Contato</Link> informando o e-mail da sua conta e o motivo. Respondemos o mais rápido possível.</p>

      <h2>7. Como e quando você recebe</h2>
      <p>Nas assinaturas feitas pelo site, o reembolso é feito pela mesma forma de pagamento usada (Pix, cartão ou boleto), pelo Asaas. Em cartão de crédito, o valor pode aparecer em até duas faturas, conforme a operadora do cartão. Em Pix ou boleto, a devolução é feita por transferência bancária.</p>

      <h2>8. Troca de plano</h2>
      <p>Ao trocar de plano em Configurações › Planos, o novo valor vale a partir da próxima renovação. Não há cobrança extra no momento da troca. Nas assinaturas da App Store, a troca de plano é feita pela própria App Store.</p>

      <h2>9. Assinaturas feitas pela App Store (app para iPhone)</h2>
      <p>A cobrança é feita pela sua conta da Apple, e os reembolsos seguem as regras da Apple. Você pode pedir o reembolso pelo site <strong>reportaproblem.apple.com</strong>. O Jakash não consegue devolver diretamente um pagamento feito na App Store, mas, se tiver dificuldade, pode nos escrever pela página de <Link href="/contato">Contato</Link> e ajudamos a encontrar o caminho.</p>

      <p>Veja também os <Link href="/termos-de-uso">Termos de uso</Link>.</p>
    </LegalPage>
  );
}
