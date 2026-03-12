import { useEffect } from 'react'
import { AlertCircle, Database, Loader2, X } from 'lucide-react'
import type { DatabaseEngine, TableRef, TableSchema } from '../../../../shared/db-types'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { engineLabel, formatTableLabel } from '../../../shared/lib/workspace-utils'

export type TableStructureSheetTarget = {
  connectionId: string
  connectionName: string
  engine: DatabaseEngine
  table: TableRef
}

type TableStructureSheetProps = {
  isOpen: boolean
  isLoading: boolean
  error: string | null
  schema: TableSchema | null
  target: TableStructureSheetTarget | null
  onClose: () => void
}

export function TableStructureSheet({
  isOpen,
  isLoading,
  error,
  schema,
  target,
  onClose,
}: TableStructureSheetProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <>
      <button
        type='button'
        aria-label='Fechar estrutura da tabela'
        className='fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm'
        onClick={onClose}
      />

      <aside className='fixed bottom-3 right-3 top-3 z-[60] flex w-[370px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/75 bg-[#020617] shadow-[0_10px_32px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(51,65,85,0.25)]'>
        <div aria-hidden className='absolute inset-0 bg-[#020617]' />

        <div className='relative z-10 flex items-start justify-between gap-2 border-b border-slate-800/80 bg-[#020617] px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400'>Estrutura da Tabela</p>
            <h3 className='truncate text-sm font-semibold text-slate-100'>
              {target ? formatTableLabel(target.table) : 'Tabela'}
            </h3>
            <p className='truncate text-[11px] text-slate-500'>
              {target ? `${target.connectionName} • ${engineLabel(target.engine)}` : '-'}
            </p>
            {target && (
              <p className='truncate text-[11px] text-slate-500'>
                {target.table.fqName}
              </p>
            )}
          </div>
          <Button variant='ghost' size='icon' className='h-7 w-7' onClick={onClose} aria-label='Fechar estrutura'>
            <X className='h-4 w-4' />
          </Button>
        </div>

        <div className='relative z-10 flex-1 space-y-2 overflow-auto bg-[#020617] px-3 py-2.5'>
          {isLoading && (
            <div className='pointer-card-soft flex items-center gap-2 px-3 py-3 text-sm text-slate-300'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span>Carregando estrutura...</span>
            </div>
          )}

          {!isLoading && error && (
            <div className='pointer-card-soft rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2.5'>
              <p className='flex items-center gap-2 text-sm font-medium text-rose-200'>
                <AlertCircle className='h-4 w-4' />
                Não foi possível carregar a estrutura
              </p>
              <p className='mt-1 text-xs leading-relaxed text-rose-100/90'>{error}</p>
            </div>
          )}

          {!isLoading && !error && schema && (
            <>
              <div className='pointer-card-soft rounded-lg px-3 py-2 text-xs text-slate-300'>
                <p className='flex items-center gap-1.5'>
                  <Database className='h-3.5 w-3.5 text-slate-400' />
                  {schema.columns.length} coluna(s) • PK: {schema.primaryKey.length > 0 ? schema.primaryKey.join(', ') : 'nenhuma'}
                </p>
              </div>

              <div className='space-y-2 pb-1'>
                {schema.columns.map((column) => {
                  const defaultValue = column.defaultValue?.trim() || null

                  return (
                    <div key={column.name} className='pointer-card-soft rounded-lg px-3 py-2.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <p className='truncate text-sm font-medium text-slate-100'>{column.name}</p>
                        <p className='truncate font-mono text-[11px] text-cyan-200'>{column.dataType}</p>
                      </div>

                      <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                        {column.isPrimaryKey && <Badge>PK</Badge>}
                        {column.foreignKey && <Badge variant='secondary'>FK</Badge>}
                        <Badge variant='secondary'>{column.nullable ? 'NULL' : 'NOT NULL'}</Badge>
                        {column.enumValues && column.enumValues.length > 0 && <Badge variant='secondary'>ENUM</Badge>}
                      </div>

                      <div className='mt-2 space-y-1 text-[11px] text-slate-400'>
                        <p>{column.nullable ? 'Permite valor nulo.' : 'Campo obrigatório na linha.'}</p>
                        <p>{defaultValue ? `Default: ${defaultValue}` : 'Sem valor default.'}</p>
                        {column.foreignKey && (
                          <p>
                            Referência: {column.foreignKey.table.fqName}.{column.foreignKey.column}
                          </p>
                        )}
                        {column.enumValues && column.enumValues.length > 0 && (
                          <p>Enum: {column.enumValues.join(', ')}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
