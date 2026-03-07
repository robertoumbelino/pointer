import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { ConnectionSummary, EnvironmentSummary, TableSearchHit } from '../../../../shared/db-types'
import type { ConnectionDraft, SidebarTableContextMenuState } from '../../../entities/workspace/types'
import { cn } from '../../../lib/utils'
import { ConnectionsPanel } from './ConnectionsPanel'
import { EnvironmentControls } from './EnvironmentControls'
import { SchemaCatalogPanel } from './SchemaCatalogPanel'

type EnvironmentSidebarProps = {
  environments: EnvironmentSummary[]
  connections: ConnectionSummary[]
  sidebarBackgroundStyle: CSSProperties
  selectedEnvironmentId: string
  setSelectedEnvironmentId: Dispatch<SetStateAction<string>>
  isCreateEnvironmentOpen: boolean
  setIsCreateEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentNameDraft: string
  setEnvironmentNameDraft: Dispatch<SetStateAction<string>>
  environmentColorDraft: string
  setEnvironmentColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentSaving: boolean
  isEditEnvironmentOpen: boolean
  setIsEditEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentEditNameDraft: string
  setEnvironmentEditNameDraft: Dispatch<SetStateAction<string>>
  environmentEditColorDraft: string
  setEnvironmentEditColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentUpdating: boolean
  handleCreateEnvironment: () => Promise<void>
  openEditEnvironmentDialog: () => void
  handleUpdateEnvironment: () => Promise<void>
  handleDeleteEnvironment: () => Promise<void>
  openEditConnectionDialog: (connection: ConnectionSummary) => void
  handleDeleteConnection: (connectionId: string) => Promise<void>
  isCreateConnectionOpen: boolean
  setIsCreateConnectionOpen: Dispatch<SetStateAction<boolean>>
  connectionDraft: ConnectionDraft
  setConnectionDraft: Dispatch<SetStateAction<ConnectionDraft>>
  isConnectionSaving: boolean
  isCreateConnectionTesting: boolean
  setIsCreateConnectionTesting: Dispatch<SetStateAction<boolean>>
  isEditConnectionOpen: boolean
  setIsEditConnectionOpen: Dispatch<SetStateAction<boolean>>
  setEditingConnectionId: Dispatch<SetStateAction<string>>
  connectionEditDraft: ConnectionDraft
  setConnectionEditDraft: Dispatch<SetStateAction<ConnectionDraft>>
  isConnectionUpdating: boolean
  isEditConnectionTesting: boolean
  setIsEditConnectionTesting: Dispatch<SetStateAction<boolean>>
  handleTestCreateConnection: () => Promise<void>
  handleCreateConnection: () => Promise<void>
  handlePickSqliteFile: (target: 'create' | 'edit') => Promise<void>
  handleTestEditConnection: () => Promise<void>
  handleUpdateConnection: () => Promise<void>
  selectedSchema: string
  setSelectedSchema: Dispatch<SetStateAction<string>>
  schemaOptions: string[]
  shortcutLabel: string
  setIsCommandOpen: Dispatch<SetStateAction<boolean>>
  filteredSidebarTables: TableSearchHit[]
  activeTabId: string
  setTableContextMenu: Dispatch<SetStateAction<SidebarTableContextMenuState | null>>
  openTableTab: (hit: TableSearchHit) => Promise<void>
}

export function EnvironmentSidebar({
  environments,
  connections,
  sidebarBackgroundStyle,
  selectedEnvironmentId,
  setSelectedEnvironmentId,
  isCreateEnvironmentOpen,
  setIsCreateEnvironmentOpen,
  environmentNameDraft,
  setEnvironmentNameDraft,
  environmentColorDraft,
  setEnvironmentColorDraft,
  isEnvironmentSaving,
  isEditEnvironmentOpen,
  setIsEditEnvironmentOpen,
  environmentEditNameDraft,
  setEnvironmentEditNameDraft,
  environmentEditColorDraft,
  setEnvironmentEditColorDraft,
  isEnvironmentUpdating,
  handleCreateEnvironment,
  openEditEnvironmentDialog,
  handleUpdateEnvironment,
  handleDeleteEnvironment,
  openEditConnectionDialog,
  handleDeleteConnection,
  isCreateConnectionOpen,
  setIsCreateConnectionOpen,
  connectionDraft,
  setConnectionDraft,
  isConnectionSaving,
  isCreateConnectionTesting,
  setIsCreateConnectionTesting,
  isEditConnectionOpen,
  setIsEditConnectionOpen,
  setEditingConnectionId,
  connectionEditDraft,
  setConnectionEditDraft,
  isConnectionUpdating,
  isEditConnectionTesting,
  setIsEditConnectionTesting,
  handleTestCreateConnection,
  handleCreateConnection,
  handlePickSqliteFile,
  handleTestEditConnection,
  handleUpdateConnection,
  selectedSchema,
  setSelectedSchema,
  schemaOptions,
  shortcutLabel,
  setIsCommandOpen,
  filteredSidebarTables,
  activeTabId,
  setTableContextMenu,
  openTableTab,
}: EnvironmentSidebarProps): JSX.Element {
  return (
    <aside
      className={cn(
        'flex w-[292px] shrink-0 flex-col gap-3 overflow-hidden',
        environments.length === 0 && 'hidden',
      )}
    >
      <div className='pointer-card overflow-hidden p-3.5' style={sidebarBackgroundStyle}>
        <EnvironmentControls
          environments={environments}
          connectionsCount={connections.length}
          selectedEnvironmentId={selectedEnvironmentId}
          setSelectedEnvironmentId={setSelectedEnvironmentId}
          isCreateEnvironmentOpen={isCreateEnvironmentOpen}
          setIsCreateEnvironmentOpen={setIsCreateEnvironmentOpen}
          environmentNameDraft={environmentNameDraft}
          setEnvironmentNameDraft={setEnvironmentNameDraft}
          environmentColorDraft={environmentColorDraft}
          setEnvironmentColorDraft={setEnvironmentColorDraft}
          isEnvironmentSaving={isEnvironmentSaving}
          isEditEnvironmentOpen={isEditEnvironmentOpen}
          setIsEditEnvironmentOpen={setIsEditEnvironmentOpen}
          environmentEditNameDraft={environmentEditNameDraft}
          setEnvironmentEditNameDraft={setEnvironmentEditNameDraft}
          environmentEditColorDraft={environmentEditColorDraft}
          setEnvironmentEditColorDraft={setEnvironmentEditColorDraft}
          isEnvironmentUpdating={isEnvironmentUpdating}
          handleCreateEnvironment={handleCreateEnvironment}
          openEditEnvironmentDialog={openEditEnvironmentDialog}
          handleUpdateEnvironment={handleUpdateEnvironment}
          handleDeleteEnvironment={handleDeleteEnvironment}
        />

        <ConnectionsPanel
          connections={connections}
          openEditConnectionDialog={openEditConnectionDialog}
          handleDeleteConnection={handleDeleteConnection}
          isCreateConnectionOpen={isCreateConnectionOpen}
          setIsCreateConnectionOpen={setIsCreateConnectionOpen}
          selectedEnvironmentId={selectedEnvironmentId}
          connectionDraft={connectionDraft}
          setConnectionDraft={setConnectionDraft}
          isConnectionSaving={isConnectionSaving}
          isCreateConnectionTesting={isCreateConnectionTesting}
          setIsCreateConnectionTesting={setIsCreateConnectionTesting}
          isEditConnectionOpen={isEditConnectionOpen}
          setIsEditConnectionOpen={setIsEditConnectionOpen}
          setEditingConnectionId={setEditingConnectionId}
          connectionEditDraft={connectionEditDraft}
          setConnectionEditDraft={setConnectionEditDraft}
          isConnectionUpdating={isConnectionUpdating}
          isEditConnectionTesting={isEditConnectionTesting}
          setIsEditConnectionTesting={setIsEditConnectionTesting}
          handleTestCreateConnection={handleTestCreateConnection}
          handleCreateConnection={handleCreateConnection}
          handlePickSqliteFile={handlePickSqliteFile}
          handleTestEditConnection={handleTestEditConnection}
          handleUpdateConnection={handleUpdateConnection}
        />
      </div>

      <div className='pointer-card flex min-h-0 flex-1 flex-col overflow-hidden'>
        <SchemaCatalogPanel
          selectedSchema={selectedSchema}
          setSelectedSchema={setSelectedSchema}
          schemaOptions={schemaOptions}
          shortcutLabel={shortcutLabel}
          setIsCommandOpen={setIsCommandOpen}
          filteredSidebarTables={filteredSidebarTables}
          activeTabId={activeTabId}
          setTableContextMenu={setTableContextMenu}
          openTableTab={openTableTab}
        />
      </div>
    </aside>
  )
}
