'use client'

import { useState } from 'react'

const quarantineCommand = 'xattr -dr com.apple.quarantine "/Applications/Pointer.app"'

export function QuarantineCommand(): JSX.Element {
  const [copied, setCopied] = useState(false)

  async function copyCommand(): Promise<void> {
    await navigator.clipboard.writeText(quarantineCommand)
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
      <p>Se o macOS bloquear a abertura, use somente após baixar o Pointer do GitHub oficial.</p>
    </div>
  )
}
