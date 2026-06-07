import type {
  RepoSummary,
  ScanSummary,
  ScanDetail,
  AIJobStatus,
  QueueStats,
  Pagination,
  CreateRepoInput,
  ScanOptions,
  RepoSettings,
} from './types';

export class APIError extends Error {
  constructor(public message: string, public status: number) {
    super(message);
    this.name = 'APIError';
  }
}

class APIClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    const response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    }

    if (!response.ok) {
      throw new APIError(
        data?.error || data?.message || 'An API error occurred',
        response.status
      );
    }

    return data as T;
  }

  // ── REPOS ───────────────────────────────────────────────────────────────

  async getRepos(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ repos: RepoSummary[]; pagination: Pagination }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.search) searchParams.append('search', params.search);
    
    const query = searchParams.toString();
    const result = await this.request<any>('GET', `/api/repos${query ? `?${query}` : ''}`);
    return { repos: result.data?.repos || [], pagination: result.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 } };
  }

  async getRepo(id: string): Promise<RepoSummary> {
    const result = await this.request<{ data: RepoSummary }>('GET', `/api/repos/${id}`);
    return result.data;
  }

  async createRepo(data: CreateRepoInput): Promise<RepoSummary> {
    const payload = {
      repoUrl: data.url,
      defaultBranch: data.branch || 'main',
      githubToken: data.url.includes('github.com') ? data.token : undefined,
      gitlabToken: data.url.includes('gitlab.com') ? data.token : undefined,
      settings: {
        autoScanOnPush: data.autoScanOnPush ?? false,
        notifyOnCritical: data.notifyOnCritical ?? true,
      }
    };
    const result = await this.request<{ data: RepoSummary }>('POST', '/api/repos', payload);
    return result.data;
  }

  async deleteRepo(id: string): Promise<void> {
    await this.request('DELETE', `/api/repos/${id}`);
  }

  async updateRepo(id: string, data: Partial<RepoSettings>): Promise<RepoSummary> {
    const result = await this.request<{ data: RepoSummary }>('PATCH', `/api/repos/${id}`, data);
    return result.data;
  }

  // ── SCANS ───────────────────────────────────────────────────────────────

  async triggerScan(repoId: string, options?: ScanOptions): Promise<{ scanId: string; status: string; jobId?: string }> {
    const result = await this.request<{ data: { scanId: string; status: string; jobId?: string } }>('POST', `/api/repos/${repoId}/scan`, options);
    return result.data;
  }

  async getScans(
    repoId: string,
    params?: { page?: number; status?: string }
  ): Promise<{ scans: ScanSummary[]; pagination: Pagination }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.status) searchParams.append('status', params.status);
    
    const query = searchParams.toString();
    const result = await this.request<any>('GET', `/api/repos/${repoId}/scans${query ? `?${query}` : ''}`);
    return { scans: result.data?.scans || [], pagination: result.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 } };
  }

  async getLatestScan(repoId: string): Promise<ScanDetail> {
    const result = await this.request<{ data: ScanDetail }>('GET', `/api/repos/${repoId}/scans/latest`);
    return result.data;
  }

  async getScan(repoId: string, scanId: string): Promise<ScanDetail> {
    const result = await this.request<{ data: ScanDetail }>('GET', `/api/repos/${repoId}/scans/${scanId}`);
    return result.data;
  }

  // ── AI ──────────────────────────────────────────────────────────────────

  async startExplain(scanId: string): Promise<{ jobId: string }> {
    const result = await this.request<{ data: { jobId: string } }>('POST', `/api/scans/${scanId}/explain`);
    return result.data;
  }

  async getExplainStatus(scanId: string, jobId: string): Promise<AIJobStatus> {
    const result = await this.request<{ data: AIJobStatus }>('GET', `/api/scans/${scanId}/explain/${jobId}`);
    return result.data;
  }

  async startRemediate(scanId: string): Promise<{ jobId: string }> {
    const result = await this.request<{ data: { jobId: string } }>('POST', `/api/scans/${scanId}/remediate`);
    return result.data;
  }

  async getRemediateStatus(scanId: string, jobId: string): Promise<AIJobStatus> {
    const result = await this.request<{ data: AIJobStatus }>('GET', `/api/scans/${scanId}/remediate/${jobId}`);
    return result.data;
  }

  async startAIReport(scanId: string): Promise<{ jobId: string }> {
    const result = await this.request<{ data: { jobId: string } }>('POST', `/api/scans/${scanId}/ai-report`);
    return result.data;
  }

  async getAIReportStatus(scanId: string, jobId: string): Promise<AIJobStatus> {
    const result = await this.request<{ data: AIJobStatus }>('GET', `/api/scans/${scanId}/ai-report/${jobId}`);
    return result.data;
  }

  // ── QUEUE ───────────────────────────────────────────────────────────────

  async getQueueStats(): Promise<QueueStats> {
    // The backend queue stats route seems to return a complex structure
    // from your Phase 4 setup, let's adapt it to our needs.
    const result = await this.request<{ data: { queues: { scan: any, analysis: any, ai: any } } }>('GET', '/api/queue/stats');
    
    // Default safe fallback if structure differs
    const qs = result.data?.queues || { scan: {}, analysis: {}, ai: {} };
    
    return {
      scanQueue: {
        waiting: qs.scan.waiting || 0,
        active: qs.scan.active || 0,
        completed: qs.scan.completed || 0,
        failed: qs.scan.failed || 0,
        delayed: qs.scan.delayed || 0,
      },
      analysisQueue: {
        waiting: qs.analysis.waiting || 0,
        active: qs.analysis.active || 0,
        completed: qs.analysis.completed || 0,
        failed: qs.analysis.failed || 0,
        delayed: qs.analysis.delayed || 0,
      },
      aiQueue: {
        waiting: qs.ai.waiting || 0,
        active: qs.ai.active || 0,
        completed: qs.ai.completed || 0,
        failed: qs.ai.failed || 0,
        delayed: qs.ai.delayed || 0,
      }
    };
  }
}

export const apiClient = new APIClient();
