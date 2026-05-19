'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, TrendingUp, CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { getAuditStats, listAudits, getErrorMessage } from '@/lib/api';
import { useAuditStore } from '@/store/audit.store';
import { useAuthStore } from '@/store/auth.store';
import AuditCard from '@/components/audit/AuditCard';
import { AuditStats } from '@/types';
import { getScoreColor, getScoreGrade, getScoreHex } from '@/lib/utils';
import toast from 'react-hot-toast';

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-500 text-sm font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { audits, setAudits, setStats, stats } = useAuditStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, auditsData] = await Promise.all([
          getAuditStats(),
          listAudits(1, 5),
        ]);
        setStats(statsData);
        setAudits(auditsData.audits, auditsData.pagination);
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [setStats, setAudits]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Good {getGreeting()}, {firstName}</h1>
          <p className="text-slate-500 text-sm mt-1">Here&apos;s an overview of your website audits</p>
        </div>
        <Link
          href="/new-audit"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          <PlusCircle className="h-4 w-4" />
          New Audit
        </Link>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 h-24 animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={CheckCircle2} label="Total Audits" value={stats?.total ?? 0} color="bg-brand-50 text-brand-600" />
          <StatCard icon={TrendingUp} label="Avg Score" value={stats?.avgScore != null ? `${stats.avgScore}/10` : '—'} color="bg-green-50 text-green-600" />
          <StatCard icon={Clock} label="Pending" value={stats?.pending ?? 0} color="bg-amber-50 text-amber-600" />
          <StatCard icon={AlertTriangle} label="Critical Issues" value={stats?.criticalIssues ?? 0} color="bg-red-50 text-red-600" />
        </div>
      )}

      {/* Avg score visual */}
      {!loading && stats?.avgScore != null && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Average Score</h2>
            <span className={`text-2xl font-black ${getScoreColor(stats.avgScore)}`}>
              {stats.avgScore}/10 — {getScoreGrade(stats.avgScore)}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all duration-700"
              style={{
                width: `${(stats.avgScore / 10) * 100}%`,
                backgroundColor: getScoreHex(stats.avgScore),
              }}
            />
          </div>
        </div>
      )}

      {/* Recent audits */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 text-lg">Recent Audits</h2>
          <Link href="/audits" className="text-brand-600 hover:text-brand-500 text-sm font-medium">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : audits.length === 0 ? (
          <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-12 text-center">
            <PlusCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No audits yet</p>
            <p className="text-slate-400 text-sm mt-1 mb-5">Create your first audit to get started</p>
            <Link
              href="/new-audit"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              <PlusCircle className="h-4 w-4" />
              Start an audit
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {audits.map((audit) => (
              <AuditCard key={audit.id} audit={audit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

