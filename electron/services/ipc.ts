import { app, clipboard, dialog, BrowserWindow, ipcMain, type OpenDialogOptions } from 'electron'
import type { AiConfigInput, AiGenerateSqlTurnInput, ConnectionInput, TableReadInput, TableRef } from '../../shared/db-types'
import { AiService } from './ai-service'
import { DbService } from './db-service'
import { UpdaterService } from './updater-service'

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
  executeSqlWithExecutionId: 'pointer:sql:execute-with-execution-id',
  cancelSqlExecution: 'pointer:sql:cancel-execution',

  checkForAppUpdate: 'pointer:app:update:check',
  installLatestUpdate: 'pointer:app:update:install',
  getAppVersion: 'pointer:app:version',
  copyToClipboard: 'pointer:clipboard:write',
  pickSqliteFile: 'pointer:sqlite:pick-file',
  getAiConfig: 'pointer:ai:config:get',
  saveAiConfig: 'pointer:ai:config:save',
  removeAiConfig: 'pointer:ai:config:remove',
  generateAiSqlTurn: 'pointer:ai:sql:turn',
} as const

export function registerIpc(dbService: DbService, updaterService: UpdaterService, aiService: AiService): void {
  ipcMain.handle(IPC_CHANNELS.getAppVersion, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.copyToClipboard, (_, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.handle(IPC_CHANNELS.pickSqliteFile, async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    }
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0] ?? null
  })

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
  ipcMain.handle(
    IPC_CHANNELS.executeSqlWithExecutionId,
    (_, connectionId: string, sql: string, executionId: string) =>
      wrap(() => {
        console.info('[ipc][sql] execute request', { connectionId, executionId })
        return dbService.executeSqlWithExecutionId(connectionId, sql, executionId)
      }),
  )
  ipcMain.handle(IPC_CHANNELS.cancelSqlExecution, (_, executionId: string) =>
    wrap(() => {
      console.info('[ipc][sql] cancel request', { executionId })
      return dbService.cancelSqlExecution(executionId)
    }),
  )

  ipcMain.handle(IPC_CHANNELS.checkForAppUpdate, () => wrap(() => updaterService.checkForAppUpdate()))
  ipcMain.handle(IPC_CHANNELS.installLatestUpdate, () => wrap(() => updaterService.installLatestUpdate()))
  ipcMain.handle(IPC_CHANNELS.getAiConfig, () => wrap(() => aiService.getAiConfig()))
  ipcMain.handle(IPC_CHANNELS.saveAiConfig, (_, input: AiConfigInput) => wrap(() => aiService.saveAiConfig(input)))
  ipcMain.handle(IPC_CHANNELS.removeAiConfig, () => wrap(() => aiService.removeAiConfig()))
  ipcMain.handle(IPC_CHANNELS.generateAiSqlTurn, (_, input: AiGenerateSqlTurnInput) =>
    wrap(() => aiService.generateAiSqlTurn(input)),
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
