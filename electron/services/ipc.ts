import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { app, clipboard, dialog, BrowserWindow, ipcMain, type OpenDialogOptions } from 'electron'
import type {
  AiConfigInput,
  AiGenerateSqlTurnInput,
  ConnectionInput,
  OpenSqlFileResult,
  SaveSqlFileInput,
  TableReadInput,
  TableRef,
} from '../../shared/db-types'
import { AiService } from './ai-service'
import { DbService } from './db-service'
import { IPC_CHANNELS } from './ipc-channels'
import { UpdaterService } from './updater-service'

function ensureSqlExtension(filePath: string): string {
  return extname(filePath).toLowerCase() === '.sql' ? filePath : `${filePath}.sql`
}

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
  ipcMain.handle(IPC_CHANNELS.openSqlFile, async (): Promise<OpenSqlFileResult | null> => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'SQL', extensions: ['sql'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    }
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    if (!filePath) {
      return null
    }

    const sqlText = await readFile(filePath, 'utf8')
    return { filePath, sqlText }
  })
  ipcMain.handle(IPC_CHANNELS.saveSqlFile, async (_, input: SaveSqlFileInput): Promise<string | null> => {
    const sqlText = typeof input?.sqlText === 'string' ? input.sqlText : ''
    let destinationPath =
      typeof input?.filePath === 'string' && input.filePath.trim().length > 0 ? input.filePath.trim() : ''

    if (!destinationPath) {
      const focusedWindow = BrowserWindow.getFocusedWindow()
      const suggestedFileName =
        typeof input?.suggestedFileName === 'string' && input.suggestedFileName.trim().length > 0
          ? ensureSqlExtension(input.suggestedFileName.trim())
          : 'query.sql'
      const saveOptions = {
        defaultPath: suggestedFileName,
        filters: [
          { name: 'SQL', extensions: ['sql'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
      }
      const result = focusedWindow
        ? await dialog.showSaveDialog(focusedWindow, saveOptions)
        : await dialog.showSaveDialog(saveOptions)

      if (result.canceled || !result.filePath) {
        return null
      }

      destinationPath = ensureSqlExtension(result.filePath)
    }

    await writeFile(destinationPath, sqlText, 'utf8')
    return destinationPath
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
  ipcMain.handle(IPC_CHANNELS.getConnectionPassword, (_, id: string) =>
    wrap(() => dbService.getConnectionPasswordForEdit(id)),
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
