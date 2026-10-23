export function sum(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError('sum expects finite numbers')
  return a + b
}
