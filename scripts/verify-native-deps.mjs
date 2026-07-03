import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

const nativeDeps = [
  {
    name: 'keytar',
    binary: 'build/Release/keytar.node',
  },
  {
    name: 'better-sqlite3',
    binary: 'build/Release/better_sqlite3.node',
  },
]

const missing = nativeDeps
  .map(({ name, binary }) => {
    const packageJsonPath = require.resolve(`${name}/package.json`)
    const packageDir = dirname(packageJsonPath)
    const binaryPath = join(packageDir, binary)

    return existsSync(binaryPath) ? null : `${name}: ${binaryPath}`
  })
  .filter(Boolean)

if (missing.length > 0) {
  console.error('Missing native dependency binaries:')
  for (const entry of missing) {
    console.error(`- ${entry}`)
  }
  console.error('Run `pnpm install` with approved native builds before creating a release.')
  process.exit(1)
}

