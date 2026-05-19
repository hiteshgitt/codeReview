export type AuditStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ProjectType = 'landing_page' | 'website';
export type Framework =
  | 'html'
  | 'php'
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'laravel'
  | 'codeigniter'
  | 'wordpress';
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'suggestion';
export type IssueCategory =
  | 'code-quality'
  | 'performance'
  | 'responsiveness'
  | 'accessibility'
  | 'seo'
  | 'best-practices'
  | 'security'
  | 'ux-ui';

export interface AuditIssue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  impact: string;
  element?: string;
  locations?: string[]; // "src/styles/main.css:42" format
}

export interface CategoryResult {
  score: number;
  issues: AuditIssue[];
  metrics: Record<string, string | number | boolean | null>;
}

export interface AuditScores {
  performance: CategoryResult;
  accessibility: CategoryResult;
  seo: CategoryResult;
  bestPractices: CategoryResult;
  security: CategoryResult;
  codeQuality: CategoryResult;
  responsiveness: CategoryResult;
  uxUi: CategoryResult;
}

export interface Audit {
  id: string;
  name: string | null;
  websiteUrl: string;
  repoUrl: string | null;
  projectType: ProjectType;
  framework: Framework;
  status: AuditStatus;
  overallScore: number | null;
  scores: AuditScores | null;
  issues: AuditIssue[] | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AuditSummary {
  id: string;
  name: string | null;
  websiteUrl: string;
  repoUrl: string | null;
  projectType: ProjectType;
  framework: Framework;
  status: AuditStatus;
  overallScore: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuditStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  avgScore: number | null;
  criticalIssues: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}
