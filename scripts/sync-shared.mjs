// Copies the calculation engine and API types from the web app so web and
// mobile always compute and type the same way. Run after changing either:
//   npm run sync-shared -- ../cca_app_redesign_frontend
import { copyFileSync } from 'node:fs'
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
