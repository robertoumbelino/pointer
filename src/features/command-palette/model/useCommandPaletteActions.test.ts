import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./useCommandPaletteActions.ts', import.meta.url), 'utf8')
const scopedModeStart = source.indexOf('async function enterCommandScopedMode')
const scopedModeEnd = source.indexOf('\n  async function selectCommandAction', scopedModeStart)
const scopedModeImplementation = source.slice(scopedModeStart, scopedModeEnd)

test('command palette loads only the fast table column schema in scoped filter mode', () => {
  assert.notEqual(scopedModeStart, -1)
  assert.notEqual(scopedModeEnd, -1)
  assert.match(scopedModeImplementation, /pointerApi\.listTableColumns\(/)
  assert.doesNotMatch(scopedModeImplementation, /pointerApi\.describeTable\(/)
})
