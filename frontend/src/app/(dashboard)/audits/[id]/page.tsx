'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Download, Loader2, Clock, Globe, GitBranch, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Info, AlertCircle, LayoutTemplate, FileCode2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAudit, getReportPDFUrl, getErrorMessage } from '@/lib/api';
import { Audit, IssueSeverity, Framework } from '@/types';
import ScoreRing from '@/components/report/ScoreRing';
import CategoryBreakdown from '@/components/report/CategoryBreakdown';
import IssueList from '@/components/report/IssueList';
import { formatDate, getScoreGrade, getScoreHex } from '@/lib/utils';

const FRAMEWORK_LABELS: Record<Framework, string> = {
  html: 'HTML/CSS/JS', php: 'PHP', nextjs: 'Next.js',
  react: 'React', vue: 'Vue.js', laravel: 'Laravel',
  codeigniter: 'CodeIgniter', wordpress: 'WordPress',
};

const FRAMEWORK_COLORS: Record<Framework, string> = {
  html: 'bg-orange-50 text-orange-700', php: 'bg-indigo-50 text-indigo-700',
  nextjs: 'bg-slate-900 text-white', react: 'bg-cyan-50 text-cyan-700',
  vue: 'bg-emerald-50 text-emerald-700', laravel: 'bg-red-50 text-red-700',
  codeigniter: 'bg-amber-50 text-amber-700', wordpress: 'bg-blue-50 text-blue-700',
};

const categories = [
  { key: 'performance' as const, label: 'Performance', weight: '20%' },
  { key: 'accessibility' as const, label: 'Accessibility', weight: '15%' },
  { key: 'seo' as const, label: 'SEO', weight: '15%' },
  { key: 'security' as const, label: 'Security', weight: '15%' },
  { key: 'bestPractices' as const, label: 'Best Practices', weight: '10%' },
  { key: 'codeQuality' as const, label: 'Code Quality', weight: '15%' },
  { key: 'responsiveness' as const, label: 'Responsiveness', weight: '5%' },
  { key: 'uxUi' as const, label: 'UX / UI', weight: '5%' },
] as const;

function StatusBanner({ status, errorMessage }: { status: string; errorMessage?: string | null }) {
  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <Clock className="h-5 w-5 text-amber-600 shrink-0 animate-pulse" />
        <div>
          <p className="font-semibold text-amber-800">Audit queued</p>
          <p className="text-amber-700 text-sm">Your audit is waiting to start. This page will refresh automatically.</p>
        </div>
      </div>
    );
  }

  if (status === 'RUNNING') {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <Loader2 className="h-5 w-5 text-blue-600 shrink-0 animate-spin" />
        <div>
          <p className="font-semibold text-blue-800">Analysis in progress</p>
          <p className="text-blue-700 text-sm">Running Lighthouse, SEO, accessibility, responsiveness, code quality checks, and AI-powered review…</p>
        </div>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
        <XCircle className="h-5 w-5 text-red-600 shrink-0" />
        <div>
          <p className="font-semibold text-red-800">Audit failed</p>
          <p className="text-red-700 text-sm">{errorMessage || 'An unexpected error occurred during analysis.'}</p>
        </div>
      </div>
    );
  }

  return null;
}

export default function AuditDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const fetchAudit = useCallback(async (isPolling = false) => {
    try {
      const data = await getAudit(id);
      setAudit(data);
      return data;
    } catch (error) {
      if (isPolling) {
        // During polling, a transient network error should not redirect — just log it silently
        return null;
      }
      // On initial load: redirect only for 404 (audit not found); show toast for everything else
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        router.push('/audits');
      } else {
        toast.error(getErrorMessage(error));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchAudit(false);
  }, [fetchAudit]);

  // Poll while pending or running
  useEffect(() => {
    if (!audit) return;
    if (audit.status !== 'PENDING' && audit.status !== 'RUNNING') return;

    const interval = setInterval(async () => {
      const data = await fetchAudit(true);
      if (data && data.status !== 'PENDING' && data.status !== 'RUNNING') {
        clearInterval(interval);
        if (data.status === 'COMPLETED') {
          toast.success('Audit completed!');
        }
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [audit?.status, fetchAudit]);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const url = getReportPDFUrl(id);
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('wap_token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `audit-report-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      toast.error('Failed to generate PDF report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!audit) return null;

  const isComplete = audit.status === 'COMPLETED';
  const allIssues = audit.issues ?? [];

  const severityCounts = allIssues.reduce(
    (acc, issue) => ({ ...acc, [issue.severity]: (acc[issue.severity] ?? 0) + 1 }),
    {} as Record<IssueSeverity, number>,
  );

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Back + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link
          href="/audits"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All audits
        </Link>

        <div className="flex items-center gap-2">
          {(audit.status === 'PENDING' || audit.status === 'RUNNING') && (
            <button
              onClick={() => fetchAudit()}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors px-3 py-2 border border-slate-300 rounded-lg"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          )}
          {isComplete && (
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PDF
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {isComplete && audit.overallScore != null && (
            <ScoreRing score={audit.overallScore} size={140} label="Overall" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {audit.name || audit.websiteUrl}
              </h1>
              {audit.projectType === 'landing_page' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700 shrink-0">
                  <LayoutTemplate className="h-3 w-3" /> Landing Page
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0 ${FRAMEWORK_COLORS[audit.framework as Framework] ?? 'bg-slate-100 text-slate-600'}`}>
                  <FileCode2 className="h-3 w-3" />
                  {FRAMEWORK_LABELS[audit.framework as Framework] ?? audit.framework}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 shrink-0" />
                <a href={audit.websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 truncate max-w-xs">
                  {audit.websiteUrl}
                </a>
              </span>
              {audit.repoUrl && (
                <span className="flex items-center gap-1.5">
                  <GitBranch className="h-4 w-4 shrink-0" />
                  <a href={audit.repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brand-600 truncate max-w-xs">
                    {audit.repoUrl}
                  </a>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Started {formatDate(audit.createdAt)}
              {audit.completedAt && ` · Completed ${formatDate(audit.completedAt)}`}
            </p>

            {isComplete && (
              <div className="flex flex-wrap gap-3 mt-4">
                {(
                  [
                    { severity: 'critical' as IssueSeverity, icon: AlertCircle, color: 'text-red-600' },
                    { severity: 'major' as IssueSeverity, icon: AlertTriangle, color: 'text-orange-600' },
                    { severity: 'minor' as IssueSeverity, icon: Info, color: 'text-amber-600' },
                  ] as const
                ).map(({ severity, icon: Icon, color }) => (
                  <div key={severity} className={`flex items-center gap-1.5 text-sm font-medium ${color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {severityCounts[severity] ?? 0} {severity}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status banner for non-completed */}
      {!isComplete && (
        <StatusBanner status={audit.status} errorMessage={audit.errorMessage} />
      )}

      {/* Full report */}
      {isComplete && audit.scores && (
        <>
          {/* Category scores list */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="p-6 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-lg">Score Summary</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {categories.map(({ key, label, weight }) => {
                const cat = audit.scores![key] ?? { score: 0, issues: [], metrics: {} };
                const color = getScoreHex(cat.score);
                const critCount = cat.issues.filter(i => i.severity === 'critical').length;
                return (
                  <div key={key} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-32 shrink-0">
                      <p className="text-sm font-medium text-slate-700">{label}</p>
                      <p className="text-xs text-slate-400">weight: {weight}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-slate-400">{cat.issues.length} issue{cat.issues.length !== 1 ? 's' : ''}{critCount > 0 ? ` (${critCount} critical)` : ''}</span>
                        <span className="font-bold text-sm" style={{ color }}>{cat.score.toFixed(1)}/10 · {getScoreGrade(cat.score)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${(cat.score / 10) * 100}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Radar + cards */}
          <CategoryBreakdown scores={audit.scores} />

          {/* Performance metrics */}
          {audit.scores.performance.metrics && Object.keys(audit.scores.performance.metrics).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="p-6 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900 text-lg">Core Web Vitals</h2>
              </div>
              <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { key: 'fcp', label: 'FCP', good: '< 1.8s' },
                  { key: 'lcp', label: 'LCP', good: '< 2.5s' },
                  { key: 'tbt', label: 'TBT', good: '< 300ms' },
                  { key: 'cls', label: 'CLS', good: '< 0.1' },
                  { key: 'si', label: 'Speed Index', good: '< 3.4s' },
                  { key: 'tti', label: 'TTI', good: '< 5s' },
                ].map(({ key, label, good }) => {
                  const value = audit.scores!.performance.metrics[key];
                  return (
                    <div key={key} className="bg-slate-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-500 mb-1">{label}</p>
                      <p className="font-bold text-slate-900 text-lg">{value ?? '—'}</p>
                      <p className="text-xs text-slate-400 mt-1">Good: {good}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Issues list */}
          {allIssues.length > 0 && <IssueList issues={allIssues} />}

          {allIssues.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-green-800 text-lg">No issues found!</p>
              <p className="text-green-700 text-sm mt-1">Your website passed all checks. Excellent work!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
