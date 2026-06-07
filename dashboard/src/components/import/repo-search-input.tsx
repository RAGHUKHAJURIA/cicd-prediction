'use client'

import { Search, X } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface RepoSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function RepoSearchInput({
  value,
  onChange,
  placeholder = 'Search repositories...',
}: RepoSearchInputProps) {
  const [localValue, setLocalValue] = useState(value)

  // Debounce the onChange callback
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(localValue)
    }, 300)
    return () => clearTimeout(timer)
  }, [localValue, onChange])

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleClear = useCallback(() => {
    setLocalValue('')
    onChange('')
  }, [onChange])

  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6e7681]" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-8 bg-[#010409] border border-[#30363d] rounded-md text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] transition-colors"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6e7681] hover:text-[#e6edf3] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
