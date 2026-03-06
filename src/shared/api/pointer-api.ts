import type { PointerApi } from '../../../shared/db-types'

function api(): PointerApi {
  return window.pointerApi
}

export const pointerApi: PointerApi = {
  getAppVersion: () => api().getAppVersion(),
  copyToClipboard: (text) => api().copyToClipboard(text),
  pickSqliteFile: () => api().pickSqliteFile(),

  listEnvironments: () => api().listEnvironments(),
  createEnvironment: (name, color) => api().createEnvironment(name, color),
  updateEnvironment: (id, name, color) => api().updateEnvironment(id, name, color),
  deleteEnvironment: (id) => api().deleteEnvironment(id),

  listConnections: (environmentId) => api().listConnections(environmentId),
  createConnection: (input) => api().createConnection(input),
  updateConnection: (id, input) => api().updateConnection(id, input),
  testConnectionInput: (input, existingConnectionId) => api().testConnectionInput(input, existingConnectionId),
  deleteConnection: (id) => api().deleteConnection(id),
  testConnection: (id) => api().testConnection(id),

  listSchemas: (connectionId) => api().listSchemas(connectionId),
  listTables: (connectionId, schema) => api().listTables(connectionId, schema),
  searchTables: (connectionId, query) => api().searchTables(connectionId, query),
  searchTablesInEnvironment: (environmentId, query) => api().searchTablesInEnvironment(environmentId, query),

  describeTable: (connectionId, table) => api().describeTable(connectionId, table),
  readTable: (connectionId, table, input) => api().readTable(connectionId, table, input),
  insertRow: (connectionId, table, row) => api().insertRow(connectionId, table, row),
  updateRow: (connectionId, table, row) => api().updateRow(connectionId, table, row),
  deleteRow: (connectionId, table, row) => api().deleteRow(connectionId, table, row),

  previewSqlRisk: (sql) => api().previewSqlRisk(sql),
  executeSql: (connectionId, sql) => api().executeSql(connectionId, sql),

  checkForAppUpdate: () => api().checkForAppUpdate(),
  installLatestUpdate: () => api().installLatestUpdate(),
}
