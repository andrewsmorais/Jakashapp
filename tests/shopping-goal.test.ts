import assert from 'node:assert/strict';
import { goalStatus } from '@/lib/shopping';

// Meta da compra. Rodar: npx tsx --tsconfig tsconfig.json tests/shopping-goal.test.ts
assert.equal(goalStatus(null, 50), null);
assert.equal(goalStatus(0, 50), null);
assert.deepEqual(goalStatus(1400, 350), { left: 1050, over: false, pct: 25 });
assert.deepEqual(goalStatus(100, 100), { left: 0, over: false, pct: 100 });
assert.deepEqual(goalStatus(100, 130.5), { left: -30.5, over: true, pct: 100 });
console.log('shopping-goal: ok');

import { compareReceipt, nameTokens, type ShopItem } from '@/lib/shopping';
const mk = (id: string, name: string, extra: Partial<ShopItem> = {}): ShopItem => ({ id, list_id: 'l', created_by: 'u', name, quantity: 1, unit: null, est_price: null, checked: false, position: 0, ...extra });
assert.deepEqual(nameTokens('Arroz Tio João 5kg'), ['arroz', 'tio', 'joao']);
{
  const items = [mk('1', 'Arroz'), mk('2', 'Feijão'), mk('3', 'Leite'), mk('4', 'Café')];
  const r = compareReceipt(items, [
    { name: 'ARROZ TIO JOAO 5KG', quantity: 1, total: 29.9 },
    { name: 'FEIJAO CARIOCA 1KG', quantity: 1, total: 8.5 },
    { name: 'BISCOITO RECHEADO', quantity: 2, total: 6 },
  ]);
  assert.equal(r.rows[0].match?.total, 29.9);
  assert.equal(r.rows[1].match?.total, 8.5);
  assert.equal(r.rows[2].match, null);
  assert.equal(r.rows[3].match, null);
  assert.deepEqual(r.unlisted.map((x) => x.name), ['BISCOITO RECHEADO']);
  // abreviação da nota ("FEIJ") casa com "Feijão"
  assert.equal(compareReceipt([mk('2', 'Feijão')], [{ name: 'FEIJ PRETO', quantity: 1, total: 7 }]).rows[0].match?.total, 7);
  // um produto da nota não casa com dois itens da lista
  const two = compareReceipt([mk('a', 'Leite'), mk('b', 'Leite integral')], [{ name: 'LEITE INTEGRAL 1L', quantity: 1, total: 5 }]);
  assert.equal(two.rows.filter((x) => x.match).length, 1);
}
console.log('shopping-receipt: ok');
