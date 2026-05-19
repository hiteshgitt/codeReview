import Link from 'next/link';
import { ExternalLink, Clock, CheckCircle2, XCircle, Loader2, Globe, GitBranch } from 'lucide-react';
import { AuditSummary, Framework, ProjectType } from '@/types';
import { getScoreColor, getScoreGrade, getScoreBg, formatRelativeTime, truncateUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  audit: AuditSummary;
}

const statusConfig = {
  PENDING: { icon: Clock, label: 'Pending', className: 'text-amber-600 bg-amber-50' },
  RUNNING: { icon: Loader2, label: 'Running', className: 'text-blue-600 bg-blue-50 animate-pulse' },
  COMPLETED: { icon: CheckCircle2, label: 'Completed', className: 'text-green-600 bg-green-50' },
  FAILED: { icon: XCircle, label: 'Failed', className: 'text-red-600 bg-red-50' },
};

const FRAMEWORK_LABELS: Record<Framework, string> = {
  html: 'HTML/CSS/JS',
  php: 'PHP',
  nextjs: 'Next.js',
  react: 'React',
  vue: 'Vue.js',
  laravel: 'Laravel',
  codeigniter: 'CodeIgniter',
  wordpress: 'WordPress',
};

const FRAMEWORK_COLORS: Record<Framework, string> = {
  html:        'bg-orange-50 text-orange-700',
  php:         'bg-indigo-50 text-indigo-700',
  nextjs:      'bg-slate-900 text-white',
  react:       'bg-cyan-50 text-cyan-700',
  vue:         'bg-emerald-50 text-emerald-700',
  laravel:     'bg-red-50 text-red-700',
  codeigniter: 'bg-amber-50 text-amber-700',
  wordpress:   'bg-blue-50 text-blue-700',
};

function ProjectBadge({ projectType, framework }: { projectType: ProjectType; framework: Framework }) {
  if (projectType === 'landing_page') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700">
        Landing Page
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', FRAMEWORK_COLORS[framework] ?? 'bg-slate-100 text-slate-600')}>
      {FRAMEWORK_LABELS[framework] ?? framework}
    </span>
  );
}

export default function AuditCard({ audit }: Props) {
  const status = statusConfig[audit.status];
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/audits/${audit.id}`}
      className="block bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-900 truncate">
              {audit.name || truncateUrl(audit.websiteUrl)}
            </span>
          </div>
          <p className="text-slate-500 text-xs truncate mb-2">{audit.websiteUrl}</p>

          <div className="flex items-center gap-2 flex-wrap">
            <ProjectBadge projectType={audit.projectType ?? 'website'} framework={audit.framework ?? 'html'} />
            {audit.repoUrl && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <GitBranch className="h-3 w-3" />
                <span className="truncate max-w-[160px]">{truncateUrl(audit.repoUrl)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {audit.status === 'COMPLETED' && audit.overallScore != null ? (
            <div className="text-right">
              <div className={`text-2xl font-black ${getScoreColor(audit.overallScore)}`}>
                {audit.overallScore.toFixed(1)}
              </div>
              <div className={`inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold ${getScoreBg(audit.overallScore)}`}>
                {getScoreGrade(audit.overallScore)}
              </div>
            </div>
          ) : (
            <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium', status.className)}>
              <StatusIcon className={cn('h-3.5 w-3.5', audit.status === 'RUNNING' && 'animate-spin')} />
              {status.label}
            </div>
          )}
          <span className="text-slate-400 text-xs">{formatRelativeTime(audit.createdAt)}</span>
        </div>
      </div>

      {audit.status === 'COMPLETED' && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-brand-600 font-medium group-hover:gap-2 transition-all">
          View full report <ExternalLink className="h-3 w-3" />
        </div>
      )}
    </Link>
  );
}
