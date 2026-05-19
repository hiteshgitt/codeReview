import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { IssueSeverity } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-500';
  if (score >= 7) return 'text-lime-500';
  if (score >= 5) return 'text-amber-500';
  if (score >= 3) return 'text-orange-500';
  return 'text-red-500';
}

export function getScoreBg(score: number): string {
  if (score >= 9) return 'bg-green-500';
  if (score >= 7) return 'bg-lime-500';
  if (score >= 5) return 'bg-amber-500';
  if (score >= 3) return 'bg-orange-500';
  return 'bg-red-500';
}

export function getScoreHex(score: number): string {
  if (score >= 9) return '#22c55e';
  if (score >= 7) return '#84cc16';
  if (score >= 5) return '#f59e0b';
  if (score >= 3) return '#f97316';
  return '#ef4444';
}

export function getScoreGrade(score: number): string {
  if (score >= 9) return 'A';
  if (score >= 7) return 'B';
  if (score >= 5) return 'C';
  if (score >= 3) return 'D';
  return 'F';
}

export function getSeverityColor(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200';
    case 'major': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'minor': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'suggestion': return 'text-blue-600 bg-blue-50 border-blue-200';
  }
}

export function getSeverityDot(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'major': return 'bg-orange-500';
    case 'minor': return 'bg-amber-500';
    case 'suggestion': return 'bg-blue-500';
  }
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export function truncateUrl(url: string, maxLength = 40): string {
  try {
    const parsed = new URL(url);
    const display = parsed.hostname + parsed.pathname;
    return display.length > maxLength ? display.substring(0, maxLength) + '…' : display;
  } catch {
    return url.length > maxLength ? url.substring(0, maxLength) + '…' : url;
  }
}
