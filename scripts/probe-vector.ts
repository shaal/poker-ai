/**
 * The insert-then-query harness ADR-006 makes a standing rule.
 *
 *   "If anything in this project ever loads a vector engine, prove it works
 *    with an insert-then-query harness before trusting it. Do not trust a
 *    backend label. The failure mode above reports success."
 *
 * That failure mode is not hypothetical. In ruvector@0.2.40, `dist/index.js`
 * installs a stub whose `search()` returns `[]` and whose `insert()` returns
 * `'stub-id-' + Date.now()`, while setting `implementationType = 'wasm'`. It
 * warns on stderr and otherwise looks like success. So this file asks the only
 * question that cannot be faked: put a known vector in, ask for it back, and
 * check that the thing returned is the thing stored.
 *
 * Exit code 0 means usable. Anything else means fall back.
 */

import { probeVectorEngine } from '../src/cluster/engine'

const result = await probeVectorEngine()

console.log(`engine:   ${result.engine}`)
console.log(`backend:  ${result.backend ?? '(none reported)'}`)
console.log(`usable:   ${result.usable}`)
for (const c of result.checks) {
  console.log(`  ${c.pass ? 'pass' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
}

if (!result.usable) {
  console.log('')
  console.log(`Not usable: ${result.reason}`)
  console.log('Generation will fall back to the deterministic classifier in')
  console.log('src/strategy/texture.ts, which is tested and always available.')
  process.exit(1)
}

console.log('')
console.log('Vector engine verified by insert-then-query, not by backend label.')
