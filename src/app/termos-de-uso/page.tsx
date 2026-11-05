import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Termos de uso | Jakash",
  description: "As regras para usar o Jakash: conta, planos, pagamento, cancelamento e responsabilidades.",
  alternates: { canonical: "/termos-de-uso" },
};

export default function TermosPage() {
  return (
    <LegalPage path="/termos-de-uso" title="Termos de uso" subtitle="As regras para usar o Jakash, em linguagem simples.">
      <p>Ao criar uma conta ou usar o Jakash (site e aplicativo), você concorda com estes termos. Se não concordar, não use o serviço.</p>

      <h2>1. O que é o Jakash</h2>
      <p>O Jakash é uma ferramenta de organização financeira: você registra gastos e receitas no aplicativo, conta com a Jaki, assistente de inteligência artificial dentro do app, e acompanha saldos, limites, contas a pagar, objetivos e relatórios.</p>
      <p><strong>O Jakash não é consultoria financeira, contábil, jurídica, tributária ou de investimentos.</strong> As informações e simulações servem para sua organização pessoal e não substituem a orientação de um profissional. O Jakash também não emite nota fiscal e, por enquanto, não se conecta automaticamente ao seu banco (Open Finance): os lançamentos vêm de você ou de arquivos que você importa.</p>

      <h2>2. Cadastro e segurança da conta</h2>
      <ul>
        <li>Você precisa ter 18 anos ou mais e informar dados verdadeiros.</li>
        <li>Você é responsável por manter sua senha em segredo e por tudo o que acontece na sua conta.</li>
        <li>Se perceber uso indevido da sua conta, avise-nos imediatamente.</li>
      </ul>

      <h2>3. Planos, teste grátis e pagamento</h2>
      <p>Os planos, valores e o que cada um inclui estão na página inicial e em Configurações › Planos. Os valores podem mudar, mas a alteração só vale para a renovação seguinte e depois de avisarmos você.</p>
      <ul>
        <li><strong>Teste grátis:</strong> 7 dias, sem cadastrar cartão. Ao escolher um plano, a cobrança mensal começa ao fim do teste.</li>
        <li><strong>Cobrança:</strong> mensal e recorrente, por Pix, cartão ou boleto, processada pelo Asaas. Você informa CPF ou CNPJ para a emissão da cobrança.</li>
        <li><strong>Troca de plano:</strong> você pode mudar de plano em Configurações › Planos. O novo valor vale a partir da próxima renovação.</li>
        <li><strong>Atraso:</strong> se o pagamento não for confirmado, o acesso pode ser limitado até a regularização.</li>
      </ul>
      <p><strong>Assinatura feita no app para iPhone:</strong> quando você assina pelo app, a cobrança é feita pela sua conta da Apple (App Store). O pagamento é debitado na confirmação da compra e a assinatura renova sozinha todo mês, pelo mesmo valor, a menos que seja cancelada pelo menos 24 horas antes do fim do período. Você gerencia e cancela em Ajustes do iPhone › seu nome › Assinaturas, e os pedidos de reembolso seguem as regras da Apple. Teste grátis e formas de pagamento do site (Pix e boleto) não valem para assinaturas feitas pela App Store.</p>

      <h2>4. Cancelamento e reembolso</h2>
      <p>Você pode cancelar a renovação quando quiser, sem multa, em Configurações › Planos, e continua com acesso até o fim do período já pago. As regras de reembolso estão na <Link href="/politica-de-reembolso">Política de reembolso</Link>.</p>

      <h2>5. Gestão compartilhada</h2>
      <p>Você pode convidar até 2 pessoas (3 no total, contando com você) para dividir as finanças. Quem aceita o convite passa a ver e editar os dados financeiros compartilhados (contas, lançamentos, cartões, contas a pagar, limites, objetivos, dívidas e investimentos). Perfil, assinatura e conversas do chat continuam privados. Só convide quem você conhece e confia; qualquer participante pode encerrar o compartilhamento a qualquer momento.</p>

      <h2>6. Assistente com inteligência artificial</h2>
      <ul>
        <li>As mensagens que você envia ao assistente são interpretadas por inteligência artificial e podem ser registradas por ela como lançamentos.</li>
        <li>A IA pode errar (valor, categoria, data). <strong>Confira seus lançamentos</strong>; você é responsável por revisar e corrigir.</li>
        <li>Para manter o serviço sustentável, há limites diários de mensagens por plano.</li>
      </ul>

      <h2>7. Uso aceitável</h2>
      <p>Não é permitido: usar o Jakash para atividade ilegal; tentar acessar dados de outras pessoas; sobrecarregar, copiar em massa ou fazer engenharia reversa do serviço; ou enviar conteúdo ofensivo ao assistente. Podemos suspender contas que violem estas regras.</p>

      <h2>8. Propriedade intelectual</h2>
      <p>A marca Jakash, o código, o design e os textos são nossos ou licenciados para nós. Os dados que você registra continuam sendo seus.</p>

      <h2>9. Disponibilidade e responsabilidade</h2>
      <p>Trabalhamos para manter o serviço no ar e seguro, mas não garantimos funcionamento ininterrupto: pode haver manutenção, falhas de internet ou instabilidade de terceiros (como provedores de pagamento e de inteligência artificial). Na medida permitida pela lei, não respondemos por decisões financeiras tomadas com base nas informações do app, nem por danos indiretos. Nada aqui limita direitos que a lei de defesa do consumidor garante a você.</p>

      <h2>10. Privacidade</h2>
      <p>Tratamos seus dados conforme a <Link href="/politica-de-privacidade">Política de privacidade</Link> e a <Link href="/politica-de-cookies">Política de cookies</Link>.</p>

      <h2>11. Mudanças nestes termos</h2>
      <p>Podemos atualizar estes termos. Quando a mudança for relevante, avisaremos pelo app ou por e-mail. Continuar usando o Jakash depois da atualização significa que você concorda com a nova versão.</p>

      <h2>12. Lei aplicável e contato</h2>
      <p>Estes termos seguem as leis do Brasil. Para dúvidas, fale conosco pela página de <Link href="/contato">Contato</Link>.</p>
    </LegalPage>
  );
}
