import puppeteer from 'puppeteer';
import { logger } from '../utils/logger';
import { AuditScores } from '../types';
import { getScoreColor, getScoreGrade } from './analysis/scoring';

interface AuditForReport {
  id: string;
  websiteUrl: string;
  repoUrl?: string | null;
  name?: string | null;
  overallScore: number;
  scores: AuditScores;
  createdAt: Date;
  completedAt?: Date | null;
}

export async function generateAuditPDF(audit: AuditForReport): Promise<Buffer> {
  const html = buildReportHTML(audit);

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });

    return Buffer.from(pdf);
  } catch (error) {
    logger.error('PDF generation failed', { error, auditId: audit.id });
    throw new Error('Failed to generate PDF report');
  } finally {
    if (browser) await browser.close();
  }
}

function buildReportHTML(audit: AuditForReport): string {
  const categories = [
    { key: 'performance', label: 'Performance' },
    { key: 'accessibility', label: 'Accessibility' },
    { key: 'seo', label: 'SEO' },
    { key: 'bestPractices', label: 'Best Practices' },
    { key: 'codeQuality', label: 'Code Quality' },
    { key: 'responsiveness', label: 'Responsiveness' },
    { key: 'uxUi', label: 'UX / UI' },
  ] as const;

  const categoryCards = categories
    .map(({ key, label }) => {
      const cat = audit.scores[key];
      const color = getScoreColor(cat.score);
      return `
        <div class="category-card">
          <div class="cat-score" style="color:${color}">${cat.score.toFixed(1)}</div>
          <div class="cat-label">${label}</div>
          <div class="cat-grade" style="background:${color}">${getScoreGrade(cat.score)}</div>
        </div>`;
    })
    .join('');

  const allIssues = categories.flatMap(({ key, label }) =>
    audit.scores[key].issues.map((issue) => ({ ...issue, categoryLabel: label })),
  );

  const issuesBySeverity = {
    critical: allIssues.filter((i) => i.severity === 'critical'),
    major: allIssues.filter((i) => i.severity === 'major'),
    minor: allIssues.filter((i) => i.severity === 'minor'),
    suggestion: allIssues.filter((i) => i.severity === 'suggestion'),
  };

  const issueRows = (
    Object.entries(issuesBySeverity) as Array<[string, typeof allIssues]>
  )
    .filter(([, items]) => items.length > 0)
    .map(([severity, items]) => {
      const severityColors: Record<string, string> = {
        critical: '#ef4444',
        major: '#f97316',
        minor: '#f59e0b',
        suggestion: '#3b82f6',
      };
      const color = severityColors[severity] || '#6b7280';
      return `
        <h3 style="color:${color};text-transform:capitalize;margin:24px 0 8px">${severity} Issues (${items.length})</h3>
        ${items
          .map(
            (issue) => `
          <div class="issue-card">
            <div class="issue-header">
              <span class="issue-badge" style="background:${color}">${issue.categoryLabel}</span>
              <strong>${issue.title}</strong>
            </div>
            <p>${issue.description}</p>
            <p><strong>Recommendation:</strong> ${issue.recommendation}</p>
            <p><em>Impact: ${issue.impact}</em></p>
          </div>`,
          )
          .join('')}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Web Audit Report — ${audit.name || audit.websiteUrl}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; font-size: 14px; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 40px; }
  .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
  .header p { color: #94a3b8; font-size: 14px; }
  .overall-section { padding: 32px 40px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 32px; }
  .score-circle { width: 120px; height: 120px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 8px solid; }
  .score-value { font-size: 36px; font-weight: 800; }
  .score-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  .overall-meta h2 { font-size: 22px; font-weight: 600; }
  .overall-meta p { color: #64748b; margin-top: 4px; }
  .categories { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 32px 40px; border-bottom: 1px solid #e2e8f0; }
  .category-card { background: #f8fafc; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #e2e8f0; }
  .cat-score { font-size: 28px; font-weight: 700; }
  .cat-label { font-size: 12px; color: #64748b; margin: 4px 0; }
  .cat-grade { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 11px; font-weight: 600; }
  .issues-section { padding: 32px 40px; }
  .issues-section h2 { font-size: 20px; font-weight: 600; margin-bottom: 16px; }
  .issue-card { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #e2e8f0; }
  .issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .issue-badge { padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 600; text-transform: uppercase; }
  .issue-card p { color: #475569; margin-top: 6px; font-size: 13px; }
  .footer { background: #f1f5f9; padding: 24px 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; }
  @media print { .page-break { page-break-before: always; } }
</style>
</head>
<body>
<div class="header">
  <h1>Web Audit Report</h1>
  <p>Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} &bull; ${audit.websiteUrl}</p>
</div>

<div class="overall-section">
  <div class="score-circle" style="border-color:${getScoreColor(audit.overallScore)};color:${getScoreColor(audit.overallScore)}">
    <span class="score-value">${audit.overallScore.toFixed(1)}</span>
    <span class="score-label">/ 10</span>
  </div>
  <div class="overall-meta">
    <h2>${audit.name || audit.websiteUrl}</h2>
    <p>Overall Grade: ${getScoreGrade(audit.overallScore)} &bull; ${allIssues.length} issues found</p>
    ${audit.repoUrl ? `<p>Repository: ${audit.repoUrl}</p>` : ''}
  </div>
</div>

<div class="categories">${categoryCards}</div>

<div class="issues-section">
  <h2>Issues Breakdown</h2>
  ${issueRows || '<p style="color:#64748b">No issues found — great job!</p>'}
</div>

<div class="footer">
  <p>Web Audit Pro &bull; Automated web quality analysis &bull; Report ID: ${audit.id}</p>
</div>
</body>
</html>`;
}
