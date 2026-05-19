import { AuditScores } from '../../types';

const CATEGORY_WEIGHTS = {
  performance: 0.2,
  accessibility: 0.15,
  seo: 0.15,
  bestPractices: 0.1,
  security: 0.15,
  codeQuality: 0.15,
  responsiveness: 0.05,
  uxUi: 0.05,
} as const;

export function calculateOverallScore(scores: AuditScores): number {
  const total = Object.entries(CATEGORY_WEIGHTS).reduce((sum, [category, weight]) => {
    const categoryScore = scores[category as keyof AuditScores]?.score ?? 0;
    return sum + categoryScore * weight;
  }, 0);

  return Math.round(total * 10) / 10;
}

export function getScoreGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 9) return 'A';
  if (score >= 7) return 'B';
  if (score >= 5) return 'C';
  if (score >= 3) return 'D';
  return 'F';
}

export function getScoreColor(score: number): string {
  if (score >= 9) return '#22c55e';
  if (score >= 7) return '#84cc16';
  if (score >= 5) return '#f59e0b';
  if (score >= 3) return '#f97316';
  return '#ef4444';
}

export function lighthouseScoreToTen(score: number | null | undefined): number {
  if (score === null || score === undefined) return 0;
  return Math.round(score * 100) / 10;
}
