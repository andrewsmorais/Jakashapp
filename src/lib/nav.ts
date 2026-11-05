// Fonte única da navegação: o menu lateral, a tela "Tudo" (/menu) e as abas das telas usam esta lista.
import {
  Home, Send, ShoppingCart, CalendarClock, Landmark, Wallet, PiggyBank, Gauge, FileText, Briefcase, Sparkles, Settings, Car, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  icon: LucideIcon;
  label: string;
  /** Destino ao tocar. */
  href: string;
  /** Rotas que deixam o item marcado como ativo (inclui `href`). */
  match: string[];
};
export type NavGroup = { title: string; items: NavItem[]; /** Só aparece para quem usa o app para a empresa. */ mei?: boolean };

export type Tab = { label: string; href: string };

// Telas que ficam juntas em abas (as rotas continuam existindo, só mudam de lugar no menu).
export const TAB_GROUPS = {
  guardar: [
    { label: "Objetivos", href: "/metas" },
    { label: "Reserva", href: "/reserva" },
    { label: "Investimentos", href: "/investimentos" },
    { label: "Simulador", href: "/simulador" },
    { label: "Viagem", href: "/viagem" },
  ],
  contas: [
    { label: "Contas bancárias", href: "/contas-bancarias" },
    { label: "Cartões", href: "/cartoes" },
    { label: "Parcelamentos", href: "/parcelamentos" },
  ],
  orcamento: [
    { label: "Limites", href: "/limites" },
    { label: "Planejamento", href: "/planejamento" },
  ],
} as const satisfies Record<string, readonly Tab[]>;
export type TabGroupKey = keyof typeof TAB_GROUPS;

const hrefs = (k: TabGroupKey) => TAB_GROUPS[k].map((t) => t.href);

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "HOJE",
    items: [
      { icon: Home, label: "Início", href: "/dashboard", match: ["/dashboard"] },
      { icon: Send, label: "Lançamentos", href: "/transacoes", match: ["/transacoes", "/importar"] },
      { icon: ShoppingCart, label: "Comprar", href: "/comprar", match: ["/comprar"] },
      { icon: CalendarClock, label: "Contas a pagar e receber", href: "/contas", match: ["/contas"] },
    ],
  },
  {
    title: "MEU DINHEIRO",
    items: [
      { icon: Wallet, label: "Contas e cartões", href: "/contas-bancarias", match: hrefs("contas") },
      { icon: Landmark, label: "Dívidas", href: "/dividas", match: ["/dividas"] },
      { icon: PiggyBank, label: "Guardar", href: "/metas", match: hrefs("guardar") },
    ],
  },
  {
    title: "PLANEJAR",
    items: [
      { icon: Gauge, label: "Orçamento do mês", href: "/limites", match: hrefs("orcamento") },
      { icon: FileText, label: "Relatórios", href: "/relatorios", match: ["/relatorios"] },
    ],
  },
  {
    title: "TRABALHO",
    items: [{ icon: Car, label: "Motorista de app", href: "/motorista", match: ["/motorista"] }],
  },
  {
    title: "EMPRESA",
    mei: true,
    items: [{ icon: Briefcase, label: "Pacote MEI", href: "/mei", match: ["/mei"] }],
  },
];

// Rodapé: sempre visível, fora dos grupos.
export const NAV_FOOTER: NavItem[] = [
  { icon: Sparkles, label: "Chat da Jaki", href: "/chat", match: ["/chat"] },
  { icon: Settings, label: "Configurações", href: "/configuracoes", match: ["/configuracoes", "/categorias"] },
];

export const groupsFor = (isMei: boolean): NavGroup[] => NAV_GROUPS.filter((g) => !g.mei || isMei);

export const isNavActive = (item: NavItem, pathname: string): boolean => item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

/** Barra de baixo no celular: o "+" fica no meio, entre as duas primeiras e as duas últimas. */
export const MOBILE_TABS: { left: NavItem[]; right: NavItem[] } = {
  left: [NAV_GROUPS[0].items[0], NAV_GROUPS[0].items[1]],
  right: [NAV_GROUPS[0].items[2]],
};
