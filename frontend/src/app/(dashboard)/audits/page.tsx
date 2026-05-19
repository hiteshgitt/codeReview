'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { PlusCircle, Loader2, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { listAudits, deleteAudit, getErrorMessage } from '@/lib/api';
import { useAuditStore } from '@/store/audit.store';
import AuditCard from '@/components/audit/AuditCard';

export default function AuditsPage() {
  const { audits, pagination, setAudits, removeAudit } = useAuditStore();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const result = await listAudits(p, 10);
      setAudits(result.audits, result.pagination);
      setPage(p);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [setAudits]);

  useEffect(() => { load(1); }, [load]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this audit? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteAudit(id);
      removeAudit(id);
      toast.success('Audit deleted');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Audits</h1>
          {pagination && (
            <p className="text-slate-500 text-sm mt-1">{pagination.total} audit{pagination.total !== 1 ? 's' : ''} total</p>
          )}
        </div>
        <Link
          href="/new-audit"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          <PlusCircle className="h-4 w-4" />
          New Audit
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
        </div>
      ) : audits.length === 0 ? (
        <div className="bg-white border border-slate-200 border-dashed rounded-2xl p-16 text-center">
          <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No audits yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-5">Run your first audit to see results here</p>
          <Link
            href="/new-audit"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            New Audit
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {audits.map((audit) => (
              <div key={audit.id} className="group flex items-stretch gap-2">
                <div className="flex-1 min-w-0">
                  <AuditCard audit={audit} />
                </div>
                <button
                  onClick={(e) => handleDelete(audit.id, e)}
                  disabled={deletingId === audit.id}
                  className="shrink-0 self-center opacity-0 group-hover:opacity-100 p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 bg-white border border-slate-200 rounded-xl transition-all"
                  aria-label="Delete audit"
                >
                  {deletingId === audit.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => load(page - 1)}
                disabled={page <= 1 || loading}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => load(page + 1)}
                disabled={page >= pagination.pages || loading}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
