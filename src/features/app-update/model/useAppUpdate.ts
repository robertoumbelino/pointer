import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppUpdateInfo } from '../../../../shared/db-types'
import changelogMarkdown from '../../../../CHANGELOG.md?raw'
import { toast } from 'sonner'
import { pointerApi } from '../../../shared/api/pointer-api'
import { CHANGELOG_LAST_SEEN_VERSION_KEY } from '../../../shared/constants/app'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'
import { normalizeVersion, parseChangelog, type ChangelogEntry } from './changelog'

type UseAppUpdateResult = {
  appUpdateInfo: AppUpdateInfo | null
  setAppUpdateInfo: Dispatch<SetStateAction<AppUpdateInfo | null>>
  isCheckingAppUpdate: boolean
  setIsCheckingAppUpdate: Dispatch<SetStateAction<boolean>>
  isInstallingAppUpdate: boolean
  setIsInstallingAppUpdate: Dispatch<SetStateAction<boolean>>
  appVersion: string
  setAppVersion: Dispatch<SetStateAction<string>>
  changelogEntries: ChangelogEntry[]
  isChangelogOpen: boolean
  setIsChangelogOpen: Dispatch<SetStateAction<boolean>>
  openChangelog: () => void
  checkForAppUpdate: (showToastWhenCurrent?: boolean) => Promise<void>
  installLatestAppUpdate: () => Promise<void>
}

export function useAppUpdate(): UseAppUpdateResult {
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false)
  const [isInstallingAppUpdate, setIsInstallingAppUpdate] = useState(false)
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const changelogEntries = useMemo(() => parseChangelog(changelogMarkdown), [])

  useEffect(() => {
    const currentVersion = normalizeVersion(appVersion)
    if (!isComparableVersion(currentVersion)) {
      return
    }

    const lastSeenVersion = readLastSeenVersion()
    if (!lastSeenVersion) {
      persistLastSeenVersion(currentVersion)
      return
    }

    if (!isComparableVersion(lastSeenVersion)) {
      persistLastSeenVersion(currentVersion)
      return
    }

    if (compareVersions(currentVersion, lastSeenVersion) > 0) {
      setIsChangelogOpen(true)
      persistLastSeenVersion(currentVersion)
      return
    }

    persistLastSeenVersion(currentVersion)
  }, [appVersion])

  const checkForAppUpdate = useCallback(async (showToastWhenCurrent = false): Promise<void> => {
    try {
      setIsCheckingAppUpdate(true)
      const info = await pointerApi.checkForAppUpdate()
      setAppUpdateInfo(info)

      if (showToastWhenCurrent && !info.hasUpdate) {
        toast.success(`Você já está na versão ${info.currentVersion}.`)
      }
    } catch (error) {
      const message = getErrorMessage(error)
      const isGitHubRateLimited = message.includes('403')

      if (!showToastWhenCurrent && isGitHubRateLimited) {
        return
      }

      toast.error(message)
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

  const openChangelog = useCallback(() => {
    setIsChangelogOpen(true)
  }, [])

  return {
    appUpdateInfo,
    setAppUpdateInfo,
    isCheckingAppUpdate,
    setIsCheckingAppUpdate,
    isInstallingAppUpdate,
    setIsInstallingAppUpdate,
    appVersion,
    setAppVersion,
    changelogEntries,
    isChangelogOpen,
    setIsChangelogOpen,
    openChangelog,
    checkForAppUpdate,
    installLatestAppUpdate,
  }
}

function readLastSeenVersion(): string {
  try {
    return normalizeVersion(window.localStorage.getItem(CHANGELOG_LAST_SEEN_VERSION_KEY) ?? '')
  } catch {
    return ''
  }
}

function persistLastSeenVersion(version: string): void {
  try {
    window.localStorage.setItem(CHANGELOG_LAST_SEEN_VERSION_KEY, version)
  } catch {
    // LocalStorage can be unavailable in edge cases; keep app functional without persistence.
  }
}

function isComparableVersion(version: string): boolean {
  return version.length > 0 && version.split('.').every((part) => /^\d+$/.test(part))
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const rightParts = right.split('.').map((value) => Number.parseInt(value, 10) || 0)
  const maxLength = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}
