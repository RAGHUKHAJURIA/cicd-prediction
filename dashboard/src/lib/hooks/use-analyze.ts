import useSWR from "swr";
import { analyzeApi } from "../analyze-api";
import type { ScanStatusResponse, FullResultsResponse } from "../analyze-api";

export function useAnalyzeStatus(scanId: string | undefined) {
  const { data, error, mutate, isLoading } = useSWR<ScanStatusResponse>(
    scanId ? `analyze-status:${scanId}` : null,
    () => analyzeApi.getStatus(scanId!),
    {
      refreshInterval: (data) =>
        data && (data.overallStatus === "completed" || data.overallStatus === "failed")
          ? 0
          : 2000,
    }
  );

  return {
    status: data,
    error,
    mutate,
    isLoading,
  };
}

export function useAnalyzeResults(scanId: string | undefined, isCompleted: boolean) {
  const { data, error, mutate, isLoading } = useSWR<FullResultsResponse>(
    scanId && isCompleted ? `analyze-results:${scanId}` : null,
    () => analyzeApi.getResults(scanId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    results: data,
    error,
    mutate,
    isLoading,
  };
}
