import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUpdateInfo } from '../../../../shared/db-types'
import { toast } from 'sonner'
import { pointerApi } from '../../../shared/api/pointer-api'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'

type UseAppUpdateResult = {
  appUpdateInfo: AppUpdateInfo | null
  setAppUpdateInfo: Dispatch<SetStateAction<AppUpdateInfo | null>>
  isCheckingAppUpdate: boolean
  setIsCheckingAppUpdate: Dispatch<SetStateAction<boolean>>
  isInstallingAppUpdate: boolean
  setIsInstallingAppUpdate: Dispatch<SetStateAction<boolean>>
  appVersion: string
  setAppVersion: Dispatch<SetStateAction<string>>
  checkForAppUpdate: (showToastWhenCurrent?: boolean) => Promise<void>
  installLatestAppUpdate: () => Promise<void>
}

export function useAppUpdate(): UseAppUpdateResult {
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false)
  const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false)
  const [appVersion, setAppVersion] = useState('0.0.0')

  const checkForAppUpdate = useCallback(async (showToastWhenCurrent = false): Promise<void> => {
    try {
      setIsCheckingAppUpdate(true)
      const info = await pointerApi.checkForAppUpdate()
      setAppUpdateInfo(info)

      if (showToastWhenCurrent && !info.hasUpdate) {
        toast.success(`Você já está na versão ${info.currentVersion}.`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsCheckingAppUpdate(false)
    }
  }, [])

  const installLatestAppUpdate = useCallback(async (): Promise<void> => {
    try {
      if (!appUpdateInfo?.hasUpdate) {
        toast.info('Nenhuma atualização disponível.')
        return
      }

      if (
        !window.confirm(
          `Atualizar da versão ${appUpdateInfo.currentVersion} para ${appUpdateInfo.latestVersion}? O app será reiniciado.`,
        )
      ) {
        return
      }

      setIsInstallingAppUpdate(true)
      const result = await pointerApi.installLatestUpdate()

      if (result.started) {
        toast.success(result.message)
        return
      }

      toast.info(result.message)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsInstallingAppUpdate(false)
    }
  }, [appUpdateInfo])

  return {
    appUpdateInfo,
    setAppUpdateInfo,
    isCheckingAppUpdate,
    setIsCheckingAppUpdate,
    isInstallingAppUpdate,
    setIsInstallingAppUpdate,
    appVersion,
    setAppVersion,
    checkForAppUpdate,
    installLatestAppUpdate,
  }
}
