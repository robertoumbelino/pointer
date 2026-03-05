import { ipcMain } from 'electron'
import type { ConnectionInput, TableReadInput, TableRef } from '../../shared/db-types'
import { DbService } from './db-service'

export const IPC_CHANNELS = {
  listEnvironments: 'pointer:environments:list',
  createEnvironment: 'pointer:environments:create',
  updateEnvironment: 'pointer:environments:update',
  deleteEnvironment: 'pointer:environments:delete',

  listConnections: 'pointer:connections:list',
  createConnection: 'pointer:connections:create',
  updateConnection: 'pointer:connections:update',
  testConnectionInput: 'pointer:connections:test-input',
  deleteConnection: 'pointer:connections:delete',
  testConnection: 'pointer:connections:test',

  listSchemas: 'pointer:schemas:list',
  listTables: 'pointer:tables:list',
  searchTables: 'pointer:tables:search',
  searchTablesInEnvironment: 'pointer:tables:search-in-environment',

  describeTable: 'pointer:tables:describe',
  readTable: 'pointer:tables:read',
  insertRow: 'pointer:rows:insert',
  updateRow: 'pointer:rows:update',
  deleteRow: 'pointer:rows:delete',

  previewSqlRisk: 'pointer:sql:preview-risk',
  executeSql: 'pointer:sql:execute',
} as const

export function registerIpc(dbService: DbService): void {
  ipcMain.handle(IPC_CHANNELS.listEnvironments, () => wrap(() => dbService.listEnvironments()))
  ipcMain.handle(IPC_CHANNELS.createEnvironment, (_, name: string, color?: string) =>
    wrap(() => dbService.createEnvironment(name, color)),
  )
  ipcMain.handle(IPC_CHANNELS.updateEnvironment, (_, id: string, name: string, color?: string) =>
    wrap(() => dbService.updateEnvironment(id, name, color)),
  )
  ipcMain.handle(IPC_CHANNELS.deleteEnvironment, (_, id: string) => wrap(() => dbService.deleteEnvironment(id)))

  ipcMain.handle(IPC_CHANNELS.listConnections, (_, environmentId: string) =>
    wrap(() => dbService.listConnections(environmentId)),
  )
  ipcMain.handle(IPC_CHANNELS.createConnection, (_, input: ConnectionInput) =>
    wrap(() => dbService.createConnection(input)),
  )
  ipcMain.handle(IPC_CHANNELS.updateConnection, (_, id: string, input: ConnectionInput) =>
    wrap(() => dbService.updateConnection(id, input)),
  )
  ipcMain.handle(IPC_CHANNELS.testConnectionInput, (_, input: ConnectionInput, existingConnectionId?: string) =>
    wrap(() => dbService.testConnectionInput(input, existingConnectionId)),
  )
  ipcMain.handle(IPC_CHANNELS.deleteConnection, (_, id: string) => wrap(() => dbService.deleteConnection(id)))
  ipcMain.handle(IPC_CHANNELS.testConnection, (_, id: string) => wrap(() => dbService.testConnection(id)))

  ipcMain.handle(IPC_CHANNELS.listSchemas, (_, connectionId: string) =>
    wrap(() => dbService.listSchemas(connectionId)),
  )

  ipcMain.handle(IPC_CHANNELS.listTables, (_, connectionId: string, schema?: string) =>
    wrap(() => dbService.listTables(connectionId, schema)),
  )

  ipcMain.handle(IPC_CHANNELS.searchTables, (_, connectionId: string, query: string) =>
    wrap(() => dbService.searchTables(connectionId, query)),
  )

  ipcMain.handle(IPC_CHANNELS.searchTablesInEnvironment, (_, environmentId: string, query: string) =>
    wrap(() => dbService.searchTablesInEnvironment(environmentId, query)),
  )

  ipcMain.handle(IPC_CHANNELS.describeTable, (_, connectionId: string, table: TableRef) =>
    wrap(() => dbService.describeTable(connectionId, table)),
  )

  ipcMain.handle(IPC_CHANNELS.readTable, (_, connectionId: string, table: TableRef, input: TableReadInput) =>
    wrap(() => dbService.readTable(connectionId, table, input)),
  )

  ipcMain.handle(IPC_CHANNELS.insertRow, (_, connectionId: string, table: TableRef, row: Record<string, unknown>) =>
    wrap(() => dbService.insertRow(connectionId, table, row)),
  )

  ipcMain.handle(IPC_CHANNELS.updateRow, (_, connectionId: string, table: TableRef, row: Record<string, unknown>) =>
    wrap(() => dbService.updateRow(connectionId, table, row)),
  )

  ipcMain.handle(IPC_CHANNELS.deleteRow, (_, connectionId: string, table: TableRef, row: Record<string, unknown>) =>
    wrap(() => dbService.deleteRow(connectionId, table, row)),
  )

  ipcMain.handle(IPC_CHANNELS.previewSqlRisk, (_, sql: string) => wrap(() => dbService.previewSqlRisk(sql)))

  ipcMain.handle(IPC_CHANNELS.executeSql, (_, connectionId: string, sql: string) =>
    wrap(() => dbService.executeSql(connectionId, sql)),
  )
}

async function wrap<T>(callback: () => Promise<T> | T): Promise<T> {
  try {
    return await callback()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    throw new Error(message)
  }
}
