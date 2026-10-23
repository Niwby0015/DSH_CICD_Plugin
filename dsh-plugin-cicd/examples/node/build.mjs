import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const target = join(process.cwd(), 'dist', 'sum.mjs')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, "export const built = true\n", 'utf8')
console.log(`built ${target}`)
