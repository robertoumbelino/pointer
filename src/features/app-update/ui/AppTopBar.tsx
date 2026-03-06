import type { AppUpdateInfo } from '../../../../shared/db-types'
import { Button } from '../../../components/ui/button'

type AppTopBarProps = {
  appVersion: string
  appUpdateInfo: AppUpdateInfo | null
  isCheckingAppUpdate: boolean
  isInstallingAppUpdate: boolean
  onCheckForUpdate: (showToastWhenCurrent?: boolean) => Promise<void>
  onInstallUpdate: () => Promise<void>
}

export function AppTopBar({
  appVersion,
  appUpdateInfo,
  isCheckingAppUpdate,
  isInstallingAppUpdate,
  onCheckForUpdate,
  onInstallUpdate,
}: AppTopBarProps): JSX.Element {
  return (
    <div className='drag-region flex h-9 items-center justify-end border-b border-slate-800/70 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 pl-24 pr-4'>
      <div className='no-drag flex items-center gap-2'>
        <span className='select-none text-[11px] tracking-wide text-slate-500'>v{appVersion}</span>
        <Button
          variant={appUpdateInfo?.hasUpdate ? 'default' : 'ghost'}
          size='sm'
          className='h-6 px-2 text-[11px]'
          onClick={() => {
            if (appUpdateInfo?.hasUpdate) {
              void onInstallUpdate()
            } else {
              void onCheckForUpdate(true)
            }
          }}
          disabled={isCheckingAppUpdate || isInstallingAppUpdate}
        >
          {isInstallingAppUpdate
            ? 'Atualizando...'
            : isCheckingAppUpdate
              ? 'Checando...'
              : appUpdateInfo?.hasUpdate
                ? `Upgrade ${appUpdateInfo.latestVersion}`
                : 'Checar update'}
        </Button>
      </div>
    </div>
  )
}
