'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Info, Lightbulb, MapPin } from 'lucide-react';
import { AuditIssue, IssueSeverity, IssueCategory } from '@/types';
import { getSeverityColor, getSeverityDot, cn } from '@/lib/utils';

interface Props {
  issues: AuditIssue[];
}

const severityOrder: IssueSeverity[] = ['critical', 'major', 'minor', 'suggestion'];

const severityIcons: Record<IssueSeverity, React.ElementType> = {
  critical: AlertCircle,
  major: AlertTriangle,
  minor: Info,
  suggestion: Lightbulb,
};

const categoryLabels: Record<IssueCategory, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'security': 'Security',
  'best-practices': 'Best Practices',
  'code-quality': 'Code Quality',
  'responsiveness': 'Responsiveness',
  'ux-ui': 'UX / UI',
};

function IssueItem({ issue }: { issue: AuditIssue }) {
  const [expanded, setExpanded] = useState(false);
  const SeverityIcon = severityIcons[issue.severity];

  return (
    <article className={cn('border rounded-xl overflow-hidden transition-shadow', getSeverityColor(issue.severity))}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:brightness-95 transition-all"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} issue: ${issue.title}`}
      >
        <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <span className="font-semibold text-sm">{issue.title}</span>
            <span className="text-xs opacity-70 bg-white/50 px-2 py-0.5 rounded-full shrink-0">
              {categoryLabels[issue.category] ?? issue.category}
            </span>
          </div>
          {!expanded && (
            <p className="text-xs opacity-80 mt-1 line-clamp-1">{issue.description}</p>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 mt-0.5 opacity-60" /> : <ChevronDown className="h-4 w-4 shrink-0 mt-0.5 opacity-60" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-current/10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Issue</p>
            <p className="text-sm">{issue.description}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Recommendation</p>
            <p className="text-sm">{issue.recommendation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Impact</p>
            <p className="text-sm italic">{issue.impact}</p>
          </div>
          {issue.element && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-1">Element</p>
              <code className="text-xs bg-black/10 px-2 py-1 rounded">{issue.element}</code>
            </div>
          )}
          {issue.locations && issue.locations.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-60 mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Locations ({issue.locations.length})
              </p>
              <div className="flex flex-col gap-1">
                {issue.locations.map((loc, i) => {
                  const [file, line] = loc.split(':');
                  return (
                    <div key={i} className="flex items-center gap-2 bg-black/10 px-2 py-1.5 rounded text-xs font-mono">
                      <span className="opacity-70 shrink-0 truncate max-w-[calc(100%-3rem)]">{file}</span>
                      {line && (
                        <span className="ml-auto shrink-0 font-semibold opacity-90">:{line}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function IssueList({ issues }: Props) {
  const [activeCategory, setActiveCategory] = useState<IssueCategory | 'all'>('all');
  const [activeSeverity, setActiveSeverity] = useState<IssueSeverity | 'all'>('all');

  const filteredIssues = issues.filter((issue) => {
    const catMatch = activeCategory === 'all' || issue.category === activeCategory;
    const sevMatch = activeSeverity === 'all' || issue.severity === activeSeverity;
    return catMatch && sevMatch;
  });

  // Sort by severity
  filteredIssues.sort(
    (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
  );

  const counts = severityOrder.reduce(
    (acc, s) => ({ ...acc, [s]: issues.filter((i) => i.severity === s).length }),
    {} as Record<IssueSeverity, number>,
  );

  const categories = [...new Set(issues.map((i) => i.category))] as IssueCategory[];

  const severityBadgeColors: Record<IssueSeverity, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    major: 'bg-orange-100 text-orange-700 border-orange-200',
    minor: 'bg-amber-100 text-amber-700 border-amber-200',
    suggestion: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 text-lg">
            Issues <span className="text-slate-400 font-normal text-base">({issues.length})</span>
          </h2>
        </div>

        {/* Severity summary */}
        <div className="flex flex-wrap gap-2 mb-4">
          {severityOrder.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSeverity(activeSeverity === s ? 'all' : s)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors capitalize',
                activeSeverity === s
                  ? severityBadgeColors[s]
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300',
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', getSeverityDot(s))} />
              {s} ({counts[s]})
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              activeCategory === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300',
            )}
          >
            All categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? 'all' : cat)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300',
              )}
            >
              {categoryLabels[cat] ?? cat}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-3">
        {filteredIssues.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">No issues match the current filter</p>
        ) : (
          filteredIssues.map((issue) => <IssueItem key={issue.id} issue={issue} />)
        )}
      </div>
    </div>
  );
}
