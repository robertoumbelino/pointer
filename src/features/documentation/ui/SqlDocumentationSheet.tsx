import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Clipboard, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { postgresJsonDocs } from '../model/postgresJsonDocs'

type SqlDocumentationSheetProps = {
  isOpen: boolean
  onClose: () => void
}

export function SqlDocumentationSheet({ isOpen, onClose }: SqlDocumentationSheetProps): JSX.Element | null {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  const filteredSections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return postgresJsonDocs
    }

    return postgresJsonDocs
      .map((section) => ({
        ...section,
        examples: section.examples.filter((example) => {
          const searchable = [
            section.title,
            example.title,
            example.description,
            example.sql,
            ...example.keywords,
          ]
            .join(' ')
            .toLowerCase()

          return searchable.includes(normalizedQuery)
        }),
      }))
      .filter((section) => section.examples.length > 0)
  }, [query])

  async function copySql(sql: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(sql)
      toast.success('SQL copiado.')
    } catch {
      toast.error('Não foi possível copiar o SQL.')
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <>
      <button
        type='button'
        aria-label='Fechar documentação SQL'
        className='fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm'
        onClick={onClose}
      />

      <aside className='fixed bottom-3 right-3 top-3 z-[60] flex w-[420px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-800/75 bg-[#020617] shadow-[0_10px_32px_rgba(2,6,23,0.45),inset_0_1px_0_rgba(51,65,85,0.25)]'>
        <div aria-hidden className='absolute inset-0 bg-[#020617]' />

        <div className='relative z-10 flex items-start justify-between gap-2 border-b border-slate-800/80 bg-[#020617] px-3 py-2.5'>
          <div className='min-w-0'>
            <p className='flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400'>
              <BookOpen className='h-3.5 w-3.5' />
              Documentação SQL
            </p>
            <h3 className='truncate text-sm font-semibold text-slate-100'>PostgreSQL JSON/JSONB</h3>
            <p className='text-[11px] text-slate-500'>Troque metadata pelo nome real da coluna JSON.</p>
          </div>
          <Button variant='ghost' size='icon' className='h-7 w-7' onClick={onClose} aria-label='Fechar documentação'>
            <X className='h-4 w-4' />
          </Button>
        </div>

        <div className='relative z-10 border-b border-slate-800/80 bg-[#020617] px-3 py-2.5'>
          <div className='relative'>
            <Search className='pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Buscar exemplo...'
              className='h-8 pl-8 text-[13px]'
            />
          </div>
        </div>

        <div className='relative z-10 flex-1 space-y-4 overflow-auto bg-[#020617] px-3 py-3'>
          {filteredSections.length === 0 ? (
            <div className='pointer-card-soft rounded-lg px-3 py-3 text-sm text-slate-400'>
              Nenhum exemplo encontrado.
            </div>
          ) : (
            filteredSections.map((section) => (
              <section key={section.id} className='space-y-2'>
                <h4 className='text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500'>
                  {section.title}
                </h4>

                <div className='space-y-2'>
                  {section.examples.map((example) => (
                    <article key={example.id} className='pointer-card-soft rounded-lg px-3 py-2.5'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <h5 className='text-sm font-semibold text-slate-100'>{example.title}</h5>
                          <p className='mt-1 text-xs leading-relaxed text-slate-400'>{example.description}</p>
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => void copySql(example.sql)}
                          aria-label={`Copiar SQL: ${example.title}`}
                          title='Copiar SQL'
                        >
                          <Clipboard className='h-3.5 w-3.5' />
                        </Button>
                      </div>

                      <pre className='mt-2 max-h-40 overflow-auto rounded-md border border-slate-800/80 bg-slate-950/80 p-2.5 font-mono text-[11px] leading-relaxed text-cyan-100'>
                        <code>{example.sql}</code>
                      </pre>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </>
  )
}
