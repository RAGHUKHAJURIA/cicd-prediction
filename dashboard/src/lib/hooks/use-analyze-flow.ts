import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { analyzeApi, FullResultsResponse } from "@/lib/analyze-api";

export type AnalyzePhase =
  | "idle"
  | "submitting"
  | "scanning"
  | "completed"
  | "results"
  | "error";

export interface LayerState {
  id: number;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  detail: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface AnalyzeFormInput {
  repoUrl: string;
  branch: string;
  token: string;
  includeAI: boolean;
}

export interface AnalyzeFlowState {
  phase: AnalyzePhase;
  input: AnalyzeFormInput | null;
  scanId: string | null;
  repoId: string | null;
  jobId: string | null;
  layers: LayerState[];
  overallProgress: number;
  error: string | null;
  errorCode: string | null;
  results: FullResultsResponse | null;
  selectedFile: string | null;
  selectedFindingId: string | null;
}

const initialState: AnalyzeFlowState = {
  phase: "idle",
  input: null,
  scanId: null,
  repoId: null,
  jobId: null,
  layers: [],
  overallProgress: 0,
  error: null,
  errorCode: null,
  results: null,
  selectedFile: null,
  selectedFindingId: null,
};

export function useAnalyzeFlow() {
  const [state, setState] = useState<AnalyzeFlowState>(initialState);

  // Check URL param ?scanId on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const scanIdParam = params.get("scanId");
      if (scanIdParam && state.phase === "idle") {
        setState((s) => ({ ...s, scanId: scanIdParam, phase: "scanning" }));
      }
    }
  }, [state.phase]);

  // URL SYNC
  useEffect(() => {
    if (state.scanId && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("scanId") !== state.scanId) {
        url.searchParams.set("scanId", state.scanId);
        window.history.pushState({}, "", url.toString());
      }
    }
  }, [state.scanId]);

  const submit = useCallback(async (input: AnalyzeFormInput) => {
    setState((s) => ({
      ...s,
      phase: "submitting",
      input,
      error: null,
      errorCode: null,
    }));
    try {
      const res = await analyzeApi.submitUrl({
        repoUrl: input.repoUrl,
        branch: input.branch || undefined,
        token: input.token || undefined,
      });
      setState((s) => ({
        ...s,
        scanId: res.scanId,
        repoId: res.repoId,
        phase: "scanning",
      }));
    } catch (err: any) {
      let errorMsg = "An unexpected error occurred.";
      let errorCode = "UNKNOWN";

      if (err.status === 404) {
        errorMsg = "Repository not found or not accessible";
        errorCode = "REPO_NOT_FOUND";
      } else if (err.status === 403) {
        errorMsg = "Private repository. Add a GitHub token.";
        errorCode = "PRIVATE_REPO";
      } else if (err.status === 429) {
        // Mocking retryAfterSeconds parse if any
        errorMsg = "Scan limit reached. Try again in a few minutes.";
        errorCode = "RATE_LIMITED";
      } else if (err.message) {
        errorMsg = err.message;
      }

      setState((s) => ({
        ...s,
        phase: "error",
        error: errorMsg,
        errorCode,
      }));
    }
  }, []);

  // Polling effect
  const fetcher = (url: string) => fetch(url).then((res) => res.json());

  const { data: statusData, error: statusError } = useSWR(
    state.scanId && state.phase === "scanning"
      ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/analyze/${state.scanId}/status`
      : null,
    fetcher,
    { refreshInterval: state.phase === "scanning" ? 2000 : 0 }
  );

  useEffect(() => {
    if (statusError) {
      setState((s) => ({
        ...s,
        phase: "error",
        error: "Failed to poll status",
      }));
      return;
    }

    if (statusData && statusData.data) {
      const data = statusData.data;
      setState((s) => ({
        ...s,
        layers: data.layers || [],
        overallProgress: data.progress || 0,
      }));

      if (data.overallStatus === "completed") {
        setState((s) => ({ ...s, phase: "completed" }));
      } else if (data.overallStatus === "failed") {
        setState((s) => ({
          ...s,
          phase: "error",
          error: data.error || "Scan failed",
        }));
      }
    }
  }, [statusData, statusError]);

  // Fetch results when completed
  useEffect(() => {
    let mounted = true;
    if (state.phase === "completed" && state.scanId) {
      analyzeApi
        .getResults(state.scanId)
        .then((res) => {
          if (mounted) {
            let firstFileWithFindings = null;
            if (res.files && res.files.length > 0) {
              firstFileWithFindings =
                res.files.find((f) => f.findings && f.findings.length > 0)?.filePath ||
                res.files[0].filePath;
            }

            setState((s) => ({
              ...s,
              results: res,
              phase: "results",
              selectedFile: firstFileWithFindings,
            }));
          }
        })
        .catch((err) => {
          if (mounted) {
            setState((s) => ({
              ...s,
              phase: "error",
              error: err.message || "Failed to load results",
            }));
          }
        });
    }
    return () => {
      mounted = false;
    };
  }, [state.phase, state.scanId]);

  const selectFile = useCallback((filePath: string) => {
    setState((s) => ({ ...s, selectedFile: filePath, selectedFindingId: null }));
  }, []);

  const selectFinding = useCallback((findingId: string | null) => {
    setState((s) => ({ ...s, selectedFindingId: findingId }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("scanId");
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const retryAI = useCallback(async () => {
    // If we wanted to retry just AI, we could hit a different endpoint
    // For now, let's leave it as a no-op or do a full reset
  }, []);

  return {
    state,
    submit,
    selectFile,
    selectFinding,
    reset,
    retryAI,
  };
}
