import assert from 'node:assert/strict';
import {
  CSV_BOM, DEFAULT_OPTIONS, MAX_ROWS_PER_TABLE, PAGE_SIZE, PROFILE_FORBIDDEN, applyFilters, buildFilters, buildQueryPlan, columnsFor, csvEscape, effectiveItems,
  exportFileName, fetchTask, formatCsvCell, formatDateBR, formatDateTimeBR, formatMoneyBR, formatMonthBR, formatNumberBR, profileColumns, profileRow, progressText,
  runExport, toCsv, validateOptions, DATASETS,
  type ClientLike, type ExportContext, type ExportOptions, type QueryLike, type Row,
} from '@/lib/dataExport';
import { bytesToBase64 } from '@/lib/nativeShare';

// Testes da exportação de dados (sem rede e sem banco). Rodar: npx tsx --tsconfig tsconfig.json tests/data-export.test.ts
let passed = 0;
const pending: Promise<void>[] = [];
const ok = (name: string, fn: () => void | Promise<void>) => {
  const fail = (e: unknown) => { console.error(`FALHOU: ${name}\n`, e); process.exitCode = 1; };
  try {
    const r = fn();
    if (r) pending.push(r.then(() => { passed++; }, fail)); else passed++;
  } catch (e) { fail(e); }
};

const ME = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const baseCtx: ExportContext = { userId: ME, members: { [ME]: 'Ana Souza', [PARTNER]: 'Bruno Lima' }, isMei: true, today: '2026-10-23', now: new Date('2026-10-23T17:05:00Z') };
const baseOpts = (patch: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_OPTIONS(true), ...patch });

// ---------------------------------------------------------------------------
// CSV: proteção e formato
// ---------------------------------------------------------------------------
ok('csvEscape protege caracteres de fórmula (= + - @ tab CR)', () => {
  assert.equal(csvEscape('=SOMA(A1:A2)'), "'=SOMA(A1:A2)");
  assert.equal(csvEscape('+55 11 99999'), "'+55 11 99999");
  assert.equal(csvEscape('-1+2'), "'-1+2");
  assert.equal(csvEscape('@cmd'), "'@cmd");
  assert.equal(csvEscape('\t=1'), "'\t=1");
  assert.equal(csvEscape('\r=1'), '"\'\r=1"');
});
ok('csvEscape: texto comum fica como está', () => {
  assert.equal(csvEscape('Mercado'), 'Mercado');
  assert.equal(csvEscape('a=b'), 'a=b');
  assert.equal(csvEscape(''), '');
});
ok('csvEscape: aspas dobram e a célula vai entre aspas', () => {
  assert.equal(csvEscape('Ele disse "oi"'), '"Ele disse ""oi"""');
});
ok("csvEscape: ';' e quebra de linha ficam entre aspas", () => {
  assert.equal(csvEscape('pão; leite'), '"pão; leite"');
  assert.equal(csvEscape('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
  assert.equal(csvEscape('a\r\nb'), '"a\r\nb"');
});
ok('csvEscape: fórmula com aspas e ponto e vírgula junta as duas proteções', () => {
  assert.equal(csvEscape('=HYPERLINK("x";"y")'), '"\'=HYPERLINK(""x"";""y"")"');
});
ok('toCsv começa com BOM UTF-8, usa ";" e quebra de linha do Windows', () => {
  const csv = toCsv(
    [{ key: 'a', header: 'Descrição', kind: 'text' }, { key: 'b', header: 'Valor', kind: 'money' }],
    [{ a: 'Café; pão', b: 1234.5 }, { a: '=1+1', b: -3 }],
  );
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.startsWith(CSV_BOM + 'Descrição;Valor\r\n'), true);
  assert.equal(csv, CSV_BOM + 'Descrição;Valor\r\n"Café; pão";1234,50\r\n\'=1+1;-3,00\r\n');
  assert.equal(Buffer.from(csv, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
});
ok('valor negativo em coluna de dinheiro não ganha apóstrofo (não é texto)', () => {
  assert.equal(formatCsvCell('money', -12.5), '-12,50');
  assert.equal(formatCsvCell('text', '-12,50'), "'-12,50");
});

ok('dinheiro: vírgula decimal, sem milhar, arredonda e trata vazio', () => {
  assert.equal(formatMoneyBR(1234.5), '1234,50');
  assert.equal(formatMoneyBR('99.999'), '100,00');
  assert.equal(formatMoneyBR(0), '0,00');
  assert.equal(formatMoneyBR(-0.001), '0,00');
  assert.equal(formatMoneyBR(null), '');
  assert.equal(formatMoneyBR(''), '');
  assert.equal(formatMoneyBR('abc'), '');
});
ok('número: até 3 casas com vírgula', () => {
  assert.equal(formatNumberBR(2.5), '2,5');
  assert.equal(formatNumberBR(1), '1');
  assert.equal(formatNumberBR(0.125), '0,125');
  assert.equal(formatNumberBR(1.00049), '1');
});
ok('datas: dd/mm/aaaa, mês mm/aaaa e data e hora no fuso de São Paulo', () => {
  assert.equal(formatDateBR('2026-03-09'), '09/03/2026');
  assert.equal(formatMonthBR('2026-11-01'), '11/2026');
  assert.equal(formatDateTimeBR('2026-10-23T17:05:00+00:00'), '23/10/2026 14:05');
  // 02:30 UTC ainda é o dia anterior em São Paulo
  assert.equal(formatDateBR('2026-10-23T02:30:00.123456+00:00'), '22/10/2026');
  assert.equal(formatDateBR(null), '');
});
ok('booleano em português', () => {
  assert.equal(formatCsvCell('bool', true), 'Sim');
  assert.equal(formatCsvCell('bool', false), 'Não');
  assert.equal(formatCsvCell('bool', null), '');
});
ok('nome do arquivo: jakash-dados-AAAA-MM-DD.zip / .json', () => {
  assert.equal(exportFileName('csv', '2026-10-23'), 'jakash-dados-2026-10-23.zip');
  assert.equal(exportFileName('json', '2026-10-23'), 'jakash-dados-2026-10-23.json');
});
ok('progresso: "Lendo lançamentos… 2.000"', () => {
  assert.equal(progressText({ label: 'lançamentos', count: 2000 }), 'Lendo lançamentos… 2.000');
});
ok('bytesToBase64 (arquivos grandes, em pedaços)', () => {
  const big = new Uint8Array(100_000).map((_, i) => i % 251);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'));
  assert.equal(bytesToBase64(new Uint8Array([80, 75, 3, 4])), 'UEsDBA==');
});

// ---------------------------------------------------------------------------
// Filtros e plano de consulta
// ---------------------------------------------------------------------------
ok('filtro: sem datas e sem marcar a casa, só o dono da linha', () => {
  const f = buildFilters('transactions', baseOpts(), ME);
  assert.deepEqual(f, [{ op: 'eq', column: 'user_id', value: ME }]);
});
ok('filtro: casa ligada não filtra por dono (vale o que a RLS devolver)', () => {
  assert.deepEqual(buildFilters('transactions', baseOpts({ household: true }), ME), []);
  assert.deepEqual(buildFilters('categories', baseOpts({ household: true }), ME), []);
});
ok('filtro: período inclui as duas pontas e usa a coluna de data de cada tabela', () => {
  const o = baseOpts({ household: true, from: '2026-01-01', to: '2026-03-31' });
  assert.deepEqual(buildFilters('transactions', o, ME), [{ op: 'gte', column: 'date', value: '2026-01-01' }, { op: 'lte', column: 'date', value: '2026-03-31' }]);
  assert.deepEqual(buildFilters('bills', o, ME).map((x) => x.column), ['due_date', 'due_date']);
  assert.deepEqual(buildFilters('goal_contributions', o, ME).map((x) => x.column), ['date', 'date']);
  assert.deepEqual(buildFilters('debt_payments', o, ME).map((x) => x.column), ['paid_on', 'paid_on']);
  assert.deepEqual(buildFilters('investment_movements', o, ME).map((x) => x.column), ['moved_on', 'moved_on']);
  assert.deepEqual(buildFilters('card_invoice_payments', o, ME).map((x) => x.column), ['paid_on', 'paid_on']);
  assert.deepEqual(buildFilters('mei_invoices', o, ME).map((x) => x.column), ['invoice_date', 'invoice_date']);
  assert.deepEqual(buildFilters('mei_suppliers', o, ME), []); // cadastro: sem data, não filtra por período
  assert.deepEqual(buildFilters('goals', o, ME), []); // sem data: não filtra
  assert.deepEqual(buildFilters('budgets', o, ME), []);
});
ok('filtro: só "de" ou só "até"', () => {
  assert.deepEqual(buildFilters('transactions', baseOpts({ household: true, from: '2026-05-01' }), ME), [{ op: 'gte', column: 'date', value: '2026-05-01' }]);
  assert.deepEqual(buildFilters('transactions', baseOpts({ household: true, to: '2026-05-31' }), ME), [{ op: 'lte', column: 'date', value: '2026-05-31' }]);
});
ok('filtro: Pessoal / Empresa / Ambos só onde existe is_business', () => {
  const h = { household: true } as const;
  assert.deepEqual(buildFilters('transactions', baseOpts({ ...h, scope: 'pessoal' }), ME), [{ op: 'eq', column: 'is_business', value: false }]);
  assert.deepEqual(buildFilters('transactions', baseOpts({ ...h, scope: 'empresa' }), ME), [{ op: 'eq', column: 'is_business', value: true }]);
  assert.deepEqual(buildFilters('transactions', baseOpts({ ...h, scope: 'ambos' }), ME), []);
  for (const t of ['accounts', 'credit_cards', 'bills', 'shopping_lists']) assert.equal(buildFilters(t, baseOpts({ ...h, scope: 'empresa' }), ME).length, 1, t);
  for (const t of ['debts', 'goals', 'budgets', 'investments', 'investment_movements', 'categories']) assert.equal(buildFilters(t, baseOpts({ ...h, scope: 'empresa' }), ME).length, 0, t);
});
ok('filtro: categorias sem a casa ficam com as padrão (sem dono) e as suas', () => {
  assert.deepEqual(buildFilters('categories', baseOpts(), ME), [{ op: 'eq_or_null', column: 'user_id', value: ME }]);
});
ok('filtro: sem usuário e sem a casa dá erro (nunca exporta de todo mundo)', () => {
  assert.throws(() => buildFilters('transactions', baseOpts(), ''));
});
ok('applyFilters na memória segue as mesmas regras', () => {
  const rows = [{ user_id: ME, b: true }, { user_id: PARTNER, b: false }, { user_id: null, b: false }];
  assert.equal(applyFilters(rows, [{ op: 'eq', column: 'user_id', value: ME }]).length, 1);
  assert.equal(applyFilters(rows, [{ op: 'eq_or_null', column: 'user_id', value: ME }]).length, 2);
  assert.equal(applyFilters(rows, [{ op: 'eq', column: 'b', value: false }]).length, 2);
  assert.equal(applyFilters(rows, [{ op: 'not_null', column: 'user_id' }]).length, 2);
});
ok('plano: lançamentos filtram no servidor (casa, empresa e período) e trazem as tabelas de nomes', () => {
  const plan = buildQueryPlan(baseOpts({ items: ['transactions'], scope: 'empresa', from: '2026-01-01', to: '2026-12-31' }), baseCtx);
  const ids = plan.map((p) => p.id);
  assert.deepEqual(ids, ['categories', 'accounts', 'credit_cards', 'mei_clients', 'mei_suppliers', 'transactions']);
  const tx = plan.find((p) => p.id === 'transactions')!;
  assert.deepEqual(tx.filters, [
    { op: 'eq', column: 'user_id', value: ME }, { op: 'eq', column: 'is_business', value: true },
    { op: 'gte', column: 'date', value: '2026-01-01' }, { op: 'lte', column: 'date', value: '2026-12-31' },
  ]);
  // tabelas de nomes são lidas inteiras (o nome de uma conta pessoal pode aparecer num lançamento da empresa)
  for (const id of ['categories', 'accounts', 'credit_cards', 'mei_clients', 'mei_suppliers']) assert.deepEqual(plan.find((p) => p.id === id)!.filters, [], id);
  assert.equal(plan.find((p) => p.id === 'accounts')!.local.length, 2);
});
ok('plano: só lê o que os itens escolhidos pedem', () => {
  const plan = buildQueryPlan(baseOpts({ items: ['goals'] }), baseCtx);
  assert.deepEqual(plan.map((p) => p.id), ['goals', 'goal_contributions']);
  assert.deepEqual(buildQueryPlan(baseOpts({ items: ['profile'] }), baseCtx).map((p) => p.id), ['profile']);
});
ok('plano: parcelamentos ignoram o período e só pegam compras parceladas', () => {
  const plan = buildQueryPlan(baseOpts({ items: ['installments'], from: '2026-01-01', to: '2026-01-31', household: true }), baseCtx);
  const inst = plan.find((p) => p.id === 'installment_rows')!;
  assert.deepEqual(inst.filters, [{ op: 'not_null', column: 'installment_group' }]);
});
ok('plano: saldo vem da função account_balances', () => {
  const plan = buildQueryPlan(baseOpts({ items: ['accounts'] }), baseCtx);
  const bal = plan.find((p) => p.id === 'account_balances')!;
  assert.equal(bal.kind, 'rpc');
  assert.equal(bal.table, 'account_balances');
});
ok('plano: pacote MEI só para quem usa o app para a empresa', () => {
  const ctx = { ...baseCtx, isMei: false };
  assert.deepEqual(effectiveItems(baseOpts({ items: ['mei', 'goals'] }), ctx), ['goals']);
  assert.equal(buildQueryPlan(baseOpts({ items: ['mei'] }), ctx).length, 0);
  assert.equal(validateOptions(baseOpts({ items: ['mei'] }), ctx), 'Escolha ao menos um item.');
  assert.equal(buildQueryPlan(baseOpts({ items: ['transactions'] }), ctx).some((p) => p.id === 'mei_clients' || p.id === 'mei_suppliers' || p.id === 'mei_items'), false);
  assert.deepEqual(buildQueryPlan(baseOpts({ items: ['mei'] }), baseCtx).map((p) => p.id), ['mei_clients', 'mei_suppliers', 'mei_invoices', 'mei_items']);
});
ok('opções: validação em português', () => {
  assert.equal(validateOptions(baseOpts(), baseCtx), null);
  assert.equal(validateOptions(baseOpts({ items: [] }), baseCtx), 'Escolha ao menos um item.');
  assert.equal(validateOptions(baseOpts({ from: '2026-02-30' }), baseCtx), 'A data inicial não é válida.');
  assert.equal(validateOptions(baseOpts({ from: '2026-05-02', to: '2026-05-01' }), baseCtx), 'A data inicial vem depois da final.');
});
ok('nenhum item do plano menciona WhatsApp', () => {
  const plan = buildQueryPlan(baseOpts({ household: true }), baseCtx);
  const text = JSON.stringify(plan) + JSON.stringify(DATASETS.map((d) => d.columns));
  assert.equal(/whatsapp|chat_history/i.test(text), false);
});

// ---------------------------------------------------------------------------
// Perfil: nunca sai dado sensível
// ---------------------------------------------------------------------------
ok('perfil: a consulta não pede nenhuma coluna sensível', () => {
  for (const isMei of [false, true]) {
    const cols = profileColumns(isMei);
    for (const bad of PROFILE_FORBIDDEN) assert.equal(cols.includes(bad), false, `${bad} (isMei=${isMei})`);
  }
  const plan = buildQueryPlan(baseOpts({ items: ['profile'] }), baseCtx).find((p) => p.id === 'profile')!;
  for (const bad of PROFILE_FORBIDDEN) assert.equal(plan.columns.split(',').includes(bad), false, bad);
});
ok('perfil: os dados fiscais do negócio só saem para quem usa o app para a empresa', () => {
  const novas = ['business_municipio', 'business_uf', 'business_im', 'business_cep', 'business_address'];
  for (const col of novas) {
    assert.equal(profileColumns(true).includes(col), true, col);
    assert.equal(profileColumns(false).includes(col), false, col);
  }
  const dsCols = columnsFor(DATASETS.find((d) => d.id === 'profile')!, { household: false }, { isMei: false }).map((c) => c.key);
  assert.equal(dsCols.some((k) => /negocio_(municipio|uf|inscricao|cep|endereco)/.test(k)), false);
  const row = profileRow({ business_municipio: 'Campinas', business_uf: 'SP', business_im: '12345', business_cep: '13010000', business_address: 'Rua das Flores, 10', cpf: '123.456.789-00' });
  assert.equal(row.negocio_municipio, 'Campinas');
  assert.equal(row.negocio_endereco, 'Rua das Flores, 10');
  assert.equal(JSON.stringify(row).includes('123.456.789-00'), false);
});
ok('perfil: mesmo que o banco devolva tudo, a linha exportada só tem campos seguros', () => {
  const dirty = {
    id: ME, full_name: 'Ana Souza', usage_type: 'ambos', language: 'pt', currency: 'BRL', birth_date: '1990-04-05', accent: 'violet',
    notify_enabled: true, notify_email: true, notify_push: false, notify_when: '3_days', created_at: '2026-01-02T10:00:00Z',
    cpf_cnpj: '123.456.789-00', whatsapp_number: '+5511999990000', asaas_customer_id: 'cus_SEGREDO1', asaas_subscription_id: 'sub_SEGREDO2',
    apple_original_transaction_id: 'apple_SEGREDO3', billing_provider: 'apple', subscription_status: 'active', subscription_plan: 'mei',
    pix_key: 'chave-pix-SEGREDO4', referral_code: 'REF-SEGREDO5', is_admin: true, notify_whatsapp: true, token: 'tok_SEGREDO6',
  };
  const row = profileRow(dirty);
  const json = JSON.stringify(row);
  for (const secret of ['123.456.789-00', '+5511999990000', 'SEGREDO', 'apple', 'asaas', 'is_admin', ME]) assert.equal(json.includes(secret), false, secret);
  assert.equal(row.nome, 'Ana Souza');
  assert.equal(row.tipo_de_uso, 'Pessoal e empresa');
  assert.equal(row.avisos_quando, '3 dias antes');
  const headers = columnsFor(DATASETS.find((d) => d.id === 'profile')!, { household: true }, { isMei: true }).map((c) => c.key);
  assert.equal(headers.some((k) => /cpf|whats|asaas|apple|billing|admin|pix|token|assin|plano/i.test(k)), false);
});

// ---------------------------------------------------------------------------
// Leitura paginada (cliente de mentira)
// ---------------------------------------------------------------------------
type Op = { op: string; args: unknown[] };
function fakeClient(tables: Record<string, Record<string, unknown>[]>, rpcs: Record<string, unknown[]> = {}, log: { table: string; ops: Op[] }[] = [], failTables: string[] = []): ClientLike {
  const make = (table: string): QueryLike => {
    const ops: Op[] = [];
    log.push({ table, ops });
    let single = false;
    const q: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => { ops.push({ op: name, args }); if (name === 'maybeSingle') single = true; return q; };
    for (const n of ['eq', 'gte', 'lte', 'not', 'or', 'order', 'range', 'maybeSingle']) q[n] = chain(n);
    q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      if (failTables.includes(table)) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(res, rej);
      let rows = [...(tables[table] ?? [])];
      for (const o of ops) {
        const [col, val] = o.args as [string, unknown];
        if (o.op === 'eq') rows = rows.filter((r) => r[col] === val);
        if (o.op === 'gte') rows = rows.filter((r) => String(r[col]) >= String(val));
        if (o.op === 'lte') rows = rows.filter((r) => String(r[col]) <= String(val));
        if (o.op === 'not') rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
      }
      const range = ops.find((o) => o.op === 'range');
      if (range) rows = rows.slice(range.args[0] as number, (range.args[1] as number) + 1);
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
    };
    return q as unknown as QueryLike;
  };
  return {
    from: (table: string) => ({ select: () => make(table) }),
    rpc: (fn: string) => {
      const q: Record<string, unknown> = {};
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: rpcs[fn] ?? [], error: null }).then(res, rej);
      return q as unknown as QueryLike;
    },
  };
}

const task = (id = 'transactions') => buildQueryPlan(baseOpts({ items: ['transactions'], household: true }), baseCtx).find((p) => p.id === id)!;

ok('leitura pagina de 1000 em 1000 e conta o progresso', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `t${i}` }));
  const log: { table: string; ops: Op[] }[] = [];
  const counts: number[] = [];
  const res = await fetchTask(fakeClient({ transactions: rows }, {}, log), task(), (n) => counts.push(n));
  assert.equal(res.rows.length, 2500);
  assert.equal(res.capped, false);
  assert.deepEqual(counts, [1000, 2000, 2500]);
  const ranges = log.map((l) => l.ops.find((o) => o.op === 'range')!.args);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  // ordem estável: data e depois id
  assert.deepEqual(log[0].ops.filter((o) => o.op === 'order').map((o) => (o.args as string[])[0]), ['date', 'id']);
});
ok('leitura: 1000 linhas exatas pedem mais uma página vazia e acabam', async () => {
  const res = await fetchTask(fakeClient({ transactions: Array.from({ length: 1000 }, (_, i) => ({ id: `t${i}` })) }), task(), () => {});
  assert.equal(res.rows.length, 1000);
  assert.equal(res.capped, false);
});
ok('leitura: passou de 50 mil, corta e avisa', async () => {
  const total = MAX_ROWS_PER_TABLE + 5;
  const res = await fetchTask(fakeClient({ transactions: Array.from({ length: total }, (_, i) => ({ id: `t${i}` })) }), task(), () => {});
  assert.equal(res.rows.length, MAX_ROWS_PER_TABLE);
  assert.equal(res.capped, true);
  assert.equal(PAGE_SIZE, 1000);
});
ok('leitura: exatamente 50 mil não conta como cortado', async () => {
  const res = await fetchTask(fakeClient({ transactions: Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({ id: `t${i}` })) }), task(), () => {});
  assert.equal(res.rows.length, MAX_ROWS_PER_TABLE);
  assert.equal(res.capped, false);
});
ok('leitura: erro vira mensagem em português com o nome da tabela', async () => {
  await assert.rejects(fetchTask(fakeClient({}, {}, [], ['transactions']), task(), () => {}), /Não foi possível ler lançamentos\./);
});
ok('leitura: cancelar para antes de pedir a próxima página', async () => {
  const signal = { aborted: false };
  const rows = Array.from({ length: 3000 }, (_, i) => ({ id: `t${i}` }));
  await assert.rejects(fetchTask(fakeClient({ transactions: rows }), task(), () => { signal.aborted = true; }, signal), /cancelada/);
});

// ---------------------------------------------------------------------------
// Exportação completa com dados de mentira
// ---------------------------------------------------------------------------
const DATA: Record<string, Record<string, unknown>[]> = {
  categories: [
    { id: 'c-alim', user_id: null, name: 'Alimentação', type: 'expense', is_default: true, parent_id: null },
    { id: 'c-mer', user_id: null, name: 'Supermercado', type: 'expense', is_default: true, parent_id: 'c-alim' },
    { id: 'c-meu', user_id: ME, name: '=Minha categoria', type: 'expense', is_default: false, parent_id: null },
    { id: 'c-par', user_id: PARTNER, name: 'Só do Bruno', type: 'expense', is_default: false, parent_id: null },
    { id: 'c-sal', user_id: null, name: 'Salário', type: 'income', is_default: true, parent_id: null },
  ],
  category_flags: [{ user_id: ME, category_id: 'c-meu', is_essential: true, is_benefit: null }, { user_id: PARTNER, category_id: 'c-par', is_essential: true, is_benefit: null }],
  accounts: [
    { id: 'a1', user_id: ME, name: 'Nubank', kind: 'corrente', initial_balance: 100, archived: false, is_business: false, institution: 'nubank', created_at: '2026-01-01T12:00:00Z' },
    { id: 'a2', user_id: ME, name: 'Conta MEI', kind: 'corrente', initial_balance: 0, archived: false, is_business: true, institution: null, created_at: '2026-02-01T12:00:00Z' },
    { id: 'a3', user_id: PARTNER, name: 'Conta do Bruno', kind: 'poupanca', initial_balance: 50, archived: true, is_business: false, institution: null, created_at: '2026-03-01T12:00:00Z' },
  ],
  credit_cards: [
    { id: 'k1', user_id: ME, name: 'Roxinho', brand: 'mastercard', credit_limit: 5000, closing_day: 25, due_day: 5, pay_account_id: 'a1', archived: false, kind: 'credito', is_business: false, institution: 'nubank', created_at: '2026-01-02T12:00:00Z' },
  ],
  card_invoice_payments: [
    { id: 'p1', user_id: ME, card_id: 'k1', invoice_month: '2026-10-01', amount: 321.1, paid_on: '2026-10-05', account_id: 'a1' },
    { id: 'p2', user_id: PARTNER, card_id: 'k1', invoice_month: '2026-09-01', amount: 10, paid_on: '2026-09-05', account_id: null },
  ],
  transactions: [
    { id: 't1', user_id: ME, category_id: 'c-mer', amount: 87.9, description: 'Compra; "do mês"', type: 'expense', date: '2026-10-10', is_recurring: false, account_id: 'a1', card_id: null, debit_card_id: null, invoice_month: null, installment_number: null, installment_total: null, is_business: false, attachment_name: null, revenue_kind: null, client_id: null, is_owner_draw: false },
    { id: 't2', user_id: ME, category_id: null, amount: 3000, description: '=cmd|calc', type: 'income', date: '2026-09-30', is_recurring: true, account_id: 'a2', card_id: null, debit_card_id: null, invoice_month: null, installment_number: null, installment_total: null, is_business: true, attachment_name: 'nota.pdf', revenue_kind: 'servicos', client_id: 'm1', is_owner_draw: false },
    { id: 't3', user_id: ME, category_id: 'c-alim', amount: 100, description: 'TV (1/3)', type: 'expense', date: '2026-08-12', is_recurring: false, account_id: null, card_id: 'k1', debit_card_id: null, invoice_month: '2026-09-01', installment_group: 'grp1', installment_number: 1, installment_total: 3, is_business: false, attachment_name: null, revenue_kind: null, client_id: null, is_owner_draw: false },
    { id: 't4', user_id: PARTNER, category_id: 'c-par', amount: 40, description: 'Do Bruno', type: 'expense', date: '2026-10-11', is_recurring: false, account_id: 'a3', card_id: null, debit_card_id: null, invoice_month: null, installment_number: null, installment_total: null, is_business: false, attachment_name: null, revenue_kind: null, client_id: null, is_owner_draw: false },
  ],
  mei_clients: [{ id: 'm1', user_id: ME, name: 'Cliente Ltda', document: '12.345.678/0001-90', phone: '11 4000-0000', email: 'c@x.com', notes: null, archived: false, created_at: '2026-02-01T12:00:00Z', cep: '01310100', address: 'Av. Paulista', address_number: '1000', address_complement: 'Sala 2', neighborhood: 'Bela Vista', city: 'São Paulo', uf: 'SP' }],
  mei_suppliers: [{ id: 'f1', user_id: ME, name: 'Embalagens Sul', document: '12345678000190', phone: '51 3000-0000', email: null, pix_key: '12345678000190', category: 'Embalagens', notes: null, archived: false, created_at: '2026-03-01T12:00:00Z' }],
  mei_items: [
    { id: 'p1', user_id: ME, kind: 'servico', name: 'Consultoria', description: 'Hora de consultoria', unit_price: 150, unit: 'h', ctrib_nac: '17.01.01', nbs: '1.1506.21.00', municipal_code: '001', ncm: null, cfop: null, archived: false, created_at: '2026-03-01T12:00:00Z' },
    { id: 'p2', user_id: ME, kind: 'produto', name: '=Camiseta', description: null, unit_price: 49.9, unit: 'un', ctrib_nac: null, nbs: null, municipal_code: null, ncm: '61091000', cfop: '5102', archived: true, created_at: '2026-03-02T12:00:00Z' },
  ],
  mei_invoices: [{ id: 'i1', user_id: ME, invoice_number: 7, client_id: 'm1', client_name: 'antigo', value: 500, invoice_date: '2026-09-15', notes: 'obs' }],
  bills: [{ id: 'b1', user_id: ME, description: 'Luz', amount: 150, due_date: '2026-10-20', type: 'expense', recurrence: 'monthly', status: 'pending', paid_at: null, is_business: false, revenue_kind: null, client_id: null, debt_id: null, created_at: '2026-10-01T10:00:00Z' }],
  debts: [{ id: 'd1', user_id: ME, name: 'Empréstimo', kind: 'emprestimo', balance: 900, monthly_rate: 2.5, min_payment: 80, archived: false, creditor: 'Banco', original_amount: 1000, status: 'atrasada', overdue_since: '2026-08-01', essential: false, cash_offer: null, agreement_installments: null, agreement_amount: null, agreement_first_due: null, created_at: '2026-01-01T10:00:00Z' }],
  debt_payments: [{ id: 'dp1', debt_id: 'd1', amount: 100, paid_on: '2026-09-01' }, { id: 'dp2', debt_id: 'd-outro', amount: 5, paid_on: '2026-09-01' }],
  goals: [{ id: 'g1', user_id: ME, name: 'Viagem', type: 'viagem', target_amount: 5000, current_amount: 700, deadline: '2027-01-01', status: 'in_progress', metadata: { destino: 'Lisboa' }, created_at: '2026-01-01T10:00:00Z' }],
  goal_contributions: [{ id: 'gc1', goal_id: 'g1', amount: 700, date: '2026-10-01' }, { id: 'gc2', goal_id: 'g-outro', amount: 1, date: '2026-10-01' }],
  budgets: [{ id: 'u1', user_id: ME, category_id: null, amount_limit: 2500 }, { id: 'u2', user_id: ME, category_id: 'c-mer', amount_limit: 800 }],
  investments: [{ id: 'v1', user_id: ME, name: 'Tesouro Selic', kind: 'tesouro', institution: 'Banco', invested: 1000, current_value: 1100.5, archived: false, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }],
  investment_movements: [{ id: 'im1', user_id: ME, investment_id: 'v1', kind: 'aporte', amount: 1000, moved_on: '2026-02-01', account_id: 'a1', note: null, value_after: 1000 }],
  shopping_lists: [{ id: 's1', user_id: ME, name: 'Mercado', is_business: false, status: 'done', transaction_id: 't1', created_at: '2026-10-09T10:00:00Z', finished_at: '2026-10-10T10:00:00Z' }],
  shopping_items: [{ id: 'si1', list_id: 's1', name: 'Arroz', quantity: 2, unit: 'kg', est_price: 12.9, checked: true, checked_at: '2026-10-10T09:00:00Z' }],
  profiles: [{ id: ME, full_name: 'Ana Souza', usage_type: 'ambos', language: 'pt', currency: 'BRL', birth_date: null, accent: null, notify_enabled: true, notify_email: true, notify_push: false, notify_when: 'on_due', created_at: '2026-01-01T10:00:00Z', business_name: 'Ana ME', business_cnpj: '00.000.000/0001-00', mei_activity: 'servicos', mei_opened_on: '2025-01-01', mei_annual_limit: 81000, business_municipio: 'Campinas', business_uf: 'SP', business_im: '12345', business_cep: '13010000', business_address: 'Rua das Flores, 10, Centro' }],
};
const RPCS = { account_balances: [{ id: 'a1', name: 'Nubank', kind: 'corrente', balance: 1234.56 }, { id: 'a2', name: 'Conta MEI', kind: 'corrente', balance: 3000 }] };

async function unzip(data: Uint8Array): Promise<Record<string, string>> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) out[name] = await zip.files[name].async('string');
  return out;
}

ok('CSV em .zip: um arquivo por item, BOM, ";" e LEIA-ME', async () => {
  const r = await runExport(fakeClient(DATA, RPCS), baseOpts(), baseCtx);
  assert.equal(r.fileName, 'jakash-dados-2026-10-23.zip');
  assert.equal(r.mime, 'application/zip');
  const files = await unzip(r.data as Uint8Array);
  assert.deepEqual(Object.keys(files).sort(), [
    'LEIA-ME.txt', 'aportes-dos-objetivos.csv', 'cartoes.csv', 'categorias.csv', 'contas-a-pagar-e-receber.csv', 'contas-bancarias.csv', 'dividas.csv', 'investimentos.csv',
    'itens-das-listas-de-compras.csv', 'lancamentos.csv', 'limites-do-mes.csv', 'listas-de-compras.csv', 'mei-clientes.csv', 'mei-fornecedores.csv', 'mei-produtos-e-servicos.csv', 'mei-recibos.csv', 'motorista-carros.csv', 'motorista-dias.csv', 'movimentacoes-de-investimentos.csv',
    'objetivos.csv', 'pagamentos-de-divida.csv', 'pagamentos-de-fatura.csv', 'parcelamentos.csv', 'perfil.csv',
  ]);
  for (const [name, text] of Object.entries(files)) assert.equal(text.charCodeAt(0), 0xfeff, `${name} sem BOM`);

  const lanc = files['lancamentos.csv'].split('\r\n');
  assert.equal(lanc[0], CSV_BOM + 'Data;Descrição;Tipo;Valor;Categoria;Subcategoria;Conta;Cartão de crédito;Cartão de débito;Fatura (mês de vencimento);Parcela;Total de parcelas;Pessoal/Empresa;Tipo de receita (MEI);Cliente;Fornecedor;Retirada do sócio;Recorrente;Nome do anexo');
  // só as linhas do usuário (a do Bruno fica de fora com a casa desligada)
  assert.equal(lanc.length, 3 + 1 + 1); // cabeçalho + 3 + linha final vazia
  assert.equal(lanc[1], '10/10/2026;"Compra; ""do mês""";Despesa;87,90;Alimentação;Supermercado;Nubank;;;;;;Pessoal;;;;Não;Não;');
  assert.equal(lanc[2], "30/09/2026;'=cmd|calc;Receita;3000,00;Sem categoria;;Conta MEI;;;;;;Empresa;Serviços;Cliente Ltda;;Não;Sim;nota.pdf");
  assert.equal(lanc[3], '12/08/2026;TV (1/3);Despesa;100,00;Alimentação;;;Roxinho;;09/2026;1;3;Pessoal;;;;Não;Não;');
  assert.equal(files['lancamentos.csv'].includes('Do Bruno'), false);

  assert.match(files['contas-bancarias.csv'], /Nubank;Conta corrente;Nubank;100,00;1234,56;Pessoal;Não;01\/01\/2026/);
  assert.equal(files['contas-bancarias.csv'].includes('Conta do Bruno'), false);
  assert.match(files['pagamentos-de-fatura.csv'], /Roxinho;10\/2026;321,10;05\/10\/2026;Nubank;Pessoal/);
  assert.equal(files['pagamentos-de-fatura.csv'].split('\r\n').length, 3);
  assert.match(files['pagamentos-de-divida.csv'], /Empréstimo;100,00;01\/09\/2026/);
  assert.equal(files['pagamentos-de-divida.csv'].includes('5,00'), false); // pagamento de dívida que não é seu
  assert.equal(files['aportes-dos-objetivos.csv'].split('\r\n').length, 3);
  assert.match(files['objetivos.csv'], /Viagem;Viagem;Em andamento;5000,00;700,00;01\/01\/2027;"\{""destino"":""Lisboa""\}"/);
  assert.match(files['limites-do-mes.csv'], /Limite geral do mês;;2500,00/);
  assert.match(files['limites-do-mes.csv'], /Alimentação;Supermercado;800,00/);
  assert.match(files['dividas.csv'], /Empréstimo;Empréstimo;Banco;Atrasada;900,00;1000,00;2,5;80,00;01\/08\/2026/);
  assert.match(files['investimentos.csv'], /Tesouro Selic;Tesouro Direto;Banco;1000,00;1100,50;100,50/);
  assert.match(files['movimentacoes-de-investimentos.csv'], /01\/02\/2026;Tesouro Selic;Aporte;1000,00;1000,00;Nubank/);
  assert.match(files['itens-das-listas-de-compras.csv'], /Mercado;Arroz;2;kg;12,90;Sim;10\/10\/2026/);
  assert.match(files['mei-recibos.csv'], /7;15\/09\/2026;Cliente Ltda;500,00;obs/);
  assert.match(files['mei-clientes.csv'], /Cliente Ltda;12\.345\.678\/0001-90;11 4000-0000;c@x\.com;01310100;Av\. Paulista;1000;Sala 2;Bela Vista;São Paulo;SP;/);
  assert.equal(files['mei-fornecedores.csv'], CSV_BOM + 'Fornecedor;O que fornece;CPF/CNPJ;Telefone;E-mail;Chave Pix;Observações;Arquivado;Criado em\r\nEmbalagens Sul;Embalagens;12345678000190;51 3000-0000;;12345678000190;;Não;01/03/2026\r\n');
  // catálogo de produtos e serviços (arquivados também saem; fórmula protegida)
  const cat = files['mei-produtos-e-servicos.csv'].split('\r\n');
  assert.equal(cat[0], CSV_BOM + 'Tipo;Nome;Descrição;Valor padrão;Unidade;Código de tributação nacional (serviço);Item da NBS (serviço);Código complementar do município (serviço);NCM (produto);CFOP (produto);Arquivado;Criado em');
  assert.equal(cat[1], 'Serviço;Consultoria;Hora de consultoria;150,00;h;17.01.01;1.1506.21.00;001;;;Não;01/03/2026');
  assert.equal(cat[2], "Produto;'=Camiseta;;49,90;un;;;;61091000;5102;Sim;02/03/2026");
  assert.match(files['parcelamentos.csv'], /TV;Roxinho;100,00;3;300,00;/);
  assert.match(files['parcelamentos.csv'], /09\/2026/);
  // categorias: próprias e padrão; a do parceiro não entra com a casa desligada; fórmula protegida
  assert.match(files['categorias.csv'], /Despesa;'=Minha categoria;;Criada por você;Sim;/);
  assert.equal(files['categorias.csv'].includes('Só do Bruno'), false);
  assert.match(files['categorias.csv'], /Despesa;Alimentação;Supermercado;Padrão do Jakash;Sim;/);
  assert.equal(files['perfil.csv'].includes('cpf'), false);

  const readme = files['LEIA-ME.txt'];
  assert.match(readme, /Exportado em: 23\/10\/2026 14:05/);
  assert.match(readme, /Período: Tudo/);
  assert.match(readme, /Só os seus dados/);
  assert.match(readme, /lancamentos\.csv: .*\(3 linhas\)/);
  assert.match(readme, /Os parcelamentos não usam o filtro de período/);
  assert.equal(r.totalRows, r.summary.reduce((s, l) => s + l.count, 0));
  assert.equal(r.summary.find((s) => s.id === 'transactions')!.count, 3);
});

ok('casa ligada: traz as linhas do parceiro e a coluna Pessoa', async () => {
  const r = await runExport(fakeClient(DATA, RPCS), baseOpts({ household: true, items: ['transactions', 'categories'] }), baseCtx);
  const files = await unzip(r.data as Uint8Array);
  const lanc = files['lancamentos.csv'].split('\r\n');
  assert.equal(lanc[0].startsWith(CSV_BOM + 'Pessoa;Data;'), true);
  assert.equal(lanc.length, 4 + 1 + 1);
  assert.match(files['lancamentos.csv'], /Bruno Lima;11\/10\/2026;Do Bruno;Despesa;40,00;Só do Bruno;;Conta do Bruno/);
  assert.match(files['lancamentos.csv'], /Ana Souza;10\/10\/2026/);
  assert.match(files['categorias.csv'], /Criada por Bruno Lima/);
  assert.match(files['LEIA-ME.txt'], /Você e as outras pessoas da casa/);
});

ok('Empresa: só lançamentos da empresa, mas o nome da conta pessoal ainda aparece quando citado', async () => {
  const data = structuredClone(DATA);
  data.transactions[1].account_id = 'a1'; // lançamento da empresa pago de uma conta pessoal
  const r = await runExport(fakeClient(data, RPCS), baseOpts({ items: ['transactions', 'accounts', 'invoice_payments'], scope: 'empresa' }), baseCtx);
  const files = await unzip(r.data as Uint8Array);
  const lanc = files['lancamentos.csv'].split('\r\n');
  assert.equal(lanc.length, 1 + 1 + 1);
  assert.match(lanc[1], /Receita;3000,00;Sem categoria;;Nubank;/);
  assert.equal(files['contas-bancarias.csv'].split('\r\n').length, 3); // só Conta MEI
  assert.match(files['contas-bancarias.csv'], /Conta MEI/);
  assert.equal(files['contas-bancarias.csv'].includes('Nubank;Conta corrente'), false);
  assert.equal(files['pagamentos-de-fatura.csv'].split('\r\n').length, 2); // cartão é pessoal: nenhum pagamento da empresa
  assert.match(files['LEIA-ME.txt'], /Tipo: Só empresa/);
});

ok('perfil: a consulta e o arquivo do MEI trazem município, UF, inscrição municipal, CEP e endereço', async () => {
  const plan = buildQueryPlan(baseOpts({ items: ['profile'] }), baseCtx).find((p) => p.id === 'profile')!;
  for (const col of ['business_municipio', 'business_uf', 'business_im', 'business_cep', 'business_address']) assert.equal(plan.columns.split(',').includes(col), true, col);
  const r = await runExport(fakeClient(DATA, RPCS), baseOpts({ items: ['profile'] }), baseCtx);
  const files = await unzip(r.data as Uint8Array);
  assert.match(files['perfil.csv'], /Município do negócio;UF do negócio;Inscrição municipal do negócio;CEP do negócio;Endereço do negócio/);
  assert.match(files['perfil.csv'], /Campinas;SP;12345;13010000;"?Rua das Flores, 10, Centro"?/);
});
ok('período chega na consulta e filtra lançamentos, contas a pagar e recibos', async () => {
  const log: { table: string; ops: Op[] }[] = [];
  const r = await runExport(fakeClient(DATA, RPCS, log), baseOpts({ items: ['transactions', 'bills', 'mei'], from: '2026-10-01', to: '2026-10-31' }), baseCtx);
  const files = await unzip(r.data as Uint8Array);
  assert.equal(files['lancamentos.csv'].split('\r\n').length, 1 + 1 + 1);
  assert.match(files['contas-a-pagar-e-receber.csv'], /20\/10\/2026;Luz/);
  assert.equal(files['mei-recibos.csv'].split('\r\n').length, 2); // recibo de setembro fica de fora
  const txOps = log.find((l) => l.table === 'transactions')!.ops;
  assert.deepEqual(txOps.filter((o) => o.op === 'gte' || o.op === 'lte').map((o) => o.args), [['date', '2026-10-01'], ['date', '2026-10-31']]);
  assert.match(files['LEIA-ME.txt'], /Período: De 01\/10\/2026 até 31\/10\/2026/);
});

ok('JSON: tudo num arquivo, datas ISO, números de verdade e filtros descritos', async () => {
  const r = await runExport(fakeClient(DATA, RPCS), baseOpts({ format: 'json', items: ['transactions', 'goals', 'profile'], from: '2026-09-01' }), baseCtx);
  assert.equal(r.fileName, 'jakash-dados-2026-10-23.json');
  assert.equal(typeof r.data, 'string');
  const j = JSON.parse(r.data as string);
  assert.equal(j.aplicativo, 'Jakash');
  assert.deepEqual(j.filtros, { periodo: { de: '2026-09-01', ate: null }, tipo: 'ambos', incluir_outras_pessoas_da_casa: false, itens: ['transactions', 'goals', 'profile'] });
  assert.equal(j.dados.lancamentos.length, 2); // t3 (agosto) fica de fora
  assert.equal(j.dados.lancamentos[0].valor, 87.9);
  assert.equal(j.dados.lancamentos[0].data, '2026-10-10');
  assert.equal(j.dados.lancamentos[0].recorrente, false);
  assert.deepEqual(j.dados.objetivos[0].detalhes, { destino: 'Lisboa' });
  assert.equal(j.dados.perfil.nome, 'Ana Souza');
  assert.equal(j.dados.perfil.negocio_nome, 'Ana ME');
  assert.equal(JSON.stringify(j).includes('cpf'), false);
  assert.deepEqual(Object.keys(j.dados).sort(), ['lancamentos', 'objetivos', 'aportes_dos_objetivos', 'perfil'].sort());
});

ok('Fornecedor: aparece nos lançamentos e nas contas da empresa, inclusive o de um fornecedor arquivado', async () => {
  const data = structuredClone(DATA);
  data.transactions[0].is_business = true;
  (data.transactions[0] as Record<string, unknown>).supplier_id = 'f1';
  data.mei_suppliers.push({ id: 'f2', user_id: ME, name: 'Casa do Frete', document: null, phone: null, email: null, pix_key: null, category: 'Frete e entrega', notes: null, archived: true, created_at: '2026-04-01T12:00:00Z' });
  data.bills[0].is_business = true;
  (data.bills[0] as Record<string, unknown>).supplier_id = 'f2';
  const r = await runExport(fakeClient(data, RPCS), baseOpts({ items: ['transactions', 'bills', 'mei'] }), baseCtx);
  const files = await unzip(r.data as Uint8Array);
  assert.match(files['lancamentos.csv'], /Alimentação;Supermercado;Nubank;;;;;;Empresa;;;Embalagens Sul;Não;Não;/);
  assert.match(files['contas-a-pagar-e-receber.csv'], /Luz;A pagar;150,00;Pendente;;Todo mês;;Empresa;;;Casa do Frete;/);
  assert.match(files['mei-fornecedores.csv'], /Casa do Frete;Frete e entrega;;;;;;Sim;01\/04\/2026/);
  // o plano lê a tabela de fornecedores inteira (o nome precisa ser achado mesmo com filtro de período)
  const plan = buildQueryPlan(baseOpts({ items: ['bills'], from: '2026-10-01' }), baseCtx);
  assert.deepEqual(plan.find((p) => p.id === 'mei_suppliers')!.filters, []);
  assert.match(plan.find((p) => p.id === 'bills')!.columns, /supplier_id/);
  assert.match(buildQueryPlan(baseOpts({ items: ['transactions'] }), baseCtx).find((p) => p.id === 'transactions')!.columns, /supplier_id/);
  const j = JSON.parse((await runExport(fakeClient(data, RPCS), baseOpts({ format: 'json', items: ['mei'] }), baseCtx)).data as string);
  assert.deepEqual(j.dados.mei_fornecedores.map((f: { nome: string }) => f.nome), ['Embalagens Sul', 'Casa do Frete']);
});

ok('quem não usa o app para a empresa não vê colunas nem arquivos de empresa', async () => {
  const ctx = { ...baseCtx, isMei: false };
  const r = await runExport(fakeClient(DATA, RPCS), { ...DEFAULT_OPTIONS(false), items: ['transactions', 'mei', 'profile'] }, ctx);
  const files = await unzip(r.data as Uint8Array);
  assert.equal('mei-clientes.csv' in files, false);
  assert.equal('mei-fornecedores.csv' in files, false);
  assert.equal(files['lancamentos.csv'].includes('Fornecedor'), false);
  assert.equal('mei-produtos-e-servicos.csv' in files, false);
  assert.equal(files['perfil.csv'].includes('Campinas'), false);
  assert.equal(files['lancamentos.csv'].includes('Pessoal/Empresa'), false);
  assert.equal(files['perfil.csv'].includes('Ana ME'), false);
  assert.equal(files['perfil.csv'].includes('00.000.000/0001-00'), false);
});

ok('aviso de corte aparece no LEIA-ME e no resumo', async () => {
  const many = Array.from({ length: MAX_ROWS_PER_TABLE + 3 }, (_, i) => ({ ...DATA.transactions[0], id: `x${i}` }));
  const r = await runExport(fakeClient({ ...DATA, transactions: many }, RPCS), baseOpts({ items: ['transactions'] }), baseCtx);
  assert.equal(r.summary[0].capped, true);
  assert.equal(r.summary[0].count, MAX_ROWS_PER_TABLE);
  const files = await unzip(r.data as Uint8Array);
  assert.match(files['LEIA-ME.txt'], /lancamentos\.csv foi cortado em 50\.000 linhas/);
});

ok('exportação sem itens não lê nada', async () => {
  await assert.rejects(runExport(fakeClient(DATA, RPCS), baseOpts({ items: [] }), baseCtx), /Escolha ao menos um item/);
});

ok('colunas de linhas vazias não quebram (tudo em branco)', () => {
  const ds = DATASETS.find((d) => d.id === 'transactions')!;
  const csv = toCsv(columnsFor(ds, { household: false }, { isMei: true }), [{} as Row]);
  assert.equal(csv.split('\r\n')[1].split(';').every((c) => c === ''), true);
});

Promise.all(pending).then(() => {
  if (process.exitCode) console.error('Há testes falhando.');
  else console.log(`${passed} testes de exportação de dados passaram.`);
});
