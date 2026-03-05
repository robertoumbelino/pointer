import { contextBridge, ipcRenderer } from 'electron'
import type { PointerApi } from '../shared/db-types'
import { IPC_CHANNELS } from './services/ipc'

const pointerApi: PointerApi = {
  listEnvironments: () => ipcRenderer.invoke(IPC_CHANNELS.listEnvironments),
  createEnvironment: (name, color) => ipcRenderer.invoke(IPC_CHANNELS.createEnvironment, name, color),
  updateEnvironment: (id, name, color) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateEnvironment, id, name, color),
  deleteEnvironment: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteEnvironment, id),

  listConnections: (environmentId) => ipcRenderer.invoke(IPC_CHANNELS.listConnections, environmentId),
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

  checkForAppUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.checkForAppUpdate),
  installLatestUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installLatestUpdate),
}

contextBridge.exposeInMainWorld('pointerApi', pointerApi)
