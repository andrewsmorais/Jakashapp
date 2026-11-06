import assert from 'node:assert/strict';
import { periodFor } from '@/lib/period';

// Filtro de período. Rodar: npx tsx --tsconfig tsconfig.json tests/period.test.ts
const c = { from: '2026-11-10', to: '2026-11-01' };
assert.deepEqual(periodFor('hoje', c, '2026-11-06'), { from: '2026-11-06', to: '2026-11-06' });
assert.deepEqual(periodFor('semana', c, '2026-11-06'), { from: '2026-11-02', to: '2026-11-06' }); // 06/11/2026 é sexta
assert.deepEqual(periodFor('semana', c, '2026-11-02'), { from: '2026-11-02', to: '2026-11-02' }); // segunda
assert.deepEqual(periodFor('semana', c, '2026-11-08'), { from: '2026-11-02', to: '2026-11-08' }); // domingo
assert.deepEqual(periodFor('mes', c, '2026-11-06'), { from: '2026-11-01', to: '2026-11-06' });
assert.deepEqual(periodFor('custom', c, '2026-11-06'), { from: '2026-11-01', to: '2026-11-10' }); // datas invertidas
assert.deepEqual(periodFor('custom', { from: '2026-11-01', to: '2026-11-05' }), { from: '2026-11-01', to: '2026-11-05' });
console.log('period: ok');
