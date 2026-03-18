import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { ConnectionSummary, EnvironmentSummary, TableSearchHit } from '../../../shared/db-types'
import { createConnectionDraft, type ConnectionDraft, type WorkTab } from '../../entities/workspace/types'
import { pointerApi } from '../../shared/api/pointer-api'
import { AUTO_SQL_CONNECTION_ID } from '../../shared/constants/app'
import { getErrorMessage } from '../../shared/lib/workspace-utils'

type UseWorkbenchFlowsParams = {
  loadEnvironments: () => Promise<EnvironmentSummary[]>
  setEnvironments: Dispatch<SetStateAction<EnvironmentSummary[]>>
  setSelectedEnvironmentId: Dispatch<SetStateAction<string>>
  preferredEnvironmentIdRef: MutableRefObject<string>

  loadConnections: (environmentId: string) => Promise<ConnectionSummary[]>
  setConnections: Dispatch<SetStateAction<ConnectionSummary[]>>
  setSelectedConnectionId: Dispatch<SetStateAction<string>>
  setWorkTabs: Dispatch<SetStateAction<WorkTab[]>>

  setCatalogHits: Dispatch<SetStateAction<TableSearchHit[]>>
  setCommandHits: Dispatch<SetStateAction<TableSearchHit[]>>

  selectedEnvironmentId: string

  handleCreateEnvironment: () => Promise<EnvironmentSummary | null>
  handleUpdateEnvironment: () => Promise<EnvironmentSummary | null>
  handleDeleteEnvironment: () => Promise<boolean>
  setConnectionDraft: Dispatch<SetStateAction<ConnectionDraft>>
  setIsCreateConnectionOpen: Dispatch<SetStateAction<boolean>>

  handleCreateConnection: (selectedEnvironmentId: string) => Promise<ConnectionSummary | null>
  handleTestCreateConnection: (selectedEnvironmentId: string) => Promise<boolean>
  handleUpdateConnection: (selectedEnvironmentId: string) => Promise<ConnectionSummary | null>
  handleTestEditConnection: (selectedEnvironmentId: string) => Promise<boolean>
  handleDeleteConnection: (selectedEnvironmentId: string, connectionId: string) => Promise<boolean>
}

type UseWorkbenchFlowsResult = {
  loadEnvironmentsWithSelection: () => Promise<void>
  loadConnectionsWithSelection: (environmentId: string) => Promise<void>
  loadEnvironmentCatalog: (environmentId: string) => Promise<void>
  handleCreateEnvironmentFlow: () => Promise<void>
  handleUpdateEnvironmentFlow: () => Promise<void>
  handleDeleteEnvironmentFlow: () => Promise<void>
  handleCreateConnectionFlow: () => Promise<void>
  handleTestCreateConnectionFlow: () => Promise<void>
  handleUpdateConnectionFlow: () => Promise<void>
  handleTestEditConnectionFlow: () => Promise<void>
  handleDeleteConnectionFlow: (connectionId: string) => Promise<void>
}

export function useWorkbenchFlows({
  loadEnvironments,
  setEnvironments,
  setSelectedEnvironmentId,
  preferredEnvironmentIdRef,
  loadConnections,
  setConnections,
  setSelectedConnectionId,
  setWorkTabs,
  setCatalogHits,
  setCommandHits,
  selectedEnvironmentId,
  handleCreateEnvironment,
  handleUpdateEnvironment,
  handleDeleteEnvironment,
  setConnectionDraft,
  setIsCreateConnectionOpen,
  handleCreateConnection,
  handleTestCreateConnection,
  handleUpdateConnection,
  handleTestEditConnection,
  handleDeleteConnection,
}: UseWorkbenchFlowsParams): UseWorkbenchFlowsResult {
  const connectionsRequestSeqRef = useRef(0)
  const catalogRequestSeqRef = useRef(0)

  const loadEnvironmentsWithSelection = useCallback(async (): Promise<void> => {
    try {
      const all = await loadEnvironments()
      setEnvironments(all)

      if (all.length > 0) {
        setSelectedEnvironmentId((current) => {
          if (current && all.some((environment) => environment.id === current)) {
            return current
          }

          const preferred = preferredEnvironmentIdRef.current
          if (preferred && all.some((environment) => environment.id === preferred)) {
            return preferred
          }

          return all[0].id
        })
      } else {
        setSelectedEnvironmentId('')
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }, [loadEnvironments, preferredEnvironmentIdRef, setEnvironments, setSelectedEnvironmentId])

  const loadConnectionsWithSelection = useCallback(async (environmentId: string): Promise<void> => {
    const requestSeq = ++connectionsRequestSeqRef.current

    try {
      const all = await loadConnections(environmentId)
      const isStale = requestSeq !== connectionsRequestSeqRef.current
      if (isStale) {
        return
      }

      setConnections(all)

      if (all.length > 0) {
        setSelectedConnectionId((current) => {
          if (current && all.some((connection) => connection.id === current)) {
            return current
          }

          return all[0].id
        })

        setWorkTabs((current) =>
          current.map((tab) => {
            if (tab.type !== 'sql') {
              return tab
            }

            if (tab.connectionId === AUTO_SQL_CONNECTION_ID) {
              return tab
            }

            if (all.some((connection) => connection.id === tab.connectionId)) {
              return tab
            }

            return {
              ...tab,
              connectionId: AUTO_SQL_CONNECTION_ID,
            }
          }),
        )
      } else {
        setSelectedConnectionId('')
      }
    } catch (error) {
      const isStale = requestSeq !== connectionsRequestSeqRef.current
      if (isStale) {
        return
      }

      toast.error(getErrorMessage(error))
    }
  }, [loadConnections, setConnections, setSelectedConnectionId, setWorkTabs])

  const loadEnvironmentCatalog = useCallback(async (environmentId: string): Promise<void> => {
    const requestSeq = ++catalogRequestSeqRef.current

    try {
      const hits = await pointerApi.searchTablesInEnvironment(environmentId, '')
      const isStale = requestSeq !== catalogRequestSeqRef.current
      if (isStale) {
        return
      }

      setCatalogHits(hits)
      setCommandHits(hits.slice(0, 220))
    } catch (error) {
      const isStale = requestSeq !== catalogRequestSeqRef.current
      if (isStale) {
        return
      }

      toast.error(getErrorMessage(error))
    }
  }, [setCatalogHits, setCommandHits])

  const handleCreateEnvironmentFlow = useCallback(async (): Promise<void> => {
    const created = await handleCreateEnvironment()
    if (!created) {
      return
    }

    setConnectionDraft(createConnectionDraft(created.id))
    setIsCreateConnectionOpen(true)
  }, [handleCreateEnvironment, setConnectionDraft, setIsCreateConnectionOpen])

  const handleUpdateEnvironmentFlow = useCallback(async (): Promise<void> => {
    await handleUpdateEnvironment()
  }, [handleUpdateEnvironment])

  const handleDeleteEnvironmentFlow = useCallback(async (): Promise<void> => {
    const removed = await handleDeleteEnvironment()
    if (!removed) {
      return
    }

    await loadEnvironmentsWithSelection()
  }, [handleDeleteEnvironment, loadEnvironmentsWithSelection])

  const handleCreateConnectionFlow = useCallback(async (): Promise<void> => {
    if (!selectedEnvironmentId) {
      return
    }

    const created = await handleCreateConnection(selectedEnvironmentId)
    if (!created) {
      return
    }

    await loadConnectionsWithSelection(selectedEnvironmentId)
    await loadEnvironmentCatalog(selectedEnvironmentId)
    setSelectedConnectionId(created.id)
  }, [
    handleCreateConnection,
    loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    selectedEnvironmentId,
    setSelectedConnectionId,
  ])

  const handleTestCreateConnectionFlow = useCallback(async (): Promise<void> => {
    await handleTestCreateConnection(selectedEnvironmentId)
  }, [handleTestCreateConnection, selectedEnvironmentId])

  const handleUpdateConnectionFlow = useCallback(async (): Promise<void> => {
    if (!selectedEnvironmentId) {
      return
    }

    const updated = await handleUpdateConnection(selectedEnvironmentId)
    if (!updated) {
      return
    }

    await loadConnectionsWithSelection(selectedEnvironmentId)
    await loadEnvironmentCatalog(selectedEnvironmentId)
    setSelectedConnectionId(updated.id)
  }, [
    handleUpdateConnection,
    loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    selectedEnvironmentId,
    setSelectedConnectionId,
  ])

  const handleTestEditConnectionFlow = useCallback(async (): Promise<void> => {
    await handleTestEditConnection(selectedEnvironmentId)
  }, [handleTestEditConnection, selectedEnvironmentId])

  const handleDeleteConnectionFlow = useCallback(async (connectionId: string): Promise<void> => {
    if (!selectedEnvironmentId) {
      return
    }

    const removed = await handleDeleteConnection(selectedEnvironmentId, connectionId)
    if (!removed) {
      return
    }

    await loadConnectionsWithSelection(selectedEnvironmentId)
    await loadEnvironmentCatalog(selectedEnvironmentId)
  }, [
    handleDeleteConnection,
    loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    selectedEnvironmentId,
  ])

  return {
    loadEnvironmentsWithSelection,
    loadConnectionsWithSelection,
    loadEnvironmentCatalog,
    handleCreateEnvironmentFlow,
    handleUpdateEnvironmentFlow,
    handleDeleteEnvironmentFlow,
    handleCreateConnectionFlow,
    handleTestCreateConnectionFlow,
    handleUpdateConnectionFlow,
    handleTestEditConnectionFlow,
    handleDeleteConnectionFlow,
  }
}
