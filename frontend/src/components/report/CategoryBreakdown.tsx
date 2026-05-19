'use client';

import { AuditScores } from '@/types';
import { getScoreGrade, getScoreHex } from '@/lib/utils';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  scores: AuditScores;
}

const categories = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'seo', label: 'SEO' },
  { key: 'security', label: 'Security' },
  { key: 'bestPractices', label: 'Best Practices' },
  { key: 'codeQuality', label: 'Code Quality' },
  { key: 'responsiveness', label: 'Responsive' },
  { key: 'uxUi', label: 'UX / UI' },
] as const;

export default function CategoryBreakdown({ scores }: Props) {
  const radarData = categories.map(({ key, label }) => ({
    category: label,
    score: (scores[key] ?? { score: 0 }).score,
    fullMark: 10,
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900 text-lg">Category Breakdown</h2>
      </div>

      <div className="p-6 grid lg:grid-cols-2 gap-8 items-center">
        {/* Radar chart */}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
              />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Tooltip
                contentStyle={{
                  background: '#1e293b',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#f1f5f9',
                  fontSize: '13px',
                }}
                formatter={(value: number) => [`${value.toFixed(1)} / 10`, 'Score']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Score cards grid */}
        <div className="grid grid-cols-2 gap-3">
          {categories.map(({ key, label }) => {
            const cat = scores[key] ?? { score: 0, issues: [], metrics: {} };
            const { score } = cat;
            const color = getScoreHex(score);
            const issueCount = cat.issues.length;
            return (
              <div key={key} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                  <span
                    className="text-xs font-bold text-white px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: color }}
                  >
                    {getScoreGrade(score)}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xl font-black" style={{ color }}>{score.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(score / 10) * 100}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
