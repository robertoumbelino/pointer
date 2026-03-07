import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { cn } from '../../../lib/utils'
import type { ChangelogEntry } from '../model/changelog'
import { isSameVersion } from '../model/changelog'
import { ChevronDown } from 'lucide-react'

type ChangelogDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  appVersion: string
  entries: ChangelogEntry[]
}

export function ChangelogDialog({
  isOpen,
  onOpenChange,
  appVersion,
  entries,
}: ChangelogDialogProps): JSX.Element {
  const [expandedIndex, setExpandedIndex] = useState(0)

  const currentVersionIndex = useMemo(() => {
    return entries.findIndex((entry) => isSameVersion(entry.version, appVersion))
  }, [appVersion, entries])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (currentVersionIndex >= 0) {
      setExpandedIndex(currentVersionIndex)
      return
    }

    setExpandedIndex(0)
  }, [currentVersionIndex, isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] max-w-3xl overflow-hidden p-0'>
        <DialogHeader className='border-b border-slate-800 px-6 pb-4 pt-5'>
          <DialogTitle>Changelog</DialogTitle>
          <DialogDescription>
            Histórico de versões do Pointer com novidades, correções e melhorias.
          </DialogDescription>
        </DialogHeader>

        <div className='max-h-[70vh] overflow-y-auto pb-2'>
          {entries.length === 0 ? (
            <div className='px-6 py-8 text-sm text-slate-400'>
              Não foi possível carregar o changelog. Verifique o arquivo <code>CHANGELOG.md</code>.
            </div>
          ) : (
            entries.map((entry, index) => {
              const isExpanded = expandedIndex === index
              const isCurrentVersion = isSameVersion(entry.version, appVersion)

              return (
                <section key={`${entry.version}:${entry.date ?? 'sem-data'}:${index}`} className='border-b border-slate-800/70'>
                  <Button
                    type='button'
                    variant='ghost'
                    className='h-auto w-full justify-between rounded-none px-6 py-4 text-left hover:bg-slate-800/45 hover:text-slate-50'
                    onClick={() => setExpandedIndex((current) => (current === index ? -1 : index))}
                  >
                    <div className='flex min-w-0 items-center gap-2'>
                      <span className='truncate text-sm font-semibold text-slate-100'>{entry.title}</span>
                      {entry.date ? (
                        <span className='inline-flex h-5 items-center rounded-md border border-slate-700/70 bg-slate-800/45 px-2 text-[10px] font-medium tracking-wide text-slate-400'>
                          {formatDatePtBr(entry.date)}
                        </span>
                      ) : null}
                      {isCurrentVersion ? (
                        <Badge variant='secondary' className='border-cyan-400/35 bg-cyan-500/10 text-cyan-200'>
                          Atual
                        </Badge>
                      ) : null}
                    </div>
                    <ChevronDown
                      className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', isExpanded && 'rotate-180')}
                    />
                  </Button>

                  {isExpanded ? (
                    <div className='space-y-4 px-6 pb-5'>
                      {entry.sections.map((section) => (
                        <section key={`${entry.version}:${section.title}`}>
                          <h4 className='mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400'>
                            {section.title}
                          </h4>
                          <ul className='list-disc space-y-1.5 pl-5 text-sm text-slate-200 marker:text-slate-500'>
                            {section.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatDatePtBr(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return value
  }

  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}
