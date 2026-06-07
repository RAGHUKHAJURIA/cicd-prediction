'use client'

import { Copy, Check } from 'lucide-react'
import { useState, useCallback } from 'react'

interface AIPatch {
  id: string
  ruleId: string | null
  title: string
  beforeCode: string | null
  afterCode: string | null
  language: string | null
  instructions: string | null
  filePath?: string
}

interface CopySnippetButtonProps {
  patches: AIPatch[]
  singlePatch?: AIPatch
  variant?: 'icon' | 'button'
}

export function CopySnippetButton({
  patches,
  singlePatch,
  variant = 'button',
}: CopySnippetButtonProps) {
  const [copied, setCopied] = useState(false)

  const buildCombinedDiff = useCallback(
    (items: AIPatch[]): string => {
      return items
        .map((p) => {
          const path = p.filePath ?? 'unknown'
          const beforeLines = (p.beforeCode ?? '')
            .split('\n')
            .map((l) => `- ${l}`)
            .join('\n')
          const afterLines = (p.afterCode ?? '')
            .split('\n')
            .map((l) => `+ ${l}`)
            .join('\n')
          return `--- a/${path}\n+++ b/${path}\n${beforeLines}\n${afterLines}`
        })
        .join('\n\n')
    },
    []
  )

  const handleCopy = useCallback(async () => {
    let text: string
    if (singlePatch) {
      text = singlePatch.afterCode ?? ''
    } else {
      text = buildCombinedDiff(patches)
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [singlePatch, patches, buildCombinedDiff])

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy fixed code'}
        className="p-1.5 rounded-md text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/[0.06] transition-colors"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[#3fb950]" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium rounded-md border transition-colors bg-white/[0.05] border-[#30363d] text-[#e6edf3] hover:bg-white/[0.08] hover:border-[#8b949e]"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-[#3fb950]" />
          <span className="text-[#3fb950]">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          Copy all fixes
        </>
      )}
    </button>
  )
}
