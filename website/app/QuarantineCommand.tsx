'use client'

import { useState } from 'react'

const quarantineCommand = 'xattr -dr com.apple.quarantine "/Applications/Pointer.app"'

export function QuarantineCommand(): JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copyCommand(): Promise<void> {
    try {
      await navigator.clipboard.writeText(quarantineCommand)
    } catch {
      const fallback = document.createElement('textarea')
      fallback.value = quarantineCommand
      fallback.setAttribute('readonly', '')
      fallback.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(fallback)
      fallback.select()
      document.execCommand('copy')
      fallback.remove()
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="quarantine-command">
      <div className="quarantine-copy">
        <span className="terminal-mark" aria-hidden="true">›_</span>
        <code>{quarantineCommand}</code>
        <button type="button" onClick={() => void copyCommand()} aria-label="Copiar comando para remover a quarentena do Pointer">
          <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p>Como esta versão ainda não é assinada pela Apple, use o comando somente após baixar o Pointer do GitHub oficial.</p>
    </div>
  )
}
