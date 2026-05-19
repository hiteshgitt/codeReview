import { create } from 'zustand';
import { AuditSummary, AuditStats, Pagination } from '@/types';

interface AuditState {
  audits: AuditSummary[];
  pagination: Pagination | null;
  stats: AuditStats | null;
  isLoading: boolean;
  setAudits: (audits: AuditSummary[], pagination: Pagination) => void;
  setStats: (stats: AuditStats) => void;
  addAudit: (audit: AuditSummary) => void;
  removeAudit: (id: string) => void;
  updateAudit: (audit: Partial<AuditSummary> & { id: string }) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuditStore = create<AuditState>((set) => ({
  audits: [],
  pagination: null,
  stats: null,
  isLoading: false,

  setAudits: (audits, pagination) => set({ audits, pagination }),

  setStats: (stats) => set({ stats }),

  addAudit: (audit) =>
    set((state) => ({
      audits: [audit, ...state.audits],
      stats: state.stats ? { ...state.stats, total: state.stats.total + 1, pending: state.stats.pending + 1 } : state.stats,
    })),

  removeAudit: (id) =>
    set((state) => ({ audits: state.audits.filter((a) => a.id !== id) })),

  updateAudit: (update) =>
    set((state) => ({
      audits: state.audits.map((a) => (a.id === update.id ? { ...a, ...update } : a)),
    })),

  setLoading: (isLoading) => set({ isLoading }),
}));
