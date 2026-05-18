import useSWR from 'swr';
import { apiClient } from '../api-client';
import type { ScanDetail, RepoSummary, AIJobStatus } from '../types';

export function useScan(repoId: string | undefined, scanId: string | undefined) {
  const { data, error, mutate, isLoading } = useSWR<ScanDetail>(
    repoId && scanId ? `scan:${repoId}:${scanId}` : null,
    () => apiClient.getScan(repoId!, scanId!),
    {
      refreshInterval: (data) => (data?.status === 'running' ? 5000 : 0),
    }
  );

  return { scan: data, error, mutate, isLoading };
}

export function useLatestScan(repoId: string | undefined) {
  const { data, error, mutate, isLoading } = useSWR<ScanDetail>(
    repoId ? `latest-scan:${repoId}` : null,
    () => apiClient.getLatestScan(repoId!),
    {
      refreshInterval: (data) => (data?.status === 'running' ? 5000 : 0),
    }
  );

  return { scan: data, error, mutate, isLoading };
}

export function useRepos() {
  const { data, error, mutate, isLoading } = useSWR<{ repos: RepoSummary[] }>(
    'repos',
    () => apiClient.getRepos(),
    {
      refreshInterval: 15000,
    }
  );

  return { repos: data?.repos || [], error, mutate, isLoading };
}

export function useQueueStats() {
  const { data, error, mutate, isLoading } = useSWR(
    'queue-stats',
    () => apiClient.getQueueStats(),
    {
      refreshInterval: 10000,
    }
  );

  return { stats: data, error, mutate, isLoading };
}

export function useAIJob(scanId: string | undefined, jobId: string | null | undefined, type: 'explain' | 'remediate' | 'report') {
  const { data, error, mutate, isLoading } = useSWR<AIJobStatus>(
    scanId && jobId ? `ai-job:${scanId}:${jobId}` : null,
    async () => {
      if (type === 'explain') return apiClient.getExplainStatus(scanId!, jobId!);
      if (type === 'remediate') return apiClient.getRemediateStatus(scanId!, jobId!);
      return apiClient.getAIReportStatus(scanId!, jobId!);
    },
    {
      refreshInterval: (data) => (!data || (data.status !== 'completed' && data.status !== 'failed') ? 2000 : 0),
    }
  );

  return { job: data, error, mutate, isLoading };
}
