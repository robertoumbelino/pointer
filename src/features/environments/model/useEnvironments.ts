import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { EnvironmentSummary } from '../../../../shared/db-types'
import { pointerApi } from '../../../shared/api/pointer-api'
import { DEFAULT_ENVIRONMENT_COLOR } from '../../../shared/constants/app'
import { getErrorMessage } from '../../../shared/lib/workspace-utils'

type UseEnvironmentsResult = {
  environments: EnvironmentSummary[]
  setEnvironments: Dispatch<SetStateAction<EnvironmentSummary[]>>
  selectedEnvironmentId: string
  setSelectedEnvironmentId: Dispatch<SetStateAction<string>>
  selectedEnvironment: EnvironmentSummary | null
  isCreateEnvironmentOpen: boolean
  setIsCreateEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentNameDraft: string
  setEnvironmentNameDraft: Dispatch<SetStateAction<string>>
  environmentColorDraft: string
  setEnvironmentColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentSaving: boolean
  setIsEnvironmentSaving: Dispatch<SetStateAction<boolean>>
  isEditEnvironmentOpen: boolean
  setIsEditEnvironmentOpen: Dispatch<SetStateAction<boolean>>
  environmentEditNameDraft: string
  setEnvironmentEditNameDraft: Dispatch<SetStateAction<string>>
  environmentEditColorDraft: string
  setEnvironmentEditColorDraft: Dispatch<SetStateAction<string>>
  isEnvironmentUpdating: boolean
  setIsEnvironmentUpdating: Dispatch<SetStateAction<boolean>>
  loadEnvironments: () => Promise<EnvironmentSummary[]>
  handleCreateEnvironment: () => Promise<EnvironmentSummary | null>
  openEditEnvironmentDialog: () => void
  handleUpdateEnvironment: () => Promise<EnvironmentSummary | null>
  handleDeleteEnvironment: () => Promise<boolean>
}

export function useEnvironments(): UseEnvironmentsResult {
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([])
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>('')

  const [isCreateEnvironmentOpen, setIsCreateEnvironmentOpen] = useState(false)
  const [environmentNameDraft, setEnvironmentNameDraft] = useState('')
  const [environmentColorDraft, setEnvironmentColorDraft] = useState(DEFAULT_ENVIRONMENT_COLOR)
  const [isEnvironmentSaving, setIsEnvironmentSaving] = useState(false)
  const [isEditEnvironmentOpen, setIsEditEnvironmentOpen] = useState(false)
  const [environmentEditNameDraft, setEnvironmentEditNameDraft] = useState('')
  const [environmentEditColorDraft, setEnvironmentEditColorDraft] = useState(DEFAULT_ENVIRONMENT_COLOR)
  const [isEnvironmentUpdating, setIsEnvironmentUpdating] = useState(false)

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvironmentId) ?? null,
    [environments, selectedEnvironmentId],
  )

  const loadEnvironments = useCallback(async (): Promise<EnvironmentSummary[]> => {
    const all = await pointerApi.listEnvironments()
    setEnvironments(all)
    return all
  }, [])

  const handleCreateEnvironment = useCallback(async (): Promise<EnvironmentSummary | null> => {
    try {
      const name = environmentNameDraft.trim()
      if (!name) {
        throw new Error('Informe o nome do ambiente.')
      }

      setIsEnvironmentSaving(true)
      const created = await pointerApi.createEnvironment(name, environmentColorDraft)

      setIsCreateEnvironmentOpen(false)
      setEnvironmentNameDraft('')
      setEnvironmentColorDraft(DEFAULT_ENVIRONMENT_COLOR)
      toast.success(`Ambiente ${created.name} criado.`)

      await loadEnvironments()
      setSelectedEnvironmentId(created.id)
      return created
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    } finally {
      setIsEnvironmentSaving(false)
    }
  }, [environmentColorDraft, environmentNameDraft, loadEnvironments])

  const openEditEnvironmentDialog = useCallback((): void => {
    if (!selectedEnvironment) {
      return
    }

    setEnvironmentEditNameDraft(selectedEnvironment.name)
    setEnvironmentEditColorDraft(selectedEnvironment.color)
    setIsEditEnvironmentOpen(true)
  }, [selectedEnvironment])

  const handleUpdateEnvironment = useCallback(async (): Promise<EnvironmentSummary | null> => {
    if (!selectedEnvironment) {
      return null
    }

    try {
      const name = environmentEditNameDraft.trim()
      if (!name) {
        throw new Error('Informe o nome do ambiente.')
      }

      setIsEnvironmentUpdating(true)
      const updated = await pointerApi.updateEnvironment(
        selectedEnvironment.id,
        name,
        environmentEditColorDraft,
      )

      setIsEditEnvironmentOpen(false)
      toast.success(`Ambiente ${updated.name} atualizado.`)
      await loadEnvironments()
      setSelectedEnvironmentId(updated.id)
      return updated
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    } finally {
      setIsEnvironmentUpdating(false)
    }
  }, [environmentEditColorDraft, environmentEditNameDraft, loadEnvironments, selectedEnvironment])

  const handleDeleteEnvironment = useCallback(async (): Promise<boolean> => {
    if (!selectedEnvironment) {
      return false
    }

    if (!window.confirm(`Excluir ambiente "${selectedEnvironment.name}" e suas conexões?`)) {
      return false
    }

    try {
      await pointerApi.deleteEnvironment(selectedEnvironment.id)
      toast.success('Ambiente removido.')
      await loadEnvironments()
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }, [loadEnvironments, selectedEnvironment])

  return {
    environments,
    setEnvironments,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
    selectedEnvironment,
    isCreateEnvironmentOpen,
    setIsCreateEnvironmentOpen,
    environmentNameDraft,
    setEnvironmentNameDraft,
    environmentColorDraft,
    setEnvironmentColorDraft,
    isEnvironmentSaving,
    setIsEnvironmentSaving,
    isEditEnvironmentOpen,
    setIsEditEnvironmentOpen,
    environmentEditNameDraft,
    setEnvironmentEditNameDraft,
    environmentEditColorDraft,
    setEnvironmentEditColorDraft,
    isEnvironmentUpdating,
    setIsEnvironmentUpdating,
    loadEnvironments,
    handleCreateEnvironment,
    openEditEnvironmentDialog,
    handleUpdateEnvironment,
    handleDeleteEnvironment,
  }
}
