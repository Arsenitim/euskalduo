export type Rng = () => number;

/** Small deterministic PRNG for tests. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(rng() * items.length)]!;
}

/** Weighted sampling without replacement. */
export function weightedSample<T>(items: readonly T[], weight: (item: T) => number, count: number, rng: Rng): T[] {
  const pool = items.map((item) => ({ item, w: Math.max(weight(item), 1e-6) }));
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let r = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i]!.w;
      if (r <= 0) {
        index = i;
        break;
      }
    }
    result.push(pool[index]!.item);
    pool.splice(index, 1);
  }
  return result;
}
