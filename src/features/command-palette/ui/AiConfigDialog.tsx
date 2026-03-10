import type { Dispatch, SetStateAction } from 'react'
import type { AiConfig, AiProvider } from '../../../../shared/db-types'
import { Button } from '../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'

const PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  {
    value: 'vercel-gateway',
    label: 'vercel-gateway',
  },
]

const MODEL_OPTIONS = [
  'minimax/minimax-m2.1',
  'moonshotai/kimi-k2.5',
  'openai/gpt-4.1-mini',
  'openai/gpt-4o-mini',
] as const

export type AiConfigDialogMode = 'full' | 'model'

type AiConfigDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  mode: AiConfigDialogMode
  onRequestFullConfig: () => void
  aiConfig: AiConfig | null
  aiProviderDraft: AiProvider
  setAiProviderDraft: Dispatch<SetStateAction<AiProvider>>
  aiModelDraft: string
  setAiModelDraft: Dispatch<SetStateAction<string>>
  aiApiKeyDraft: string
  setAiApiKeyDraft: Dispatch<SetStateAction<string>>
  isSaving: boolean
  onSave: () => Promise<void>
}

export function AiConfigDialog({
  isOpen,
  onOpenChange,
  mode,
  onRequestFullConfig,
  aiConfig,
  aiProviderDraft,
  setAiProviderDraft,
  aiModelDraft,
  setAiModelDraft,
  aiApiKeyDraft,
  setAiApiKeyDraft,
  isSaving,
  onSave,
}: AiConfigDialogProps): JSX.Element {
  const modelOptions = MODEL_OPTIONS.includes(aiModelDraft as (typeof MODEL_OPTIONS)[number])
    ? [...MODEL_OPTIONS]
    : [...MODEL_OPTIONS, aiModelDraft]
  const requiresApiKey = mode === 'full' && !aiConfig?.hasApiKey
  const saveDisabled = isSaving || (requiresApiKey && !aiApiKeyDraft.trim())
  const isModelOnlyMode = mode === 'model'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg space-y-3'>
        <DialogHeader>
          <DialogTitle>{isModelOnlyMode ? 'Alterar modelo IA' : 'Configurar IA'}</DialogTitle>
          <DialogDescription>
            {isModelOnlyMode
              ? 'Troque provider/modelo mantendo sua chave atual.'
              : 'Salve sua chave do AI Gateway para gerar SQL no Cmd+K.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1'>
            <p className='text-[12px] font-medium uppercase tracking-[0.08em] text-slate-400'>Provider</p>
            <select
              value={aiProviderDraft}
              onChange={(event) => setAiProviderDraft(event.target.value as AiProvider)}
              className='h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className='space-y-1'>
            <p className='text-[12px] font-medium uppercase tracking-[0.08em] text-slate-400'>Modelo</p>
            <select
              value={aiModelDraft}
              onChange={(event) => setAiModelDraft(event.target.value)}
              className='h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 text-[13px] outline-none ring-slate-300/45 focus:ring-2'
            >
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {!isModelOnlyMode && (
            <div className='space-y-1'>
              <p className='text-[12px] font-medium uppercase tracking-[0.08em] text-slate-400'>API Key</p>
              <Input
                type='password'
                placeholder={
                  aiConfig?.hasApiKey
                    ? 'Digite para substituir sua chave atual (opcional)'
                    : 'Cole sua chave do AI Gateway'
                }
                value={aiApiKeyDraft}
                onChange={(event) => setAiApiKeyDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onSave()
                  }
                }}
              />
            </div>
          )}
        </div>

        <DialogFooter className='pt-2'>
          {isModelOnlyMode && aiConfig?.hasApiKey && (
            <Button variant='secondary' onClick={onRequestFullConfig} disabled={isSaving}>
              Alterar chave API
            </Button>
          )}
          <Button variant='secondary' onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={() => void onSave()} disabled={saveDisabled}>
            {isSaving ? 'Salvando...' : isModelOnlyMode ? 'Salvar modelo' : 'Salvar configuração'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
