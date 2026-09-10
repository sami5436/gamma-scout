export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Map a value into 0..1, where `good` scores 1 and `bad` scores 0. */
export function ramp(x: number, bad: number, good: number): number {
  if (good === bad) return 0.5;
  return clamp01((x - bad) / (good - bad));
}

/** Peak of 1 at `center`, falling to 0 at `center ± width`. */
export function bell(x: number, center: number, width: number): number {
  if (width <= 0) return 0;
  return clamp01(1 - Math.abs(x - center) / width);
}

export interface Factor {
  key: string;
  label: string;
  /** 0..100 */
  score: number;
  weight: number;
  note: string;
}

export function weightedScore(factors: Factor[]): number {
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  if (!totalWeight) return 0;
  return factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight;
}
