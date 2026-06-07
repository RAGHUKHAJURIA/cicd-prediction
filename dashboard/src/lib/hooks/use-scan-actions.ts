'use client'

import { useState, useCallback } from 'react'
import { githubReposApi, PushPatchResult, CreatePRResult } from '../github-repos-api'

type ActionState = 'idle' | 'loading' | 'success' | 'error'

export function useScanActions(scanId: string, repoId: string) {
  const [pushPatchState, setPushPatchState] = useState<ActionState>('idle')
  const [pushPatchResult, setPushPatchResult] = useState<PushPatchResult | null>(null)
  const [pushPatchError, setPushPatchError] = useState<string | null>(null)

  const [createPRState, setCreatePRState] = useState<ActionState>('idle')
  const [createPRResult, setCreatePRResult] = useState<CreatePRResult | null>(null)
  const [createPRError, setCreatePRError] = useState<string | null>(null)

  const pushPatch = useCallback(
    async (branch: string, patchIds?: string[]) => {
      setPushPatchState('loading')
      setPushPatchError(null)
      try {
        const result = await githubReposApi.pushPatch({
          repoId,
          scanId,
          branch,
          patchIds,
        })
        setPushPatchResult(result)
        setPushPatchState('success')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to push patch'
        setPushPatchError(message)
        setPushPatchState('error')
        throw err
      }
    },
    [repoId, scanId]
  )

  const createPR = useCallback(
    async (baseBranch: string, patchIds?: string[]) => {
      setCreatePRState('loading')
      setCreatePRError(null)
      try {
        const result = await githubReposApi.createPR({
          repoId,
          scanId,
          baseBranch,
          patchIds,
        })
        setCreatePRResult(result)
        setCreatePRState('success')
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create PR'
        setCreatePRError(message)
        setCreatePRState('error')
        throw err
      }
    },
    [repoId, scanId]
  )

  const resetPushPatch = useCallback(() => {
    setPushPatchState('idle')
    setPushPatchResult(null)
    setPushPatchError(null)
  }, [])

  const resetCreatePR = useCallback(() => {
    setCreatePRState('idle')
    setCreatePRResult(null)
    setCreatePRError(null)
  }, [])

  return {
    pushPatch,
    pushPatchState,
    pushPatchResult,
    pushPatchError,
    resetPushPatch,
    createPR,
    createPRState,
    createPRResult,
    createPRError,
    resetCreatePR,
  }
}
