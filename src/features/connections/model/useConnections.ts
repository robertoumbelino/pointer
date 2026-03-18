import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { ConnectionInput, ConnectionSummary } from '../../../../shared/db-types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { defaultPortByEngine, extractSqliteDatabaseName, getErrorMessage } from '../../../shared/lib/workspace-utils'
import {
  createConnectionDraft,
  createConnectionDraftFromConnection,
  type ConnectionDraft,
} from '../../../entities/workspace/types'

type UseConnectionsResult = {
  connections: ConnectionSummary[]
  setConnections: Dispatch<SetStateAction<ConnectionSummary[]>>
  selectedConnectionId: string
  setSelectedConnectionId: Dispatch<SetStateAction<string>>
  isCreateConnectionOpen: boolean
  setIsCreateConnectionOpen: Dispatch<SetStateAction<boolean>>
  connectionDraft: ConnectionDraft
  setConnectionDraft: Dispatch<SetStateAction<ConnectionDraft>>
  isConnectionSaving: boolean
  setIsConnectionSaving: Dispatch<SetStateAction<boolean>>
  isCreateConnectionTesting: boolean
  setIsCreateConnectionTesting: Dispatch<SetStateAction<boolean>>
  isEditConnectionOpen: boolean
  setIsEditConnectionOpen: Dispatch<SetStateAction<boolean>>
  editingConnectionId: string
  setEditingConnectionId: Dispatch<SetStateAction<string>>
  connectionEditDraft: ConnectionDraft
  setConnectionEditDraft: Dispatch<SetStateAction<ConnectionDraft>>
  isConnectionUpdating: boolean
  setIsConnectionUpdating: Dispatch<SetStateAction<boolean>>
  isEditConnectionTesting: boolean
  setIsEditConnectionTesting: Dispatch<SetStateAction<boolean>>
  isEditConnectionPasswordLoading: boolean
  loadConnections: (environmentId: string) => Promise<ConnectionSummary[]>
  handleCreateConnection: (selectedEnvironmentId: string) => Promise<ConnectionSummary | null>
  handleTestCreateConnection: (selectedEnvironmentId: string) => Promise<boolean>
  openEditConnectionDialog: (connection: ConnectionSummary) => void
  handleUpdateConnection: (selectedEnvironmentId: string) => Promise<ConnectionSummary | null>
  handleTestEditConnection: (selectedEnvironmentId: string) => Promise<boolean>
  handlePickSqliteFile: (target: 'create' | 'edit') => Promise<void>
  handleDeleteConnection: (selectedEnvironmentId: string, connectionId: string) => Promise<boolean>
}

export function useConnections(): UseConnectionsResult {
  const [connections, setConnections] = useState<ConnectionSummary[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')

  const [isCreateConnectionOpen, setIsCreateConnectionOpen] = useState(false)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(createConnectionDraft(''))
  const [isConnectionSaving, setIsConnectionSaving] = useState(false)
  const [isCreateConnectionTesting, setIsCreateConnectionTesting] = useState(false)
  const [isEditConnectionOpen, setIsEditConnectionOpen] = useState(false)
  const [editingConnectionId, setEditingConnectionId] = useState<string>('')
  const [connectionEditDraft, setConnectionEditDraft] = useState<ConnectionDraft>(createConnectionDraft(''))
  const [isConnectionUpdating, setIsConnectionUpdating] = useState(false)
  const [isEditConnectionTesting, setIsEditConnectionTesting] = useState(false)
  const [isEditConnectionPasswordLoading, setIsEditConnectionPasswordLoading] = useState(false)
  const editingConnectionIdRef = useRef('')

  useEffect(() => {
    editingConnectionIdRef.current = editingConnectionId
  }, [editingConnectionId])

  useEffect(() => {
    if (!editingConnectionId) {
      setIsEditConnectionPasswordLoading(false)
    }
  }, [editingConnectionId])

  const loadConnections = useCallback(async (environmentId: string): Promise<ConnectionSummary[]> => {
    const all = await pointerApi.listConnections(environmentId)
    return all
  }, [])

  const handleCreateConnection = useCallback(async (selectedEnvironmentId: string): Promise<ConnectionSummary | null> => {
    try {
      setIsConnectionSaving(true)
      const payload: ConnectionInput = {
        ...connectionDraft,
        environmentId: selectedEnvironmentId,
        name: connectionDraft.name.trim(),
        filePath: connectionDraft.filePath.trim(),
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      if (!selectedEnvironmentId) {
        throw new Error('Selecione um ambiente antes de criar conexão.')
      }

      if (!payload.name) {
        throw new Error('Informe o nome da conexão.')
      }

      if (payload.engine === 'sqlite') {
        if (!payload.filePath) {
          throw new Error('Selecione o arquivo do banco SQLite.')
        }
      } else if (!payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const created = await pointerApi.createConnection(payload)
      toast.success(`Conexão ${created.name} criada.`)

      setIsCreateConnectionOpen(false)
      setConnectionDraft(createConnectionDraft(selectedEnvironmentId))

      return created
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    } finally {
      setIsConnectionSaving(false)
    }
  }, [connectionDraft])

  const handleTestCreateConnection = useCallback(async (selectedEnvironmentId: string): Promise<boolean> => {
    if (!selectedEnvironmentId) {
      toast.error('Selecione um ambiente antes de testar a conexão.')
      return false
    }

    try {
      setIsCreateConnectionTesting(true)
      const payload: ConnectionInput = {
        ...connectionDraft,
        environmentId: selectedEnvironmentId,
        name: connectionDraft.name.trim(),
        filePath: connectionDraft.filePath.trim(),
        host: connectionDraft.host.trim(),
        database: connectionDraft.database.trim(),
        user: connectionDraft.user.trim(),
      }

      const result = await pointerApi.testConnectionInput(payload)
      toast.success(`Conexão OK em ${result.latencyMs}ms`)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    } finally {
      setIsCreateConnectionTesting(false)
    }
  }, [connectionDraft])

  const openEditConnectionDialog = useCallback((connection: ConnectionSummary): void => {
    setEditingConnectionId(connection.id)
    setConnectionEditDraft(createConnectionDraftFromConnection(connection))
    setIsEditConnectionOpen(true)

    if (connection.engine === 'sqlite') {
      setIsEditConnectionPasswordLoading(false)
      return
    }

    setIsEditConnectionPasswordLoading(true)
    void pointerApi.getConnectionPassword(connection.id)
      .then((password) => {
        if (editingConnectionIdRef.current !== connection.id) {
          return
        }

        setConnectionEditDraft((current) => ({
          ...current,
          password,
        }))
      })
      .catch((error) => {
        if (editingConnectionIdRef.current !== connection.id) {
          return
        }

        toast.error(getErrorMessage(error))
      })
      .finally(() => {
        if (editingConnectionIdRef.current === connection.id) {
          setIsEditConnectionPasswordLoading(false)
        }
      })
  }, [])

  const handleUpdateConnection = useCallback(async (selectedEnvironmentId: string): Promise<ConnectionSummary | null> => {
    if (!editingConnectionId || !selectedEnvironmentId) {
      return null
    }

    try {
      setIsConnectionUpdating(true)
      const payload: ConnectionInput = {
        ...connectionEditDraft,
        environmentId: selectedEnvironmentId,
        name: connectionEditDraft.name.trim(),
        filePath: connectionEditDraft.filePath.trim(),
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      if (!payload.name) {
        throw new Error('Informe o nome da conexão.')
      }

      if (payload.engine === 'sqlite') {
        if (!payload.filePath) {
          throw new Error('Selecione o arquivo do banco SQLite.')
        }
      } else if (!payload.host || !payload.database || !payload.user) {
        throw new Error('Preencha os campos obrigatórios da conexão.')
      }

      const updated = await pointerApi.updateConnection(editingConnectionId, payload)
      toast.success(`Conexão ${updated.name} atualizada.`)
      setIsEditConnectionOpen(false)
      setEditingConnectionId('')
      setConnectionEditDraft(createConnectionDraft(selectedEnvironmentId))
      return updated
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    } finally {
      setIsConnectionUpdating(false)
    }
  }, [connectionEditDraft, editingConnectionId])

  const handleTestEditConnection = useCallback(async (selectedEnvironmentId: string): Promise<boolean> => {
    if (!editingConnectionId || !selectedEnvironmentId) {
      return false
    }

    try {
      setIsEditConnectionTesting(true)
      const payload: ConnectionInput = {
        ...connectionEditDraft,
        environmentId: selectedEnvironmentId,
        name: connectionEditDraft.name.trim(),
        filePath: connectionEditDraft.filePath.trim(),
        host: connectionEditDraft.host.trim(),
        database: connectionEditDraft.database.trim(),
        user: connectionEditDraft.user.trim(),
      }

      const result = await pointerApi.testConnectionInput(payload, editingConnectionId)
      toast.success(`Conexão OK em ${result.latencyMs}ms`)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    } finally {
      setIsEditConnectionTesting(false)
    }
  }, [connectionEditDraft, editingConnectionId])

  const handlePickSqliteFile = useCallback(async (target: 'create' | 'edit'): Promise<void> => {
    try {
      const selectedPath = await pointerApi.pickSqliteFile()
      if (!selectedPath) {
        return
      }

      if (target === 'create') {
        setConnectionDraft((current) => ({
          ...current,
          filePath: selectedPath,
          database: current.database || extractSqliteDatabaseName(selectedPath),
        }))
        return
      }

      setConnectionEditDraft((current) => ({
        ...current,
        filePath: selectedPath,
        database: current.database || extractSqliteDatabaseName(selectedPath),
      }))
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [])

  const handleDeleteConnection = useCallback(async (selectedEnvironmentId: string, connectionId: string): Promise<boolean> => {
    if (!selectedEnvironmentId) {
      return false
    }

    const target = connections.find((connection) => connection.id === connectionId) ?? null

    if (!target) {
      return false
    }

    if (!window.confirm(`Remover a conexão "${target.name}"?`)) {
      return false
    }

    try {
      await pointerApi.deleteConnection(target.id)
      toast.success('Conexão removida.')
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }, [connections])

  return {
    connections,
    setConnections,
    selectedConnectionId,
    setSelectedConnectionId,
    isCreateConnectionOpen,
    setIsCreateConnectionOpen,
    connectionDraft,
    setConnectionDraft,
    isConnectionSaving,
    setIsConnectionSaving,
    isCreateConnectionTesting,
    setIsCreateConnectionTesting,
    isEditConnectionOpen,
    setIsEditConnectionOpen,
    editingConnectionId,
    setEditingConnectionId,
    connectionEditDraft,
    setConnectionEditDraft,
    isConnectionUpdating,
    setIsConnectionUpdating,
    isEditConnectionTesting,
    setIsEditConnectionTesting,
    isEditConnectionPasswordLoading,
    loadConnections,
    handleCreateConnection,
    handleTestCreateConnection,
    openEditConnectionDialog,
    handleUpdateConnection,
    handleTestEditConnection,
    handlePickSqliteFile,
    handleDeleteConnection,
  }
}

export function updateConnectionEngineDraft(current: ConnectionDraft, nextEngine: ConnectionInput['engine']): ConnectionDraft {
  const nextPort = nextEngine === 'sqlite' ? 0 : defaultPortByEngine(nextEngine)

  return {
    ...current,
    engine: nextEngine,
    port: nextPort,
  }
}
