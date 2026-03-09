import { useEffect, useMemo } from 'react'
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react'
import type { EnvironmentSummary } from '../../../../shared/db-types'

type UseEnvironmentSwitcherActionsParams = {
  environments: EnvironmentSummary[]
  environmentCommandQuery: string
  setEnvironmentCommandQuery: Dispatch<SetStateAction<string>>
  environmentCommandIndex: number
  setEnvironmentCommandIndex: Dispatch<SetStateAction<number>>
  isEnvironmentCommandOpen: boolean
  setIsEnvironmentCommandOpen: Dispatch<SetStateAction<boolean>>
  setSelectedEnvironmentId: Dispatch<SetStateAction<string>>
  onEnterWorkspace: () => void
}

type UseEnvironmentSwitcherActionsResult = {
  environmentCommandResults: EnvironmentSummary[]
  selectEnvironmentFromCommand: (environmentId: string) => void
  handleEnvironmentCommandInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function useEnvironmentSwitcherActions({
  environments,
  environmentCommandQuery,
  setEnvironmentCommandQuery,
  environmentCommandIndex,
  setEnvironmentCommandIndex,
  isEnvironmentCommandOpen,
  setIsEnvironmentCommandOpen,
  setSelectedEnvironmentId,
  onEnterWorkspace,
}: UseEnvironmentSwitcherActionsParams): UseEnvironmentSwitcherActionsResult {
  const environmentCommandResults = useMemo(
    () =>
      environments.filter((environment) =>
        environment.name.toLowerCase().includes(environmentCommandQuery.trim().toLowerCase()),
      ),
    [environments, environmentCommandQuery],
  )

  useEffect(() => {
    if (!isEnvironmentCommandOpen) {
      return
    }

    setEnvironmentCommandIndex(0)
  }, [environmentCommandQuery, isEnvironmentCommandOpen, setEnvironmentCommandIndex])

  useEffect(() => {
    if (!isEnvironmentCommandOpen) {
      return
    }

    if (environmentCommandResults.length === 0) {
      setEnvironmentCommandIndex(0)
      return
    }

    setEnvironmentCommandIndex((current) =>
      Math.max(0, Math.min(current, environmentCommandResults.length - 1)),
    )
  }, [environmentCommandResults, isEnvironmentCommandOpen, setEnvironmentCommandIndex])

  function selectEnvironmentFromCommand(environmentId: string): void {
    setSelectedEnvironmentId(environmentId)
    onEnterWorkspace()
    setIsEnvironmentCommandOpen(false)
    setEnvironmentCommandQuery('')
    setEnvironmentCommandIndex(0)
  }

  function handleEnvironmentCommandInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (environmentCommandResults.length === 0) {
      return
    }

    const keyCode = (event as KeyboardEvent<HTMLInputElement> & { which?: number; keyCode?: number }).keyCode
    const which = (event as KeyboardEvent<HTMLInputElement> & { which?: number; keyCode?: number }).which
    const isArrowDown = event.key === 'ArrowDown' || event.code === 'ArrowDown' || keyCode === 40 || which === 40
    const isArrowUp = event.key === 'ArrowUp' || event.code === 'ArrowUp' || keyCode === 38 || which === 38
    const isEnter = event.key === 'Enter' || event.code === 'Enter' || keyCode === 13 || which === 13

    if (isArrowDown) {
      event.preventDefault()
      setEnvironmentCommandIndex((current) =>
        Math.max(0, Math.min(current + 1, environmentCommandResults.length - 1)),
      )
      return
    }

    if (isArrowUp) {
      event.preventDefault()
      setEnvironmentCommandIndex((current) => Math.max(0, current - 1))
      return
    }

    if (isEnter) {
      event.preventDefault()
      const picked = environmentCommandResults[environmentCommandIndex] ?? environmentCommandResults[0]
      if (picked) {
        selectEnvironmentFromCommand(picked.id)
      }
    }
  }

  return {
    environmentCommandResults,
    selectEnvironmentFromCommand,
    handleEnvironmentCommandInputKeyDown,
  }
}
