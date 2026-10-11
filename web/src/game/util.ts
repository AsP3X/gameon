/** An array of `n` copies of `v`. */
export const fill = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** State is plain JSON, so a JSON round-trip is a safe deep copy in any runtime. */
export function clone<T>(o: T): T {
  return o == null ? o : (JSON.parse(JSON.stringify(o)) as T);
}
