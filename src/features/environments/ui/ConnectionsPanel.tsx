import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Database, Eye, EyeOff, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ConnectionInput, ConnectionSummary, DatabaseEngine } from '../../../../shared/db-types'
import { createConnectionDraft, type ConnectionDraft } from '../../../entities/workspace/types'
import { SIDEBAR_SECTION_LABEL_CLASS } from '../../../shared/constants/app'
import { defaultPortByEngine, engineShortLabel } from '../../../shared/lib/workspace-utils'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { cn } from '../../../lib/utils'

type ConnectionsPanelProps = {
  connections: ConnectionSummary[]
  openEditConnectionDialog: (connection: ConnectionSummary) => void
  handleDeleteConnection: (connectionId: string) => Promise<void>
  isCreateConnectionOpen: boolean
  setIsCreateConnectionOpen: Dispatch<SetStateAction<boolean>>
  selectedEnvironmentId: string
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
  isEditConnectionPasswordLoading: boolean
  handleTestCreateConnection: () => Promise<void>
  handleCreateConnection: () => Promise<void>
  handlePickSqliteFile: (target: 'create' | 'edit') => Promise<void>
  handleTestEditConnection: () => Promise<void>
  handleUpdateConnection: () => Promise<void>
}

export function ConnectionsPanel({
  connections,
  openEditConnectionDialog,
  handleDeleteConnection,
  isCreateConnectionOpen,
  setIsCreateConnectionOpen,
  selectedEnvironmentId,
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
  isEditConnectionPasswordLoading,
  handleTestCreateConnection,
  handleCreateConnection,
  handlePickSqliteFile,
  handleTestEditConnection,
  handleUpdateConnection,
}: ConnectionsPanelProps): JSX.Element {
  const [isEditPasswordVisible, setIsEditPasswordVisible] = useState(false)

  useEffect(() => {
    if (!isEditConnectionOpen) {
      setIsEditPasswordVisible(false)
    }
  }, [isEditConnectionOpen])

  return (
    <>
      <label className={cn(SIDEBAR_SECTION_LABEL_CLASS, 'mt-3')}>CONEXÕES</label>
      <div className='max-h-36 space-y-1.5 overflow-y-auto pr-1'>
        {connections.map((connection) => {
          return (
            <div
              key={connection.id}
              className='flex w-full items-center gap-2 rounded-md border border-slate-800/70 bg-slate-900/40 px-2 py-1.5 text-left text-[12.5px] text-slate-300 transition-colors hover:bg-slate-800/50'
            >
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                <Database className='h-3.5 w-3.5 shrink-0' />
                <span className='truncate'>{connection.name}</span>
                <span className='ml-auto rounded border border-slate-700/80 bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300'>
                  {engineShortLabel(connection.engine)}
                </span>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0'
                onClick={() => void openEditConnectionDialog(connection)}
              >
                <Pencil className='h-3.5 w-3.5' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0'
                onClick={() => void handleDeleteConnection(connection.id)}
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
            </div>
          )
        })}

        {connections.length === 0 && <p className='text-[12.5px] text-slate-500'>Nenhuma conexão criada.</p>}
      </div>

      <div className='mt-2.5 flex gap-2'>
        <Dialog
          open={isCreateConnectionOpen}
          onOpenChange={(open) => {
            setIsCreateConnectionOpen(open)
            if (!open) {
              setIsCreateConnectionTesting(false)
              setConnectionDraft(createConnectionDraft(selectedEnvironmentId))
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className='h-8 flex-1 text-[13px]' size='sm' disabled={!selectedEnvironmentId}>
              <Plus className='mr-1.5 h-3.5 w-3.5' /> Nova
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova conexão</DialogTitle>
              <DialogDescription>
                Adicione sua nova conexão com o banco de dados.
              </DialogDescription>
            </DialogHeader>

            <div className='grid grid-cols-2 gap-3 py-2'>
              <div className='col-span-2'>
                <Input
                  placeholder='Nome da conexão'
                  value={connectionDraft.name}
                  onChange={(event) =>
                    setConnectionDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <select
                className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                value={connectionDraft.engine}
                onChange={(event) => {
                  const engine = event.target.value as DatabaseEngine
                  setConnectionDraft((current) => ({
                    ...current,
                    engine,
                    port: defaultPortByEngine(engine),
                    host: engine === 'sqlite' ? '' : current.host || 'localhost',
                    user: engine === 'sqlite' ? '' : current.user,
                    sslMode: engine === 'sqlite' ? 'disable' : current.sslMode,
                    password: engine === 'sqlite' ? '' : current.password,
                  }))
                }}
              >
                <option value='postgres'>PostgreSQL</option>
                <option value='clickhouse'>ClickHouse</option>
                <option value='sqlite'>SQLite</option>
              </select>
              {connectionDraft.engine === 'sqlite' ? (
                <div className='col-span-2 flex items-center gap-2'>
                  <Input
                    className='flex-1'
                    placeholder='Arquivo SQLite (.db, .sqlite, .sqlite3)'
                    value={connectionDraft.filePath}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({ ...current, filePath: event.target.value }))
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    className='h-9 shrink-0'
                    onClick={() => void handlePickSqliteFile('create')}
                  >
                    <FolderOpen className='mr-1.5 h-3.5 w-3.5' />
                    Selecionar arquivo
                  </Button>
                </div>
              ) : (
                <>
                  <select
                    className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                    value={connectionDraft.sslMode}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({
                        ...current,
                        sslMode: event.target.value as ConnectionInput['sslMode'],
                      }))
                    }
                  >
                    <option value='disable'>SSL desabilitado</option>
                    <option value='require'>SSL obrigatório</option>
                  </select>
                  <div className='col-span-2'>
                    <Input
                      placeholder='Host'
                      value={connectionDraft.host}
                      onChange={(event) =>
                        setConnectionDraft((current) => ({ ...current, host: event.target.value }))
                      }
                    />
                  </div>
                  <Input
                    placeholder='Porta'
                    type='number'
                    value={connectionDraft.port}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({
                        ...current,
                        port: Number(event.target.value) || defaultPortByEngine(current.engine),
                      }))
                    }
                  />
                  <Input
                    placeholder={connectionDraft.engine === 'clickhouse' ? 'Database (ex: default)' : 'Database'}
                    value={connectionDraft.database}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({ ...current, database: event.target.value }))
                    }
                  />
                  <Input
                    placeholder='Usuário'
                    value={connectionDraft.user}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({ ...current, user: event.target.value }))
                    }
                  />
                  <Input
                    placeholder='Senha'
                    type='password'
                    value={connectionDraft.password}
                    onChange={(event) =>
                      setConnectionDraft((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                variant='secondary'
                className='h-9 w-[132px]'
                onClick={() => setIsCreateConnectionOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant='outline'
                className='h-9 w-[132px]'
                onClick={() => void handleTestCreateConnection()}
                disabled={isConnectionSaving || isCreateConnectionTesting}
              >
                {isCreateConnectionTesting ? 'Testando...' : 'Testar conexão'}
              </Button>
              <Button
                className='h-9 w-[132px]'
                onClick={() => void handleCreateConnection()}
                disabled={isConnectionSaving || isCreateConnectionTesting}
              >
                {isConnectionSaving ? 'Salvando...' : 'Salvar conexão'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditConnectionOpen}
          onOpenChange={(open) => {
            setIsEditConnectionOpen(open)
            if (!open) {
              setIsEditConnectionTesting(false)
              setEditingConnectionId('')
              setConnectionEditDraft(createConnectionDraft(selectedEnvironmentId))
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar conexão</DialogTitle>
              <DialogDescription>
                Atualize os dados da conexão selecionada e revise a senha atual quando necessário.
              </DialogDescription>
            </DialogHeader>

            <div className='grid grid-cols-2 gap-3 py-2'>
              <div className='col-span-2'>
                <Input
                  placeholder='Nome da conexão'
                  value={connectionEditDraft.name}
                  onChange={(event) =>
                    setConnectionEditDraft((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <select
                className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                value={connectionEditDraft.engine}
                onChange={(event) => {
                  const engine = event.target.value as DatabaseEngine
                  setConnectionEditDraft((current) => ({
                    ...current,
                    engine,
                    port: defaultPortByEngine(engine),
                    host: engine === 'sqlite' ? '' : current.host || 'localhost',
                    user: engine === 'sqlite' ? '' : current.user,
                    sslMode: engine === 'sqlite' ? 'disable' : current.sslMode,
                    password: engine === 'sqlite' ? '' : current.password,
                  }))
                }}
              >
                <option value='postgres'>PostgreSQL</option>
                <option value='clickhouse'>ClickHouse</option>
                <option value='sqlite'>SQLite</option>
              </select>
              {connectionEditDraft.engine === 'sqlite' ? (
                <div className='col-span-2 flex items-center gap-2'>
                  <Input
                    className='flex-1'
                    placeholder='Arquivo SQLite (.db, .sqlite, .sqlite3)'
                    value={connectionEditDraft.filePath}
                    onChange={(event) =>
                      setConnectionEditDraft((current) => ({ ...current, filePath: event.target.value }))
                    }
                  />
                  <Button
                    type='button'
                    variant='outline'
                    className='h-9 shrink-0'
                    onClick={() => void handlePickSqliteFile('edit')}
                  >
                    <FolderOpen className='mr-1.5 h-3.5 w-3.5' />
                    Selecionar arquivo
                  </Button>
                </div>
              ) : (
                <>
                  <select
                    className='h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none ring-slate-300/45 focus:ring-2'
                    value={connectionEditDraft.sslMode}
                    onChange={(event) =>
                      setConnectionEditDraft((current) => ({
                        ...current,
                        sslMode: event.target.value as ConnectionInput['sslMode'],
                      }))
                    }
                  >
                    <option value='disable'>SSL desabilitado</option>
                    <option value='require'>SSL obrigatório</option>
                  </select>
                  <div className='col-span-2'>
                    <Input
                      placeholder='Host'
                      value={connectionEditDraft.host}
                      onChange={(event) =>
                        setConnectionEditDraft((current) => ({ ...current, host: event.target.value }))
                      }
                    />
                  </div>
                  <Input
                    placeholder='Porta'
                    type='number'
                    value={connectionEditDraft.port}
                    onChange={(event) =>
                      setConnectionEditDraft((current) => ({
                        ...current,
                        port: Number(event.target.value) || defaultPortByEngine(current.engine),
                      }))
                    }
                  />
                  <Input
                    placeholder={connectionEditDraft.engine === 'clickhouse' ? 'Database (ex: default)' : 'Database'}
                    value={connectionEditDraft.database}
                    onChange={(event) =>
                      setConnectionEditDraft((current) => ({ ...current, database: event.target.value }))
                    }
                  />
                  <Input
                    placeholder='Usuário'
                    value={connectionEditDraft.user}
                    onChange={(event) =>
                      setConnectionEditDraft((current) => ({ ...current, user: event.target.value }))
                    }
                  />
                  <div className='relative'>
                    <Input
                      placeholder={isEditConnectionPasswordLoading ? 'Carregando senha...' : 'Senha'}
                      type={isEditPasswordVisible ? 'text' : 'password'}
                      value={connectionEditDraft.password}
                      autoComplete='current-password'
                      disabled={isEditConnectionPasswordLoading}
                      className='pr-10'
                      onChange={(event) =>
                        setConnectionEditDraft((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                    <button
                      type='button'
                      className='absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40'
                      onClick={() => setIsEditPasswordVisible((current) => !current)}
                      disabled={isEditConnectionPasswordLoading || !connectionEditDraft.password}
                      aria-label={isEditPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                      title={isEditPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {isEditPasswordVisible ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                    </button>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                variant='secondary'
                className='h-9 w-[132px]'
                onClick={() => setIsEditConnectionOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                variant='outline'
                className='h-9 w-[132px]'
                onClick={() => void handleTestEditConnection()}
                disabled={isConnectionUpdating || isEditConnectionTesting}
              >
                {isEditConnectionTesting ? 'Testando...' : 'Testar conexão'}
              </Button>
              <Button
                className='h-9 w-[132px]'
                onClick={() => void handleUpdateConnection()}
                disabled={isConnectionUpdating || isEditConnectionTesting}
              >
                {isConnectionUpdating ? 'Salvando...' : 'Salvar conexão'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
