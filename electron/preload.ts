import { contextBridge, ipcRenderer } from 'electron'
import type { PointerApi } from '../shared/db-types'
import { IPC_CHANNELS } from './services/ipc'

const RENDERER_RUN_SQL_SHORTCUT_CHANNEL = 'pointer:shortcut:run-sql'

const pointerApi: PointerApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getAppVersion),
  copyToClipboard: (text) => ipcRenderer.invoke(IPC_CHANNELS.copyToClipboard, text),
  pickSqliteFile: () => ipcRenderer.invoke(IPC_CHANNELS.pickSqliteFile),
  getAiConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getAiConfig),
  saveAiConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveAiConfig, input),
  removeAiConfig: () => ipcRenderer.invoke(IPC_CHANNELS.removeAiConfig),
  generateAiSqlTurn: (input) => ipcRenderer.invoke(IPC_CHANNELS.generateAiSqlTurn, input),

  listEnvironments: () => ipcRenderer.invoke(IPC_CHANNELS.listEnvironments),
  createEnvironment: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.createEnvironment, name, color),
  updateEnvironment: (id, name, color) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateEnvironment, id, name, color),
  deleteEnvironment: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteEnvironment, id),

  listConnections: (environmentId) => ipcRenderer.invoke(IPC_CHANNELS.listConnections, environmentId),
  getConnectionPassword: (id) => ipcRenderer.invoke(IPC_CHANNELS.getConnectionPassword, id),
  createConnection: (input) => ipcRenderer.invoke(IPC_CHANNELS.createConnection, input),
  updateConnection: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.updateConnection, id, input),
  testConnectionInput: (input, existingConnectionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.testConnectionInput, input, existingConnectionId),
  deleteConnection: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteConnection, id),
  testConnection: (id) => ipcRenderer.invoke(IPC_CHANNELS.testConnection, id),

  listSchemas: (connectionId) => ipcRenderer.invoke(IPC_CHANNELS.listSchemas, connectionId),
  listTables: (connectionId, schema) => ipcRenderer.invoke(IPC_CHANNELS.listTables, connectionId, schema),
  searchTables: (connectionId, query) => ipcRenderer.invoke(IPC_CHANNELS.searchTables, connectionId, query),
  searchTablesInEnvironment: (environmentId, query) =>
    ipcRenderer.invoke(IPC_CHANNELS.searchTablesInEnvironment, environmentId, query),

  describeTable: (connectionId, table) => ipcRenderer.invoke(IPC_CHANNELS.describeTable, connectionId, table),
  readTable: (connectionId, table, input) => ipcRenderer.invoke(IPC_CHANNELS.readTable, connectionId, table, input),
  insertRow: (connectionId, table, row) => ipcRenderer.invoke(IPC_CHANNELS.insertRow, connectionId, table, row),
  updateRow: (connectionId, table, row) => ipcRenderer.invoke(IPC_CHANNELS.updateRow, connectionId, table, row),
  deleteRow: (connectionId, table, row) => ipcRenderer.invoke(IPC_CHANNELS.deleteRow, connectionId, table, row),

  previewSqlRisk: (sql) => ipcRenderer.invoke(IPC_CHANNELS.previewSqlRisk, sql),
  executeSql: (connectionId, sql) => ipcRenderer.invoke(IPC_CHANNELS.executeSql, connectionId, sql),
  executeSqlWithExecutionId: (connectionId, sql, executionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.executeSqlWithExecutionId, connectionId, sql, executionId),
  cancelSqlExecution: (executionId) => ipcRenderer.invoke(IPC_CHANNELS.cancelSqlExecution, executionId),

  checkForAppUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.checkForAppUpdate),
  installLatestUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installLatestUpdate),
}

ipcRenderer.on(RENDERER_RUN_SQL_SHORTCUT_CHANNEL, () => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'F5',
      code: 'F5',
      bubbles: true,
      cancelable: true,
    }),
  )
})

contextBridge.exposeInMainWorld('pointerApi', pointerApi)
