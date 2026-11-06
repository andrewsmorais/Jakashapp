import assert from 'node:assert/strict';
import { goalStatus } from '@/lib/shopping';

// Meta da compra. Rodar: npx tsx --tsconfig tsconfig.json tests/shopping-goal.test.ts
assert.equal(goalStatus(null, 50), null);
assert.equal(goalStatus(0, 50), null);
assert.deepEqual(goalStatus(1400, 350), { left: 1050, over: false, pct: 25 });
assert.deepEqual(goalStatus(100, 100), { left: 0, over: false, pct: 100 });
assert.deepEqual(goalStatus(100, 130.5), { left: -30.5, over: true, pct: 100 });
console.log('shopping-goal: ok');
