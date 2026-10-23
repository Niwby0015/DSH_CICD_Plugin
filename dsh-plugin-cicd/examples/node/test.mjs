import assert from 'node:assert/strict'
import { sum } from './src/sum.js'

assert.equal(sum(2, 3), 5)
assert.throws(() => sum('2', 3), TypeError)
console.log('node example tests passed')
