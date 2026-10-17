/** 시드 기반 의사난수 생성기 (mulberry32). 같은 시드면 항상 같은 수열. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomRange = (rng: () => number, min: number, max: number): number =>
  min + (max - min) * rng();
