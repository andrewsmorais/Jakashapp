// Ações que o Chat IA pode propor. Nada daqui grava no banco: o servidor só valida o que a IA devolveu
// e a pessoa confirma na tela antes de qualquer gravação (que usa a sessão dela, então o RLS vale).
import { z } from 'zod';

// Telas que o chat pode abrir. A IA escolhe só a chave; o caminho vem desta lista (nada de URL livre).
export const CHAT_PAGES = {
  dashboard: { path: '/dashboard', label: 'Dashboard' },
  transacoes: { path: '/transacoes', label: 'Transações' },
  contas_bancarias: { path: '/contas-bancarias', label: 'Contas bancárias' },
  cartoes: { path: '/cartoes', label: 'Cartões' },
  relatorios: { path: '/relatorios', label: 'Relatórios' },
  planejamento: { path: '/planejamento', label: 'Planejamento' },
  limites: { path: '/limites', label: 'Limites' },
  contas_a_pagar: { path: '/contas', label: 'Contas a pagar e receber' },
  dividas: { path: '/dividas', label: 'Dívidas' },
  comprar: { path: '/comprar', label: 'Lista de compras' },
  objetivos: { path: '/metas', label: 'Objetivos' },
  reserva: { path: '/reserva', label: 'Reserva' },
  investimentos: { path: '/investimentos', label: 'Investimentos' },
  simulador: { path: '/simulador', label: 'Simulador' },
  viagem: { path: '/viagem', label: 'Simulador de viagem' },
  importar: { path: '/importar', label: 'Importar extrato' },
  configuracoes: { path: '/configuracoes', label: 'Configurações' },
  mei: { path: '/mei', label: 'Pacote MEI' },
  mei_dasn: { path: '/mei/dasn', label: 'DASN pronta' },
  mei_clientes: { path: '/mei/clientes', label: 'Clientes e a receber' },
} as const;
export type ChatPageKey = keyof typeof CHAT_PAGES;
const pageKeys = Object.keys(CHAT_PAGES) as [ChatPageKey, ...ChatPageKey[]];

const r2 = (n: number) => Math.round(n * 100) / 100;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), 'data inválida');
// Aceita "45,5" (vírgula decimal) além de 45.5.
const money = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().replace(',', '.') : v), z.coerce.number().positive().max(max)).transform(r2);

export const txSchema = z.object({
  amount: money(10_000_000),
  description: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).nullish(),
  type: z.enum(['income', 'expense']),
  date,
});
const billSchema = z.object({
  type: z.literal('bill'),
  description: z.string().trim().min(1).max(120),
  amount: money(10_000_000),
  due_date: date,
  kind: z.enum(['expense', 'income']).default('expense'),
  recurrence: z.enum(['none', 'monthly']).default('none'),
});
const goalSchema = z.object({
  type: z.literal('goal'),
  name: z.string().trim().min(1).max(80),
  target_amount: money(100_000_000),
  deadline: date.nullish(),
});
const navSchema = z.object({ type: z.literal('navigate'), page: z.enum(pageKeys) });
const actionSchema = z.discriminatedUnion('type', [billSchema, goalSchema, navSchema]);

export type TxData = z.infer<typeof txSchema>;
// No lançamento, "type" já é a discriminante da ação; receita/despesa vai em "flow".
export type TxAction = { type: 'transaction'; flow: TxData['type']; amount: number; description: string; category?: string | null; date: string };
export type ChatAction =
  | TxAction
  | z.infer<typeof billSchema>
  | z.infer<typeof goalSchema>
  | z.infer<typeof navSchema>;

export const MAX_ACTIONS = 5;
const FALLBACK_REPLY = 'Não consegui entender direito. Pode reformular?';
const outSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  transactions: z.array(z.unknown()).max(10).optional(),
  actions: z.array(z.unknown()).max(10).optional(),
});

/** Lê o JSON devolvido pela IA e devolve só o que passou na validação (o resto é descartado). */
export function parseChatOutput(content: string | null | undefined): { reply: string; actions: ChatAction[] } {
  try {
    const out = outSchema.safeParse(JSON.parse(content || '{}'));
    if (!out.success) return { reply: FALLBACK_REPLY, actions: [] };
    const txs = (out.data.transactions ?? []).flatMap((t): ChatAction[] => {
      const r = txSchema.safeParse(t);
      if (!r.success) return [];
      const { type: flow, ...rest } = r.data;
      return [{ type: 'transaction', flow, ...rest }];
    });
    const others = (out.data.actions ?? []).flatMap((a): ChatAction[] => {
      const r = actionSchema.safeParse(a);
      return r.success ? [r.data] : [];
    });
    return { reply: out.data.reply, actions: [...txs, ...others].slice(0, MAX_ACTIONS) };
  } catch {
    return { reply: FALLBACK_REPLY, actions: [] };
  }
}

// Reaproveitados pelo lançamento por voz (src/lib/voiceDraft.ts): mesma data AAAA-MM-DD e mesmo valor ("45,5" vale).
export { date as isoDateSchema, money as moneySchema };
