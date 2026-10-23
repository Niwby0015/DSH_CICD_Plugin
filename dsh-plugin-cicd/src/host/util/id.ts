import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Short, sortable-ish identifier with a readable prefix. */
export function createId(prefix: string): string {
  const bytes = randomBytes(10)
  let out = ''
  for (const byte of bytes) out += ALPHABET.charAt(byte % ALPHABET.length)
  return `${prefix}_${out}`
}
