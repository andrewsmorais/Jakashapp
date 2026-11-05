import { PLANS, PLAN_IDS, planPrice } from "@/lib/plans";

export const SITE_URL = "https://www.jakash.app";
export const INSTAGRAM_URL = "https://www.instagram.com/jakashfinancas/";

// Perguntas e respostas da landing. A MESMA lista alimenta a seção de FAQ visível e o JSON-LD (FAQPage):
// o dado estruturado nunca pode dizer algo que a página não mostra. Preços vêm de lib/plans.
export const FAQS: { q: string; a: string }[] = [
  {
    q: "O que é o Jakash e como funciona?",
    a: "O Jakash é um aplicativo para organizar o dinheiro no dia a dia. Você faz seus lançamentos, cadastra contas a pagar, cartões e parcelas, monta a lista de compras, acompanha limites, objetivos e o plano para sair das dívidas, separa as finanças do MEI e divide tudo com a família. Dentro do app, a Jaki, assistente de Inteligência Artificial, responde dúvidas sobre as suas finanças.",
  },
  {
    q: "Como a Inteligência Artificial ajuda na minha organização financeira?",
    a: "No Chat da Jaki, dentro do app, você pergunta sobre os seus gastos e limites e recebe respostas com base nos seus dados. A IA também ajuda a ler extratos, faturas e comprovantes na hora de importar. Ela pode errar, por isso vale conferir tudo antes de salvar.",
  },
  {
    q: "Quais são os planos e os preços do Jakash?",
    a: `Há dois planos, os dois com 7 dias grátis: ${PLAN_IDS.map((id) => `${PLANS[id].name} por ${planPrice(id)}/mês`).join(" e ")}. O Pessoal tem tudo para as finanças pessoais (lançamentos, cartões, contas a pagar, limites, objetivos, dívidas, investimentos, planejamento, Chat da Jaki e Motorista de app) e permite dividir com até ${PLANS.cpf.members} pessoas. O Empresarial inclui tudo do Pessoal mais o pacote MEI.`,
  },
  {
    q: "O Jakash é gratuito?",
    a: "O Jakash oferece 7 dias de teste grátis, sem cadastrar cartão de crédito. Depois disso, é preciso escolher um plano pago. Você pode cancelar a qualquer momento, sem multa.",
  },
  {
    q: "Funciona com o meu banco?",
    a: "Funciona com qualquer banco, porque você registra os lançamentos pelo app ou importa extratos, e informa o saldo das suas contas. A conexão automática com bancos (Open Finance) ainda não está disponível.",
  },
  {
    q: "Meus dados financeiros estão seguros no Jakash?",
    a: "O Jakash não pede a senha do seu banco e não movimenta dinheiro. Seus dados ficam protegidos por login e por regras de acesso individuais no banco de dados, e você pode exportar ou apagar tudo quando quiser, em Configurações › Dados.",
  },
  {
    q: "Posso dividir as finanças com minha família ou sócio?",
    a: `Sim. Nos dois planos você convida até ${PLANS.cpf.members - 1} pessoas para a mesma casa, e todos veem e editam contas, lançamentos, limites e objetivos compartilhados. Perfil, assinatura e conversas do chat continuam privados.`,
  },
  {
    q: "O Jakash serve para MEI?",
    a: "Sim. O plano Empresarial inclui o pacote MEI: controle do limite anual, DAS e DASN, clientes e valores a receber, cobrança por Pix, recibos e relatório mensal, calculadora de preço e acesso do contador. O Jakash não emite nota fiscal.",
  },
  {
    q: "Como cancelo minha assinatura?",
    a: "Em Configurações › Planos › Cancelar renovação. Você continua com acesso até o fim do período já pago e não é cobrado de novo. Nos primeiros 7 dias após a contratação você também pode pedir reembolso integral.",
  },
];

// Dados estruturados da página inicial (Schema.org). Sem avaliações, notas, endereço ou números que não temos.
export function homeJsonLd() {
  const org = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Jakash",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: [INSTAGRAM_URL],
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Jakash",
        inLanguage: "pt-BR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: "Jakash",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        description: "Aplicativo para organizar o dinheiro no dia a dia, com assistente de Inteligência Artificial dentro do app: lançamentos, contas a pagar, cartões e parcelas, lista de compras, saída das dívidas, objetivos, MEI separado e gestão compartilhada.",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: PLAN_IDS.map((id) => ({
          "@type": "Offer",
          name: PLANS[id].name,
          price: PLANS[id].value.toFixed(2),
          priceCurrency: "BRL",
          url: `${SITE_URL}/#planos`,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
