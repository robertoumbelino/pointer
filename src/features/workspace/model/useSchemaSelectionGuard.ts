import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

type UseSchemaSelectionGuardParams = {
  selectedSchema: string
  setSelectedSchema: Dispatch<SetStateAction<string>>
  schemaOptions: string[]
}

export function useSchemaSelectionGuard({
  selectedSchema,
  setSelectedSchema,
  schemaOptions,
}: UseSchemaSelectionGuardParams): void {
  useEffect(() => {
    if (selectedSchema === 'all') {
      return
    }

    if (!schemaOptions.includes(selectedSchema)) {
      setSelectedSchema('all')
    }
  }, [schemaOptions, selectedSchema, setSelectedSchema])
}
