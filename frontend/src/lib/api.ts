import axios, { AxiosError } from 'axios';
import { Audit, AuditSummary, AuditStats, Pagination, User } from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Inject auth token from localStorage on every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('wap_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Redirect to login on 401
let redirectingToLogin = false;

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined' && !redirectingToLogin) {
      redirectingToLogin = true;
      // Clear all auth state — localStorage keys AND the cookie the middleware reads
      localStorage.removeItem('wap_token');
      localStorage.removeItem('wap_user');
      localStorage.removeItem('wap_auth'); // Zustand persist key
      document.cookie = 'wap_token=; path=/; max-age=0; SameSite=Lax';
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function register(email: string, password: string, name: string) {
  const res = await api.post<{ success: boolean; data: { user: User; token: string } }>(
    '/auth/register',
    { email, password, name },
  );
  return res.data.data;
}

export async function login(email: string, password: string) {
  const res = await api.post<{ success: boolean; data: { user: User; token: string } }>(
    '/auth/login',
    { email, password },
  );
  return res.data.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<{ success: boolean; data: { user: User } }>('/auth/me');
  return res.data.data.user;
}

// ── Audits ────────────────────────────────────────────────────────────────────

export async function createAudit(
  websiteUrl: string,
  repoUrl?: string,
  name?: string,
  projectType?: string,
  framework?: string,
  repoToken?: string,
) {
  const res = await api.post<{ success: boolean; data: { audit: AuditSummary } }>('/audits', {
    websiteUrl,
    repoUrl: repoUrl || undefined,
    name: name || undefined,
    projectType: projectType || undefined,
    framework: framework || undefined,
    repoToken: repoToken || undefined,
  });
  return res.data.data.audit;
}

export async function getAudit(id: string): Promise<Audit> {
  const res = await api.get<{ success: boolean; data: { audit: Audit } }>(`/audits/${id}`);
  return res.data.data.audit;
}

export async function listAudits(
  page = 1,
  limit = 10,
): Promise<{ audits: AuditSummary[]; pagination: Pagination }> {
  const res = await api.get<{
    success: boolean;
    data: { audits: AuditSummary[]; pagination: Pagination };
  }>('/audits', { params: { page, limit } });
  return res.data.data;
}

export async function deleteAudit(id: string): Promise<void> {
  await api.delete(`/audits/${id}`);
}

export async function getAuditStats(): Promise<AuditStats> {
  const res = await api.get<{ success: boolean; data: { stats: AuditStats } }>('/audits/stats');
  return res.data.data.stats;
}

export function getReportPDFUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  return `${base}/audits/${id}/report/pdf`;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Array<{ message: string }> };
    if (data?.errors?.length) return data.errors[0].message;
    if (data?.message) return data.message;
    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}
