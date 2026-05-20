import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

const FETCH_TIMEOUT_MS = 20_000;

interface HtmlAnalysis {
  viewportMeta: string;
  hasMediaQueries: boolean;
  hasFlexOrGrid: boolean;
  hasResponsiveFramework: string | null;
  fixedWidthCount: number;
  imagesMissingMaxWidth: boolean;
  hasViewportUnits: boolean;
  hasTableLayout: boolean;
  disablesUserZoom: boolean;
  inlineStyleCount: number;
  cssText: string;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebAuditBot/1.0)' },
    });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractCss(html: string): string {
  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
  const inlineStyles = [...html.matchAll(/style="([^"]+)"/gi)].map(m => m[1]);
  return [...styleBlocks, ...inlineStyles].join('\n');
}

function analyzeHtml(html: string): HtmlAnalysis {
  const lower = html.toLowerCase();
  const cssText = extractCss(html);

  // Viewport meta
  const vmMatch = html.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']viewport["']/i);
  const viewportMeta = vmMatch?.[1] ?? '';

  // Media queries
  const hasMediaQueries = /@media\s/i.test(cssText) || /@media\s/i.test(html);

  // Flex / grid
  const hasFlexOrGrid = /display\s*:\s*(flex|grid)/i.test(cssText);

  // Responsive framework detection
  let hasResponsiveFramework: string | null = null;
  if (/bootstrap/i.test(html) || /class="[^"]*col-[a-z]{2}-\d/.test(html) || /class="[^"]*container(-fluid)?["\s]/.test(html)) {
    hasResponsiveFramework = 'Bootstrap';
  } else if (/tailwind/i.test(html) || /class="[^"]*(?:sm:|md:|lg:|xl:)[^"]*"/.test(html)) {
    hasResponsiveFramework = 'Tailwind CSS';
  } else if (/foundation/i.test(html) && /class="[^"]*(?:small|medium|large)-\d/.test(html)) {
    hasResponsiveFramework = 'Foundation';
  } else if (/bulma/i.test(html) || /class="[^"]*(?:is-mobile|is-tablet|is-desktop)["\s]/.test(html)) {
    hasResponsiveFramework = 'Bulma';
  }

  // Fixed widths in CSS (e.g. width: 960px outside media queries — rough check)
  const fixedWidthMatches = cssText.match(/width\s*:\s*\d{3,4}px/gi) ?? [];
  const fixedWidthCount = fixedWidthMatches.length;

  // Images missing max-width
  const imgCss = cssText + lower;
  const imagesMissingMaxWidth = !/img[^{]*{[^}]*max-width\s*:\s*100%/i.test(cssText)
    && !/img[^{]*{[^}]*width\s*:\s*100%/i.test(cssText);

  // Viewport/fluid units
  const hasViewportUnits = /\d+(?:vw|vh|vmin|vmax|%|rem|em)\b/i.test(cssText);

  // Table layout (layout tables, not data tables)
  const tableCount = (html.match(/<table/gi) ?? []).length;
  const hasTableLayout = tableCount > 3;

  // User zoom disabled
  const disablesUserZoom = /user-scalable\s*=\s*no/i.test(viewportMeta)
    || /maximum-scale\s*=\s*1(?:[^.]|$)/i.test(viewportMeta);

  // Inline style abuse
  const inlineStyleCount = (html.match(/style="/gi) ?? []).length;

  return {
    viewportMeta,
    hasMediaQueries,
    hasFlexOrGrid,
    hasResponsiveFramework,
    fixedWidthCount,
    imagesMissingMaxWidth,
    hasViewportUnits,
    hasTableLayout,
    disablesUserZoom,
    inlineStyleCount,
    cssText,
  };
}

export async function analyzeResponsiveness(url: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};

  try {
    const html = await fetchHtml(url);
    const a = analyzeHtml(html);

    metrics.viewportMeta = a.viewportMeta || null;
    metrics.hasMediaQueries = a.hasMediaQueries;
    metrics.hasFlexOrGrid = a.hasFlexOrGrid;
    metrics.responsiveFramework = a.hasResponsiveFramework;
    metrics.fixedWidthCount = a.fixedWidthCount;

    // ── Viewport meta ───────────────────────────────────────────────────────
    if (!a.viewportMeta) {
      issues.push(makeIssue('critical', 'Missing viewport meta tag',
        'No <meta name="viewport"> tag found in the page head.',
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
        'Without this tag, mobile browsers render the page at desktop width, making it unreadable on phones.'));
    } else if (!a.viewportMeta.includes('width=device-width')) {
      issues.push(makeIssue('major', 'Viewport meta not using device-width',
        `Current viewport content: "${a.viewportMeta}"`,
        'Set viewport to content="width=device-width, initial-scale=1".',
        'The layout will not adapt to mobile screen widths.'));
    }

    if (a.disablesUserZoom) {
      issues.push(makeIssue('major', 'Viewport disables user zoom',
        'The viewport meta tag contains user-scalable=no or maximum-scale=1.',
        'Remove user-scalable=no and maximum-scale=1 from the viewport tag.',
        'Blocking zoom breaks accessibility for users with visual impairments.'));
    }

    // ── Media queries ───────────────────────────────────────────────────────
    if (!a.hasMediaQueries) {
      issues.push(makeIssue('major', 'No CSS media queries detected',
        'No @media rules found in any inline stylesheet.',
        'Add @media queries for mobile (<768px), tablet (<1024px), and desktop breakpoints.',
        'Without media queries the layout will not adapt to different screen sizes.'));
    }

    // ── Fixed widths ────────────────────────────────────────────────────────
    if (a.fixedWidthCount > 5) {
      issues.push(makeIssue('minor', 'Many fixed pixel widths in CSS',
        `Found ${a.fixedWidthCount} instances of fixed pixel widths (e.g. width: 960px).`,
        'Replace fixed widths with fluid units: %, vw, max-width, or CSS Grid/Flexbox.',
        'Fixed widths cause content to overflow or be cut off on smaller screens.'));
    }

    // ── Images ──────────────────────────────────────────────────────────────
    if (a.imagesMissingMaxWidth) {
      issues.push(makeIssue('minor', 'Images may overflow their containers',
        'No global img { max-width: 100% } rule detected in inline styles.',
        'Add img { max-width: 100%; height: auto; } to your global CSS.',
        'Without this, images can overflow their containers and break mobile layouts.'));
    }

    // ── Table layout ────────────────────────────────────────────────────────
    if (a.hasTableLayout) {
      issues.push(makeIssue('minor', 'Table-based layout detected',
        `Found ${(html.match(/<table/gi) ?? []).length} table elements — may indicate table-based layout.`,
        'Replace table layouts with CSS Flexbox or Grid for responsive behaviour.',
        'Table layouts do not reflow on mobile and cause horizontal scrolling.'));
    }

    // ── Positive signals summary ────────────────────────────────────────────
    metrics.responsiveSignals = [
      a.hasMediaQueries && 'media-queries',
      a.hasFlexOrGrid && 'flex/grid',
      a.hasResponsiveFramework && a.hasResponsiveFramework,
      a.hasViewportUnits && 'fluid-units',
    ].filter(Boolean).join(', ') || 'none';

    const score = calculateScore(issues, a);
    return { score, issues, metrics };

  } catch (error) {
    logger.error('Responsiveness analysis failed', { error, url });
    return {
      score: 0,
      issues: [makeIssue('critical', 'Responsiveness analysis failed',
        `Could not fetch page for analysis: ${(error as Error).message}`,
        'Ensure the URL is publicly accessible.',
        'Unable to check responsive design.')],
      metrics: {},
    };
  }
}

function calculateScore(issues: AuditIssue[], a: HtmlAnalysis): number {
  let score = 10;

  // Positive boosts
  if (a.hasResponsiveFramework) score = Math.min(score + 0.5, 10);
  if (a.hasFlexOrGrid) score = Math.min(score + 0.3, 10);
  if (a.hasViewportUnits) score = Math.min(score + 0.2, 10);

  // Deductions by issue severity
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 3;
    else if (issue.severity === 'major') score -= 1.5;
    else if (issue.severity === 'minor') score -= 0.5;
  }

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function makeIssue(
  severity: AuditIssue['severity'],
  title: string,
  description: string,
  recommendation: string,
  impact: string,
): AuditIssue {
  return { id: uuidv4(), category: 'responsiveness', severity, title, description, recommendation, impact };
}
