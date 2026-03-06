import { Plus } from 'lucide-react'
import { Button } from '../../../components/ui/button'

type WorkspaceEmptyStateProps = {
  onCreateEnvironment: () => void
}

export function WorkspaceEmptyState({ onCreateEnvironment }: WorkspaceEmptyStateProps): JSX.Element {
  return (
    <div className='flex flex-1 items-center justify-center p-8'>
      <div className='w-full max-w-xl rounded-xl border border-slate-800/70 bg-slate-900/40 p-6'>
        <p className='text-[11px] uppercase tracking-[0.2em] text-slate-500'>Primeiros passos</p>
        <h2 className='mt-2 text-xl font-semibold tracking-tight'>Configure seu primeiro ambiente</h2>
        <p className='mt-2 text-sm text-slate-400'>
          Crie um ambiente (ex: Local, Produção) e depois adicione conexões PostgreSQL, ClickHouse e/ou SQLite.
        </p>
        <div className='mt-5 flex flex-wrap items-center gap-2'>
          <Button onClick={onCreateEnvironment}>
            <Plus className='mr-1.5 h-3.5 w-3.5' /> Criar ambiente
          </Button>
          <span className='text-xs text-slate-500'>Depois você poderá trocar com Cmd+R</span>
        </div>
        <div className='mt-6 rounded-lg border border-slate-800/70 bg-slate-950/60 p-4 text-xs text-slate-400'>
          <p className='mb-1 font-medium text-slate-300'>Fluxo sugerido</p>
          <p>1. Criar ambiente</p>
          <p>2. Adicionar conexão Postgres/ClickHouse/SQLite</p>
          <p>3. Usar Cmd+K para buscar tabelas no ambiente</p>
        </div>
      </div>
    </div>
  )
}
