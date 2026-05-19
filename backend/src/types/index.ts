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

export interface AuditResult {
  overallScore: number;
  scores: AuditScores;
  lighthouseData?: LighthouseData;
}

export interface LighthouseData {
  performance: number;
  accessibility: number;
  seo: number;
  bestPractices: number;
  metrics: {
    fcp?: number;
    lcp?: number;
    tbt?: number;
    cls?: number;
    si?: number;
    tti?: number;
  };
  audits: Record<string, LighthouseAudit>;
}

export interface LighthouseAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  details?: Record<string, unknown>;
}

export interface CreateAuditDto {
  websiteUrl: string;
  repoUrl?: string;
  repoToken?: string;
  name?: string;
  projectType?: ProjectType;
  framework?: Framework;
}

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Express.Request {
  user?: JwtPayload;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
