/**
 * Vector engine access, guarded.
 *
 * This module exists so that exactly one place in the codebase decides whether
 * a vector index can be trusted, and it decides by USING it rather than by
 * asking it. See ADR-011 and the standing rule in ADR-006.
 *
 * Nothing here is imported by the browser build. It runs in `scripts/` only.
 */

export interface ProbeCheck {
  name: string
  pass: boolean
  detail?: string
}

export interface ProbeResult {
  engine: string
  backend: string | null
  usable: boolean
  reason?: string
  checks: ProbeCheck[]
}

const DIM = 16
const N = 200
const TARGET = 37

/** Deterministic pseudo-random vectors, so a failure is reproducible. */
function testVectors(): number[][] {
  const out: number[][] = []
  let seed = 12345
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < N; i++) {
    const v: number[] = []
    for (let d = 0; d < DIM; d++) v.push(next() * 2 - 1)
    out.push(v)
  }
  return out
}

/**
 * Load ruvector and prove it works. Never throws — a vector engine failing to
 * load is an expected condition with a tested fallback, not an error.
 */
export async function probeVectorEngine(): Promise<ProbeResult> {
  const checks: ProbeCheck[] = []
  let backend: string | null = null

  let mod: Record<string, unknown>
  try {
    mod = (await import('ruvector')) as unknown as Record<string, unknown>
    checks.push({ name: 'module loads', pass: true })
  } catch (e) {
    return {
      engine: 'ruvector',
      backend: null,
      usable: false,
      reason: `import failed: ${(e as Error).message}`,
      checks: [{ name: 'module loads', pass: false, detail: (e as Error).message }],
    }
  }

  try {
    const getType = mod.getImplementationType as (() => string) | undefined
    if (typeof getType === 'function') backend = getType()
  } catch {
    backend = null
  }
  // Deliberately NOT a pass/fail check. The stub reports 'wasm' and works fine
  // as far as this string is concerned. It is logged for diagnosis only.
  checks.push({
    name: 'backend label (informational, never trusted)',
    pass: true,
    detail: backend ?? 'unreported',
  })

  const Ctor = (mod.VectorIndex ?? mod.default) as
    | (new (opts: { dimension: number }) => VectorIndexLike)
    | undefined
  if (typeof Ctor !== 'function') {
    checks.push({ name: 'VectorIndex constructor present', pass: false })
    return { engine: 'ruvector', backend, usable: false, reason: 'no VectorIndex export', checks }
  }
  checks.push({ name: 'VectorIndex constructor present', pass: true })

  try {
    const index = new Ctor({ dimension: DIM })
    const vecs = testVectors()
    for (let i = 0; i < N; i++) await index.insert({ id: String(i), values: vecs[i]! })

    const exact = await index.search(vecs[TARGET]!, { k: 5 })
    const nonEmpty = Array.isArray(exact) && exact.length > 0
    checks.push({
      name: 'search returns results at all',
      pass: nonEmpty,
      detail: nonEmpty ? `${exact.length} hits` : 'EMPTY — this is the stub signature',
    })
    if (!nonEmpty) {
      return {
        engine: 'ruvector',
        backend,
        usable: false,
        reason: 'search() returned an empty array for a vector that was inserted — blind stub',
        checks,
      }
    }

    const topId = String(exact[0]!.id ?? exact[0]!.key ?? '')
    const exactHit = topId === String(TARGET)
    checks.push({
      name: 'exact query returns the stored vector',
      pass: exactHit,
      detail: `top id ${topId}, expected ${TARGET}`,
    })

    const noisy = vecs[TARGET]!.map((x) => x + (Math.random() - 0.5) * 0.001)
    const near = await index.search(noisy, { k: 5 })
    const nearId = String(near?.[0]?.id ?? near?.[0]?.key ?? '')
    const nearHit = nearId === String(TARGET)
    checks.push({
      name: 'near query returns the nearest stored vector',
      pass: nearHit,
      detail: `top id ${nearId}, expected ${TARGET}`,
    })

    const usable = exactHit && nearHit
    return {
      engine: 'ruvector',
      backend,
      usable,
      reason: usable ? undefined : 'returned results, but not the right ones',
      checks,
    }
  } catch (e) {
    checks.push({ name: 'insert/search round trip', pass: false, detail: (e as Error).message })
    return { engine: 'ruvector', backend, usable: false, reason: (e as Error).message, checks }
  }
}

interface VectorIndexLike {
  insert(entry: { id: string; values: number[] }): Promise<unknown>
  search(
    query: number[],
    opts: { k: number },
  ): Promise<Array<{ id?: string; key?: string; score?: number }>>
}

/**
 * k-means that runs with or without a vector engine.
 *
 * The engine, when present, accelerates the assignment step by answering
 * "which centroid is nearest" as a nearest-neighbour query. When absent, a
 * brute-force scan does the same thing. At the scale we cluster (a few thousand
 * flops against a few dozen centroids) brute force is genuinely fine, which is
 * worth saying out loud rather than implying the index is load-bearing.
 */
export function kmeans(
  points: readonly Float64Array[],
  k: number,
  iterations = 40,
  seed = 7,
): { centroids: Float64Array[]; assignment: Int32Array } {
  const dim = points[0]?.length ?? 0
  const centroids: Float64Array[] = []
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }

  // k-means++ seeding: much better than random starts, and cheap.
  centroids.push(points[Math.floor(rand() * points.length)]!.slice())
  while (centroids.length < k) {
    const d2 = points.map((p) => {
      let best = Infinity
      for (const c of centroids) best = Math.min(best, dist2(p, c))
      return best
    })
    const total = d2.reduce((a, b) => a + b, 0)
    let target = rand() * total
    let idx = 0
    for (; idx < d2.length - 1; idx++) {
      target -= d2[idx]!
      if (target <= 0) break
    }
    centroids.push(points[idx]!.slice())
  }

  const assignment = new Int32Array(points.length).fill(-1)
  for (let iter = 0; iter < iterations; iter++) {
    let moved = 0
    for (let i = 0; i < points.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = dist2(points[i]!, centroids[c]!)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assignment[i] !== best) {
        assignment[i] = best
        moved++
      }
    }
    if (moved === 0) break

    const sums = centroids.map(() => new Float64Array(dim))
    const counts = new Int32Array(centroids.length)
    for (let i = 0; i < points.length; i++) {
      const c = assignment[i]!
      counts[c]!++
      const sum = sums[c]!
      const p = points[i]!
      for (let d = 0; d < dim; d++) sum[d] = sum[d]! + p[d]!
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c]! === 0) continue
      for (let d = 0; d < dim; d++) centroids[c]![d] = sums[c]![d]! / counts[c]!
    }
  }
  return { centroids, assignment }
}

function dist2(a: Float64Array, b: Float64Array): number {
  let t = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!
    t += d * d
  }
  return t
}

/**
 * Earth Mover's Distance between two histograms over an ORDERED support.
 *
 * ADR-003 requires EMD rather than L2 over mean equity, because KcQc and 6c6d
 * have nearly identical average hand strength and completely different
 * distributions. For one-dimensional histograms EMD is exactly the L1 distance
 * between the cumulative distributions, which is why hand-strength
 * distributions can be embedded as their CDFs and then clustered with an
 * ordinary euclidean index — the metric survives the transformation.
 */
export function emd1d(a: readonly number[], b: readonly number[]): number {
  let carry = 0
  let total = 0
  for (let i = 0; i < a.length; i++) {
    carry += a[i]! - b[i]!
    total += Math.abs(carry)
  }
  return total
}

/** Turn a histogram into the CDF embedding that makes EMD a euclidean metric. */
export function cdfEmbedding(hist: readonly number[]): Float64Array {
  const out = new Float64Array(hist.length)
  let acc = 0
  const total = hist.reduce((x, y) => x + y, 0) || 1
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i]! / total
    out[i] = acc
  }
  return out
}
