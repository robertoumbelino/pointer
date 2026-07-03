import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const appResourcesPath = join(
  'release',
  packageJson.version,
  'mac-arm64',
  'Pointer.app',
  'Contents',
  'Resources',
  'app',
)

const requiredFiles = [
  'node_modules/keytar/build/Release/keytar.node',
  'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
].map((path) => join(appResourcesPath, path))

const missing = requiredFiles.filter((path) => !existsSync(path))

if (missing.length > 0) {
  console.error('Missing native binaries in packaged macOS app:')
  for (const file of missing) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

