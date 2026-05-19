import puppeteer, { Browser } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

const VIEWPORTS = [
  { width: 320,  height: 568,  label: '320px (Mobile S)' },
  { width: 375,  height: 667,  label: '375px (Mobile)' },
  { width: 768,  height: 1024, label: '768px (Tablet)' },
  { width: 1024, height: 768,  label: '1024px (Laptop)' },
  { width: 1440, height: 900,  label: '1440px (Desktop)' },
  { width: 1920, height: 1080, label: '1920px (Wide)' },
];

interface ViewportResult {
  label: string;
  width: number;
  hasHorizontalOverflow: boolean;
  overflowingElements: string[];
  smallTextCount: number;
  smallTouchTargets: number;
  imagesOverflowing: number;
}

interface PageMeta {
  viewportMeta: string;
  hasMediaQueries: boolean;
}

export async function analyzeResponsiveness(url: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
      ],
    });

    const viewportResults: ViewportResult[] = [];
    let pageMeta: PageMeta | null = null;

    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

        // Collect page-level meta once (first viewport)
        if (!pageMeta) {
          pageMeta = await page.evaluate((): PageMeta => {
            const vm = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '';
            const styles = Array.from(document.querySelectorAll('style'))
              .map(s => s.textContent || '')
              .join('');
            const sheets = (() => {
              try {
                return Array.from(document.styleSheets)
                  .map(s => {
                    try { return Array.from(s.cssRules).map(r => r.cssText).join(' '); }
                    catch { return ''; }
                  })
                  .join('');
              } catch { return ''; }
            })();
            const hasMQ = /@media\s/i.test(styles) || /@media\s/i.test(sheets);
            return { viewportMeta: vm, hasMediaQueries: hasMQ };
          });
        }

        const result = await page.evaluate((vpWidth): Omit<ViewportResult, 'label' | 'width'> => {
          const isMobile = vpWidth < 768;

          // Horizontal overflow
          const hasHorizontalOverflow =
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;

          // Find elements causing overflow
          const overflowingElements: string[] = [];
          if (hasHorizontalOverflow) {
            document.querySelectorAll('body *').forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.right > vpWidth + 5) {
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const cls = el.className && typeof el.className === 'string'
                  ? `.${el.className.trim().split(/\s+/)[0]}`
                  : '';
                const label = `<${tag}${id}${cls}>`;
                if (!overflowingElements.includes(label)) {
                  overflowingElements.push(label);
                }
              }
            });
          }

          // Small text (only flag on mobile viewports)
          let smallTextCount = 0;
          if (isMobile) {
            document.querySelectorAll('p, span, a, li, td, div').forEach(el => {
              if ((el.children.length === 0 || el.tagName === 'A') && (el.textContent?.trim().length ?? 0) > 3) {
                const fs = parseFloat(window.getComputedStyle(el).fontSize);
                if (fs > 0 && fs < 11) smallTextCount++;
              }
            });
          }

          // Small touch targets (only flag on mobile viewports)
          let smallTouchTargets = 0;
          if (isMobile) {
            document.querySelectorAll('a, button, [role="button"], input, select, textarea').forEach(el => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
                smallTouchTargets++;
              }
            });
          }

          // Images overflowing container
          let imagesOverflowing = 0;
          document.querySelectorAll('img').forEach(img => {
            const rect = img.getBoundingClientRect();
            if (rect.width > vpWidth + 5) imagesOverflowing++;
          });

          return {
            hasHorizontalOverflow,
            overflowingElements: overflowingElements.slice(0, 5),
            smallTextCount,
            smallTouchTargets,
            imagesOverflowing,
          };
        }, vp.width);

        viewportResults.push({ label: vp.label, width: vp.width, ...result });
      } catch (err) {
        logger.warn('Viewport test failed', { viewport: vp.label, err });
        viewportResults.push({
          label: vp.label,
          width: vp.width,
          hasHorizontalOverflow: false,
          overflowingElements: [],
          smallTextCount: 0,
          smallTouchTargets: 0,
          imagesOverflowing: 0,
        });
      } finally {
        await page.close();
      }
    }

    // ── Analyse results ──────────────────────────────────────────────────────

    // Viewport meta
    const viewportMeta = pageMeta?.viewportMeta ?? '';
    metrics.viewportMeta = viewportMeta || null;
    metrics.hasMediaQueries = pageMeta?.hasMediaQueries ?? false;
    metrics.viewportsTested = VIEWPORTS.length;

    if (!viewportMeta) {
      issues.push(makeIssue('critical', 'Missing viewport meta tag',
        'No <meta name="viewport"> tag found.',
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
        'Without this tag, mobile browsers render the page at desktop width making it unreadable on phones.'));
    } else if (!viewportMeta.includes('width=device-width')) {
      issues.push(makeIssue('major', 'Viewport meta tag not using device-width',
        `Current viewport: "${viewportMeta}"`,
        'Set viewport to "width=device-width, initial-scale=1".',
        'The layout will not adapt to mobile screen widths.'));
    }

    if (viewportMeta.includes('user-scalable=no') || viewportMeta.includes('maximum-scale=1')) {
      issues.push(makeIssue('major', 'Viewport disables user zoom',
        'The viewport meta tag prevents users from zooming.',
        'Remove user-scalable=no and maximum-scale=1.',
        'Blocking zoom breaks accessibility for users with visual impairments.'));
    }

    if (!pageMeta?.hasMediaQueries) {
      issues.push(makeIssue('major', 'No CSS media queries detected',
        'No responsive breakpoints found in any stylesheet.',
        'Add @media queries for mobile, tablet and desktop breakpoints.',
        'Without media queries the layout will not adapt to different screen sizes.'));
    }

    // Horizontal overflow issues per viewport
    const overflowViewports = viewportResults.filter(r => r.hasHorizontalOverflow);
    metrics.viewportsWithOverflow = overflowViewports.length;

    if (overflowViewports.length > 0) {
      const breakpoints = overflowViewports.map(r => r.label).join(', ');
      const allOffenders = [...new Set(overflowViewports.flatMap(r => r.overflowingElements))].slice(0, 6);

      const severity = overflowViewports.some(r => r.width <= 768) ? 'critical' : 'major';
      issues.push(makeIssue(severity,
        `Horizontal overflow at ${overflowViewports.length} breakpoint(s)`,
        `Horizontal scrollbar appears at: ${breakpoints}.${allOffenders.length ? ` Likely culprits: ${allOffenders.join(', ')}` : ''}`,
        'Use max-width: 100%, overflow-x: hidden on containers, or switch fixed widths to fluid units (%, vw, rem).',
        'Horizontal scrolling is a critical UX failure on mobile devices.'));
    }

    // Per-viewport overflow detail for mobile
    for (const r of viewportResults.filter(r => r.hasHorizontalOverflow && r.width <= 768)) {
      if (r.overflowingElements.length > 0) {
        issues.push(makeIssue('major',
          `Overflow elements at ${r.label}`,
          `Elements extending beyond the viewport: ${r.overflowingElements.join(', ')}`,
          'Inspect each element and replace any fixed widths with responsive units.',
          `These elements break the layout at ${r.label}.`));
      }
    }

    // Small text on mobile
    const smallTextViewports = viewportResults.filter(r => r.smallTextCount > 3);
    if (smallTextViewports.length > 0) {
      const worst = smallTextViewports.sort((a, b) => b.smallTextCount - a.smallTextCount)[0];
      issues.push(makeIssue('minor', 'Text too small on mobile',
        `${worst.smallTextCount} text elements have a font-size below 11px at ${worst.label}.`,
        'Set a minimum font-size of 14-16px for body text; use rem units so text scales with user preferences.',
        'Text smaller than 12px is unreadable on mobile without zooming.'));
    }

    // Small touch targets on mobile
    const touchViewports = viewportResults.filter(r => r.smallTouchTargets > 3);
    if (touchViewports.length > 0) {
      const worst = touchViewports.sort((a, b) => b.smallTouchTargets - a.smallTouchTargets)[0];
      issues.push(makeIssue('minor', 'Touch targets too small on mobile',
        `${worst.smallTouchTargets} interactive elements are smaller than 44×44px at ${worst.label}.`,
        'Ensure all buttons, links, and form controls are at least 44×44px (WCAG 2.5.5).',
        'Small tap targets cause mis-taps and frustrate mobile users.'));
    }

    // Images overflowing
    const imgOverflow = viewportResults.filter(r => r.imagesOverflowing > 0);
    if (imgOverflow.length > 0) {
      issues.push(makeIssue('minor', 'Images overflowing viewport',
        `Images wider than the viewport at: ${imgOverflow.map(r => r.label).join(', ')}.`,
        'Add img { max-width: 100%; height: auto; } to your global CSS.',
        'Oversized images break layouts and cause horizontal scrolling on mobile.'));
    }

    metrics.overflowBreakpoints = overflowViewports.map(r => r.width).join(',') || null;

    const score = calculateScore(issues, metrics);
    return { score, issues, metrics };

  } catch (error) {
    logger.error('Responsiveness analysis failed', { error, url });
    return {
      score: 0,
      issues: [makeIssue('critical', 'Responsiveness analysis failed',
        `Could not load the page for browser testing: ${(error as Error).message}`,
        'Ensure the URL is publicly accessible.',
        'Unable to check responsive design.')],
      metrics: {},
    };
  } finally {
    if (browser) await browser.close();
  }
}

function calculateScore(
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): number {
  let score = 10;

  const overflowCount = typeof metrics.viewportsWithOverflow === 'number'
    ? metrics.viewportsWithOverflow : 0;

  if (!metrics.viewportMeta) score -= 2.5;
  if (!metrics.hasMediaQueries) score -= 1.5;
  score -= Math.min(overflowCount * 1.0, 4.0);

  for (const issue of issues) {
    if (issue.title.includes('overflow') || issue.title.includes('Overflow')) continue;
    if (issue.severity === 'major') score -= 0.5;
    else if (issue.severity === 'minor') score -= 0.2;
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
