import { Command, Database, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '../../../components/ui/button'

type WorkspaceEmptyStateProps = {
  onCreateEnvironment: () => void
}

export function WorkspaceEmptyState({ onCreateEnvironment }: WorkspaceEmptyStateProps): JSX.Element {
  return (
    <div className='onboarding-stage relative flex h-full flex-1 items-center justify-center overflow-auto px-4 py-6 sm:px-6 lg:p-8'>
      <section className='onboarding-hero relative w-full max-w-[1320px] overflow-hidden p-4 sm:p-6 lg:p-8'>
        <div className='onboarding-glow onboarding-glow-left' />
        <div className='onboarding-glow onboarding-glow-right' />

        <div className='relative z-10 grid min-h-0 content-start items-start gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-stretch lg:gap-6'>
          <div className='pointer-card flex min-h-0 flex-col p-5 sm:p-6'>
            <div>
              <p className='onboarding-eyebrow'>Pointer Onboarding</p>
              <h2 className='onboarding-title mt-4'>Conecte seus bancos. Domine seus dados.</h2>
              <p className='onboarding-subtitle mt-3 max-w-[56ch]'>
                Monte seu workspace em minutos, organize ambientes com segurança e comece a explorar tabelas SQL com
                fluidez desde o primeiro clique.
              </p>
              <div className='mt-6 grid gap-3 sm:grid-cols-3'>
                <div className='onboarding-chip'>
                  <div className='onboarding-chip-icon'>
                    <ShieldCheck className='h-4 w-4' />
                  </div>
                  <p className='onboarding-chip-title'>Segurança local</p>
                  <p className='onboarding-chip-text'>Credenciais isoladas e fluxo seguro para execução SQL.</p>
                </div>
                <div className='onboarding-chip'>
                  <div className='onboarding-chip-icon'>
                    <Database className='h-4 w-4' />
                  </div>
                  <p className='onboarding-chip-title'>Multibanco real</p>
                  <p className='onboarding-chip-text'>PostgreSQL, ClickHouse e SQLite no mesmo ambiente.</p>
                </div>
                <div className='onboarding-chip'>
                  <div className='onboarding-chip-icon'>
                    <Command className='h-4 w-4' />
                  </div>
                  <p className='onboarding-chip-title'>Atalhos rápidos</p>
                  <p className='onboarding-chip-text'>Cmd+K para busca e Cmd+R para alternar ambientes.</p>
                </div>
              </div>
            </div>

            <div className='mt-6'>
              <Button onClick={onCreateEnvironment} className='h-11 w-full text-[13px] font-semibold'>
                <Plus className='mr-1.5 h-3.5 w-3.5' /> Criar ambiente
              </Button>
              <p className='mt-2 text-center text-[11px] tracking-wide text-slate-500'>
                Depois você poderá trocar de ambiente com Cmd+R.
              </p>
            </div>

            <div className='onboarding-quickstart mt-5'>
              <p className='onboarding-quickstart-title'>Primeiro minuto no Pointer</p>
              <div className='onboarding-quickstart-steps'>
                <div className='onboarding-quickstart-step'>
                  <span className='onboarding-quickstart-index'>1</span>
                  <div>
                    <p className='onboarding-quickstart-label'>Crie seu ambiente</p>
                    <p className='onboarding-quickstart-text'>Local, staging ou produção.</p>
                  </div>
                </div>
                <div className='onboarding-quickstart-step'>
                  <span className='onboarding-quickstart-index'>2</span>
                  <div>
                    <p className='onboarding-quickstart-label'>Adicione conexões</p>
                    <p className='onboarding-quickstart-text'>PostgreSQL, ClickHouse e SQLite.</p>
                  </div>
                </div>
                <div className='onboarding-quickstart-step'>
                  <span className='onboarding-quickstart-index'>3</span>
                  <div>
                    <p className='onboarding-quickstart-label'>Explore tabelas rápido</p>
                    <p className='onboarding-quickstart-text'>Use Cmd+K e abra suas tabs.</p>
                  </div>
                </div>
              </div>
              <div className='onboarding-shortcuts'>
                <span className='onboarding-shortcut-pill'>Cmd+K Buscar tabelas</span>
                <span className='onboarding-shortcut-pill'>Cmd+R Trocar ambiente</span>
                <span className='onboarding-shortcut-pill'>Cmd+T Nova aba SQL</span>
              </div>
            </div>
          </div>

          <div className='pointer-card-soft relative min-h-[260px] overflow-hidden p-4 sm:min-h-[320px] lg:min-h-0 lg:p-6'>
            <div className='onboarding-art-grid'>
              <div className='onboarding-art-layer onboarding-art-a' />
              <div className='onboarding-art-layer onboarding-art-b' />
              <div className='onboarding-art-layer onboarding-art-c' />
              <div className='onboarding-art-layer onboarding-art-d' />
              <div className='onboarding-art-layer onboarding-art-e' />
              <div className='onboarding-art-layer onboarding-art-f' />
              <div className='onboarding-art-layer onboarding-art-g' />
            </div>
            <div className='onboarding-art-panel'>
              <span className='onboarding-art-dot' />
              <span className='onboarding-art-dot' />
              <span className='onboarding-art-dot' />
            </div>
            <div className='onboarding-art-wave' />
            <div className='onboarding-art-wave onboarding-art-wave-alt' />
            <div className='onboarding-art-core' />
          </div>
        </div>
      </section>
    </div>
  )
}
