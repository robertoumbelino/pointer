import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ConnectionSummary, TableSearchHit } from '../../../shared/db-types'
import {
  createSqlTab,
  createConnectionDraft,
  type ConnectionDraft,
  type EditingCell,
  type EnvironmentWorkspaceSnapshot,
  type PersistedWorkspaceStorage,
  type WorkTab,
} from '../../entities/workspace/types'
import { WORKSPACE_STORAGE_KEY } from '../../shared/constants/app'
import {
  buildPersistedWorkspaceStorage,
  restorePersistedWorkspaceStorage,
} from '../../shared/storage/workspace-storage'

type UseWorkbenchPersistenceParams = {
  selectedEnvironmentId: string
  setConnections: Dispatch<SetStateAction<ConnectionSummary[]>>
  setSelectedConnectionId: Dispatch<SetStateAction<string>>
  setSelectedSchema: Dispatch<SetStateAction<string>>
  setCatalogHits: Dispatch<SetStateAction<TableSearchHit[]>>
  setCommandHits: Dispatch<SetStateAction<TableSearchHit[]>>
  setWorkTabs: Dispatch<SetStateAction<WorkTab[]>>
  setActiveTabId: Dispatch<SetStateAction<string>>
  setEditingCell: Dispatch<SetStateAction<EditingCell | null>>
  setConnectionDraft: Dispatch<SetStateAction<ConnectionDraft>>
  loadConnections: (environmentId: string) => Promise<void>
  loadEnvironmentCatalog: (environmentId: string) => Promise<void>
  workTabs: WorkTab[]
  activeTabId: string
  selectedSchema: string
  workTabsRef: MutableRefObject<WorkTab[]>
  activeTabIdRef: MutableRefObject<string>
  selectedSchemaRef: MutableRefObject<string>
  sqlTabCounterRef: MutableRefObject<number>
  environmentWorkspaceRef: MutableRefObject<Record<string, EnvironmentWorkspaceSnapshot>>
  previousEnvironmentIdRef: MutableRefObject<string>
  preferredEnvironmentIdRef: MutableRefObject<string>
}

export function useWorkbenchPersistence({
  selectedEnvironmentId,
  setConnections,
  setSelectedConnectionId,
  setSelectedSchema,
  setCatalogHits,
  setCommandHits,
  setWorkTabs,
  setActiveTabId,
  setEditingCell,
  setConnectionDraft,
  loadConnections,
  loadEnvironmentCatalog,
  workTabs,
  activeTabId,
  selectedSchema,
  workTabsRef,
  activeTabIdRef,
  selectedSchemaRef,
  sqlTabCounterRef,
  environmentWorkspaceRef,
  previousEnvironmentIdRef,
  preferredEnvironmentIdRef,
}: UseWorkbenchPersistenceParams): void {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as PersistedWorkspaceStorage
      const restored = restorePersistedWorkspaceStorage(parsed)

      environmentWorkspaceRef.current = restored.environments
      preferredEnvironmentIdRef.current = restored.lastEnvironmentId
    } catch {
      environmentWorkspaceRef.current = {}
      preferredEnvironmentIdRef.current = ''
    }
  }, [environmentWorkspaceRef, preferredEnvironmentIdRef])

  useEffect(() => {
    const previousEnvironmentId = previousEnvironmentIdRef.current
    if (previousEnvironmentId) {
      environmentWorkspaceRef.current[previousEnvironmentId] = {
        workTabs: workTabsRef.current,
        activeTabId: activeTabIdRef.current,
        sqlTabCounter: sqlTabCounterRef.current,
        selectedSchema: selectedSchemaRef.current,
      }
    }

    if (!selectedEnvironmentId) {
      setConnections([])
      setSelectedConnectionId('')
      setSelectedSchema('all')
      setCatalogHits([])
      setCommandHits([])
      setWorkTabs([createSqlTab('sql:1', 'SQL 1')])
      setActiveTabId('sql:1')
      sqlTabCounterRef.current = 2
      setEditingCell(null)
      previousEnvironmentIdRef.current = ''
      return
    }

    setConnectionDraft(createConnectionDraft(selectedEnvironmentId))
    setConnections([])
    setSelectedConnectionId('')
    setCatalogHits([])
    setCommandHits([])

    const snapshot = environmentWorkspaceRef.current[selectedEnvironmentId]
    if (snapshot) {
      setWorkTabs(snapshot.workTabs)
      setActiveTabId(snapshot.activeTabId)
      sqlTabCounterRef.current = Math.max(2, snapshot.sqlTabCounter)
      setSelectedSchema(snapshot.selectedSchema || 'all')
    } else {
      setSelectedSchema('all')
      setWorkTabs([createSqlTab('sql:1', 'SQL 1')])
      setActiveTabId('sql:1')
      sqlTabCounterRef.current = 2
    }
    setEditingCell(null)

    void loadConnections(selectedEnvironmentId)
    void loadEnvironmentCatalog(selectedEnvironmentId)
    previousEnvironmentIdRef.current = selectedEnvironmentId
  }, [
    activeTabIdRef,
    environmentWorkspaceRef,
    loadConnections,
    loadEnvironmentCatalog,
    previousEnvironmentIdRef,
    selectedEnvironmentId,
    selectedSchemaRef,
    setActiveTabId,
    setCatalogHits,
    setCommandHits,
    setConnectionDraft,
    setConnections,
    setEditingCell,
    setSelectedConnectionId,
    setSelectedSchema,
    setWorkTabs,
    sqlTabCounterRef,
    workTabsRef,
  ])

  useEffect(() => {
    try {
      const snapshots: Record<string, EnvironmentWorkspaceSnapshot> = {
        ...environmentWorkspaceRef.current,
      }

      if (selectedEnvironmentId) {
        snapshots[selectedEnvironmentId] = {
          workTabs,
          activeTabId,
          sqlTabCounter: sqlTabCounterRef.current,
          selectedSchema,
        }
      }

      const storage = buildPersistedWorkspaceStorage(snapshots, selectedEnvironmentId)
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(storage))
    } catch {
      // best effort persistence
    }
  }, [activeTabId, environmentWorkspaceRef, selectedEnvironmentId, selectedSchema, sqlTabCounterRef, workTabs])
}
