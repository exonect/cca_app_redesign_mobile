// Copies the calculation engine and API types from the web app so web and
// mobile always compute and type the same way. Run after changing either:
//   npm run sync-shared -- ../cca_app_redesign_frontend
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const web = process.argv[2] ?? '../cca_app_redesign_frontend'
const pairs = [
  ['src/lib/calc.ts', 'src/shared/calc.ts'],
  ['src/lib/calc.test.ts', 'src/shared/calc.test.ts'],
  ['src/api/types.ts', 'src/shared/types.ts'],
]
for (const [from, to] of pairs) {
  copyFileSync(join(web, from), to)
  console.log(`synced ${to}`)
}

// Jest here (jest-expo, CommonJS) cannot run `await import()` in the web's
// Vitest tests: load the module with jest.requireActual instead.
const test = 'src/shared/calc.test.ts'
const text = readFileSync(test, 'utf8')
const fixed = text.replace(/await import\('\.\/calc'\)/g, "jest.requireActual<typeof import('./calc')>('./calc')")
if (fixed !== text) {
  writeFileSync(test, fixed)
  console.log(`adapted ${test} for jest`)
}
