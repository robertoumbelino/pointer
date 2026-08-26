import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./useWorkspaceActions.ts', import.meta.url), 'utf8')
const saveChangesStart = source.indexOf('async function saveActiveTableChanges')
const saveChangesEnd = source.indexOf('\n  function handleToggleInsertDraftRow', saveChangesStart)
const saveChangesImplementation = source.slice(saveChangesStart, saveChangesEnd)

test('a successful update-only save commits the edited rows locally without an automatic table reload', () => {
  assert.notEqual(saveChangesStart, -1)
  assert.notEqual(saveChangesEnd, -1)
  assert.match(saveChangesImplementation, /const canCommitWritesLocally/)
  assert.match(saveChangesImplementation, /baseRows: cloneRows\(nextRows\)/)
  assert.match(saveChangesImplementation, /if \(canCommitWritesLocally\)/)
  assert.match(saveChangesImplementation, /else \{\s+await reloadTableTab\(tab\.id\)/)
})

test('a successful delete save removes the deleted rows locally without an automatic table reload', () => {
  assert.match(saveChangesImplementation, /let deleted = 0/)
  assert.match(saveChangesImplementation, /deleted \+= result\.affected/)
  assert.match(saveChangesImplementation, /const deletedRowIndexes = new Set\(pendingDeleteRows\)/)
  assert.match(saveChangesImplementation, /current\.data\.rows\.filter\(\(_row, rowIndex\) => !deletedRowIndexes\.has\(rowIndex\)\)/)
  assert.match(saveChangesImplementation, /pendingDeletes: \[\]/)
})
