// Copies the calculation engine, API types and the product search criteria
// from the web app so web and mobile always compute, type and search the same
// way. Run after changing any of them:
//   npm run sync-shared -- ../cca_app_redesign_frontend
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const web = process.argv[2] ?? '../cca_app_redesign_frontend'
const pairs = [
  ['src/lib/calc.ts', 'src/shared/calc.ts'],
  ['src/lib/calc.test.ts', 'src/shared/calc.test.ts'],
  ['src/api/types.ts', 'src/shared/types.ts'],
  // Search criteria, for the sieve analysis (all in grading) helpers; it
  // imports the calc engine by the web alias, so point that at the copy here.
  ['src/features/search/criteria.ts', 'src/shared/searchCriteria.ts'],
]
for (const [from, to] of pairs) {
  copyFileSync(join(web, from), to)
  console.log(`synced ${to}`)
}

// Rewrite one synced file; logs when it changed.
function adapt(file, edit, note) {
  const text = readFileSync(file, 'utf8')
  const fixed = edit(text)
  if (fixed !== text) {
    writeFileSync(file, fixed)
    console.log(`${note} ${file}`)
  }
}

// Jest here (jest-expo, CommonJS) cannot run `await import()` in the web's
// Vitest tests: load the module with jest.requireActual instead.
adapt('src/shared/calc.test.ts',
  (t) => t.replace(/await import\('\.\/calc'\)/g, "jest.requireActual<typeof import('./calc')>('./calc')"),
  'adapted for jest')

// The web imports the calc engine as '@/lib/calc'; here it sits next to the copy.
adapt('src/shared/searchCriteria.ts', (t) => t.replace(/from '@\/lib\/calc'/g, "from './calc'"), 'pointed at ./calc')
