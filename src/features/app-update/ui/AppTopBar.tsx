import type { AppUpdateInfo } from '../../../../shared/db-types'
import { Diff, Download, RefreshCw } from 'lucide-react'
import { Button } from '../../../components/ui/button'

type AppTopBarProps = {
  appVersion: string
  appUpdateInfo: AppUpdateInfo | null
  isCheckingAppUpdate: boolean
  isInstallingAppUpdate: boolean
  onOpenChangelog: () => void
  onCheckForUpdate: (showToastWhenCurrent?: boolean) => Promise<void>
  onInstallUpdate: () => Promise<void>
}

export function AppTopBar({
  appVersion,
  appUpdateInfo,
  isCheckingAppUpdate,
  isInstallingAppUpdate,
  onOpenChangelog,
  onCheckForUpdate,
  onInstallUpdate,
}: AppTopBarProps): JSX.Element {
  const hasUpdate = Boolean(appUpdateInfo?.hasUpdate)
  const versionLabel = appVersion.trim() || '0.0.0'

  return (
    <div className='drag-region flex h-11 items-center justify-end border-b border-slate-800/70 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 pl-24 pr-4'>
      <div className='no-drag ml-auto flex h-full items-center gap-1'>
        <Button
          variant='ghost'
          size='icon'
          className='h-6 w-6'
          title='Abrir changelog'
          onClick={onOpenChangelog}
        >
          <Diff className='h-3.5 w-3.5' />
        </Button>
        <Button
          variant={hasUpdate ? 'default' : 'ghost'}
          size={hasUpdate ? 'sm' : 'icon'}
          className={hasUpdate ? 'h-6 gap-1.5 px-2 text-[11px] leading-none' : 'h-6 w-6'}
          title={
            hasUpdate
              ? `Atualizar para v${appUpdateInfo?.latestVersion ?? ''}`
              : isCheckingAppUpdate
                ? 'Checando atualizações...'
                : 'Checar atualizações'
          }
          onClick={() => {
            if (hasUpdate) {
              void onInstallUpdate()
            } else {
              void onCheckForUpdate(true)
            }
          }}
          disabled={isCheckingAppUpdate || isInstallingAppUpdate}
        >
          {hasUpdate ? (
            <>
              {isInstallingAppUpdate ? (
                <RefreshCw className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Download className='h-3.5 w-3.5' />
              )}
              <span>{isInstallingAppUpdate ? 'Atualizando...' : 'Atualizar'}</span>
            </>
          ) : (
            <RefreshCw className={isCheckingAppUpdate ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          )}
        </Button>
        <span className='mx-1 h-4 w-px bg-slate-700/55' />
        <span className='select-none text-[11px] leading-none tracking-wide text-slate-500'>v{versionLabel}</span>
      </div>
    </div>
  )
}
