'use client'

import { useState, useCallback, useRef } from 'react'
import useSWR from 'swr'
import { githubReposApi, GitHubRepo } from '../github-repos-api'

interface UseGithubReposParams {
  search?: string
  type?: string
  sort?: string
}

export function useGithubRepos(params?: UseGithubReposParams) {
  const [page, setPage] = useState(1)
  const [allRepos, setAllRepos] = useState<GitHubRepo[]>([])
  const prevParamsRef = useRef<string>('')

  // Reset accumulated repos when params change
  const paramKey = JSON.stringify(params ?? {})
  if (paramKey !== prevParamsRef.current) {
    prevParamsRef.current = paramKey
    if (page !== 1) setPage(1)
    if (allRepos.length > 0) setAllRepos([])
  }

  const { data, error, isLoading, mutate } = useSWR(
    ['github-repos', params?.search, params?.type, params?.sort, page],
    async () => {
      const result = await githubReposApi.listRepos({
        page,
        perPage: 30,
        sort: params?.sort,
        type: params?.type,
        search: params?.search,
      })
      return result
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      onSuccess: (newData) => {
        if (page === 1) {
          setAllRepos(newData.repos)
        } else {
          setAllRepos((prev) => [...prev, ...newData.repos])
        }
      },
    }
  )

  const loadMore = useCallback(() => {
    if (data?.hasMore) {
      setPage((p) => p + 1)
    }
  }, [data?.hasMore])

  const reset = useCallback(() => {
    setPage(1)
    setAllRepos([])
    mutate()
  }, [mutate])

  return {
    repos: allRepos.length > 0 ? allRepos : data?.repos ?? [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load repos') : null,
    hasMore: data?.hasMore ?? false,
    loadMore,
    reset,
  }
}
