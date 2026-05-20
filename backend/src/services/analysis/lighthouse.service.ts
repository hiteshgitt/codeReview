import * as chromeLauncher from 'chrome-launcher';
import { logger } from '../../utils/logger';
import { LighthouseData, AuditIssue, CategoryResult } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface LighthouseOptions {
  port: number;
  output: 'json';
  logLevel: 'silent' | 'error' | 'info' | 'verbose';
  onlyCategories?: string[];
  throttlingMethod?: 'simulate' | 'devtools' | 'provided';
}

const LIGHTHOUSE_TIMEOUT_MS = 90_000;

async function runLighthouseAnalysis(url: string): Promise<LighthouseData | null> {
  let chrome: chromeLauncher.LaunchedChrome | null = null;

  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-translate',
        '--disable-sync',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-breakpad',
        '--disable-infobars',
        '--window-size=1280,720',
      ],
    });

    // Dynamic import for ESM lighthouse
    const lighthouse = (await import('lighthouse')).default;

    const options: LighthouseOptions = {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      throttlingMethod: 'simulate',
    };

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Lighthouse timeout')), LIGHTHOUSE_TIMEOUT_MS),
    );
    const result = await Promise.race([
      lighthouse(url, options as Parameters<typeof lighthouse>[1]),
      timeoutPromise,
    ]);

    if (!result?.lhr) return null;

    const lhr = result.lhr;
    const categories = lhr.categories;
    const audits = lhr.audits;

    return {
      performance: (categories.performance?.score ?? 0) * 10,
      accessibility: (categories.accessibility?.score ?? 0) * 10,
      seo: (categories.seo?.score ?? 0) * 10,
      bestPractices: (categories['best-practices']?.score ?? 0) * 10,
      metrics: {
        fcp: audits['first-contentful-paint']?.numericValue,
        lcp: audits['largest-contentful-paint']?.numericValue,
        tbt: audits['total-blocking-time']?.numericValue,
        cls: audits['cumulative-layout-shift']?.numericValue,
        si: audits['speed-index']?.numericValue,
        tti: audits['interactive']?.numericValue,
      },
      audits: Object.fromEntries(
        Object.entries(audits).map(([id, audit]) => [
          id,
          {
            id,
            title: audit.title,
            description: audit.description ?? '',
            score: audit.score,
            scoreDisplayMode: audit.scoreDisplayMode,
            displayValue: audit.displayValue,
          },
        ]),
      ),
    };
  } catch (error) {
    logger.error('Lighthouse analysis failed', { error, url });
    return null;
  } finally {
    if (chrome) {
      try { await Promise.resolve(chrome.kill()); } catch { /* ignore */ }
    }
  }
}

export async function analyzeLighthouse(url: string): Promise<{
  performance: CategoryResult;
  accessibility: CategoryResult;
  seo: CategoryResult;
  bestPractices: CategoryResult;
  lighthouseData: LighthouseData | null;
}> {
  const lhData = await runLighthouseAnalysis(url);

  if (!lhData) {
    return {
      performance: buildFallbackResult('performance'),
      accessibility: buildFallbackResult('accessibility'),
      seo: buildFallbackResult('seo'),
      bestPractices: buildFallbackResult('best-practices'),
      lighthouseData: null,
    };
  }

  return {
    performance: buildPerformanceResult(lhData),
    accessibility: buildAccessibilityResult(lhData),
    seo: buildSeoResult(lhData),
    bestPractices: buildBestPracticesResult(lhData),
    lighthouseData: lhData,
  };
}

function buildPerformanceResult(lhData: LighthouseData): CategoryResult {
  const score = Math.round(lhData.performance * 10) / 10;
  const issues: AuditIssue[] = [];
  const { metrics } = lhData;

  if (metrics.lcp && metrics.lcp > 4000) {
    issues.push({
      id: uuidv4(),
      category: 'performance',
      severity: metrics.lcp > 6000 ? 'critical' : 'major',
      title: 'Largest Contentful Paint (LCP) is slow',
      description: `LCP is ${(metrics.lcp / 1000).toFixed(2)}s. Good LCP should be under 2.5s.`,
      recommendation: 'Optimize images, reduce server response times, and remove render-blocking resources.',
      impact: 'Users experience slow page loading, increasing bounce rate.',
    });
  }

  if (metrics.cls && metrics.cls > 0.1) {
    issues.push({
      id: uuidv4(),
      category: 'performance',
      severity: metrics.cls > 0.25 ? 'critical' : 'major',
      title: 'Cumulative Layout Shift (CLS) is high',
      description: `CLS score is ${metrics.cls.toFixed(3)}. Should be under 0.1.`,
      recommendation: 'Add explicit size attributes to images and videos. Avoid inserting content above existing content.',
      impact: 'Layout shifts cause visual instability and poor user experience.',
    });
  }

  if (metrics.tbt && metrics.tbt > 300) {
    issues.push({
      id: uuidv4(),
      category: 'performance',
      severity: metrics.tbt > 600 ? 'critical' : 'major',
      title: 'Total Blocking Time (TBT) is high',
      description: `TBT is ${metrics.tbt.toFixed(0)}ms. Should be under 300ms.`,
      recommendation: 'Reduce JavaScript execution time. Break up long tasks and use web workers.',
      impact: 'Long tasks block the main thread, making the page feel unresponsive.',
    });
  }

  if (metrics.fcp && metrics.fcp > 1800) {
    issues.push({
      id: uuidv4(),
      category: 'performance',
      severity: 'minor',
      title: 'First Contentful Paint (FCP) needs improvement',
      description: `FCP is ${(metrics.fcp / 1000).toFixed(2)}s. Good FCP should be under 1.8s.`,
      recommendation: 'Eliminate render-blocking resources and reduce server response times.',
      impact: 'Delayed first paint makes users perceive the page as slower.',
    });
  }

  checkLighthouseAuditsForPerformance(lhData.audits, issues);

  return {
    score,
    issues,
    metrics: {
      fcp: metrics.fcp ? `${(metrics.fcp / 1000).toFixed(2)}s` : null,
      lcp: metrics.lcp ? `${(metrics.lcp / 1000).toFixed(2)}s` : null,
      tbt: metrics.tbt ? `${metrics.tbt.toFixed(0)}ms` : null,
      cls: metrics.cls?.toFixed(3) ?? null,
      si: metrics.si ? `${(metrics.si / 1000).toFixed(2)}s` : null,
      tti: metrics.tti ? `${(metrics.tti / 1000).toFixed(2)}s` : null,
    },
  };
}

function checkLighthouseAuditsForPerformance(
  audits: LighthouseData['audits'],
  issues: AuditIssue[],
): void {
  const checks: Array<{ id: string; severity: AuditIssue['severity']; title: string; recommendation: string; impact: string }> = [
    {
      id: 'uses-optimized-images',
      severity: 'major',
      title: 'Images are not properly optimized',
      recommendation: 'Compress and use next-gen formats (WebP, AVIF) for images.',
      impact: 'Unoptimized images increase page size and slow load time.',
    },
    {
      id: 'render-blocking-resources',
      severity: 'major',
      title: 'Render-blocking resources detected',
      recommendation: 'Defer or async-load non-critical CSS and JavaScript.',
      impact: 'Render-blocking resources delay first paint.',
    },
    {
      id: 'unused-javascript',
      severity: 'minor',
      title: 'Unused JavaScript detected',
      recommendation: 'Remove or lazy-load JavaScript that is not used on initial page load.',
      impact: 'Unused JS increases parse and execution time unnecessarily.',
    },
    {
      id: 'uses-text-compression',
      severity: 'major',
      title: 'Text compression not enabled',
      recommendation: 'Enable gzip or Brotli compression on your server.',
      impact: 'Without compression, text assets are significantly larger.',
    },
  ];

  for (const check of checks) {
    const audit = audits[check.id];
    if (audit && audit.score !== null && audit.score < 0.9) {
      issues.push({
        id: uuidv4(),
        category: 'performance',
        severity: audit.score < 0.5 ? check.severity : 'minor',
        title: check.title,
        description: audit.displayValue || audit.title,
        recommendation: check.recommendation,
        impact: check.impact,
      });
    }
  }
}

function buildAccessibilityResult(lhData: LighthouseData): CategoryResult {
  const score = Math.round(lhData.accessibility * 10) / 10;
  const issues: AuditIssue[] = [];

  const accessibilityAuditChecks: Array<{
    id: string;
    severity: AuditIssue['severity'];
    title: string;
    recommendation: string;
    impact: string;
  }> = [
    {
      id: 'image-alt',
      severity: 'critical',
      title: 'Images missing alt text',
      recommendation: 'Add descriptive alt attributes to all informative images.',
      impact: 'Screen reader users cannot perceive image content.',
    },
    {
      id: 'button-name',
      severity: 'critical',
      title: 'Buttons do not have accessible names',
      recommendation: 'Add text content, aria-label, or aria-labelledby to all buttons.',
      impact: 'Screen readers cannot describe button purpose to users.',
    },
    {
      id: 'color-contrast',
      severity: 'major',
      title: 'Insufficient color contrast',
      recommendation: 'Ensure text has a contrast ratio of at least 4.5:1 (WCAG AA).',
      impact: 'Low contrast text is unreadable for users with visual impairments.',
    },
    {
      id: 'document-title',
      severity: 'major',
      title: 'Document does not have a title',
      recommendation: 'Add a descriptive <title> element to the page.',
      impact: 'Page title is announced by screen readers and helps navigation.',
    },
    {
      id: 'html-has-lang',
      severity: 'major',
      title: 'HTML element does not have a lang attribute',
      recommendation: 'Add lang attribute to <html> element (e.g., lang="en").',
      impact: 'Screen readers cannot select the correct language profile.',
    },
    {
      id: 'label',
      severity: 'critical',
      title: 'Form elements missing labels',
      recommendation: 'Associate labels with all form inputs using <label for="..."> or aria-label.',
      impact: 'Users with assistive technologies cannot identify form fields.',
    },
    {
      id: 'link-name',
      severity: 'critical',
      title: 'Links do not have accessible names',
      recommendation: 'Add descriptive text, aria-label, or aria-labelledby to links.',
      impact: 'Screen reader users cannot determine link destination.',
    },
    {
      id: 'meta-viewport',
      severity: 'major',
      title: 'Viewport meta tag disables user scaling',
      recommendation: 'Remove user-scalable=no from viewport meta tag.',
      impact: 'Users with low vision cannot zoom to read content.',
    },
  ];

  for (const check of accessibilityAuditChecks) {
    const audit = lhData.audits[check.id];
    if (audit && audit.score !== null && audit.score < 1) {
      issues.push({
        id: uuidv4(),
        category: 'accessibility',
        severity: check.severity,
        title: check.title,
        description: audit.displayValue || audit.description || check.title,
        recommendation: check.recommendation,
        impact: check.impact,
      });
    }
  }

  return {
    score,
    issues,
    metrics: {
      wcagLevel: score >= 9 ? 'AAA' : score >= 7 ? 'AA' : score >= 5 ? 'A' : 'Non-compliant',
    },
  };
}

function buildSeoResult(lhData: LighthouseData): CategoryResult {
  const score = Math.round(lhData.seo * 10) / 10;
  const issues: AuditIssue[] = [];

  const seoAuditChecks: Array<{
    id: string;
    severity: AuditIssue['severity'];
    title: string;
    recommendation: string;
    impact: string;
  }> = [
    {
      id: 'document-title',
      severity: 'critical',
      title: 'Page missing title tag',
      recommendation: 'Add a unique, descriptive <title> tag (50-60 characters).',
      impact: 'Title tag is the most important on-page SEO factor.',
    },
    {
      id: 'meta-description',
      severity: 'major',
      title: 'Missing meta description',
      recommendation: 'Add a meta description (150-160 characters) summarizing page content.',
      impact: 'Meta descriptions appear in search results and influence click-through rates.',
    },
    {
      id: 'http-status-code',
      severity: 'critical',
      title: 'Page returns non-200 HTTP status',
      recommendation: 'Ensure the page returns a 200 OK status code.',
      impact: 'Search engines may not index pages with non-200 status codes.',
    },
    {
      id: 'link-text',
      severity: 'minor',
      title: 'Links lack descriptive text',
      recommendation: 'Use descriptive anchor text instead of generic text like "click here".',
      impact: 'Descriptive link text helps search engines understand content relationships.',
    },
    {
      id: 'robots-txt',
      severity: 'major',
      title: 'robots.txt file missing or invalid',
      recommendation: 'Create a valid robots.txt file at the site root.',
      impact: 'Without robots.txt, crawlers may index unintended pages.',
    },
    {
      id: 'canonical',
      severity: 'minor',
      title: 'Missing canonical URL',
      recommendation: 'Add a <link rel="canonical"> tag to prevent duplicate content issues.',
      impact: 'Without canonical tags, search engines may index duplicate content.',
    },
  ];

  for (const check of seoAuditChecks) {
    const audit = lhData.audits[check.id];
    if (audit && audit.score !== null && audit.score < 1) {
      issues.push({
        id: uuidv4(),
        category: 'seo',
        severity: check.severity,
        title: check.title,
        description: audit.displayValue || audit.description || check.title,
        recommendation: check.recommendation,
        impact: check.impact,
      });
    }
  }

  return { score, issues, metrics: {} };
}

function buildBestPracticesResult(lhData: LighthouseData): CategoryResult {
  const score = Math.round(lhData.bestPractices * 10) / 10;
  const issues: AuditIssue[] = [];

  const bpAuditChecks: Array<{
    id: string;
    severity: AuditIssue['severity'];
    title: string;
    recommendation: string;
    impact: string;
  }> = [
    {
      id: 'is-on-https',
      severity: 'critical',
      title: 'Site does not use HTTPS',
      recommendation: 'Install an SSL certificate and redirect all HTTP traffic to HTTPS.',
      impact: 'HTTP sites are marked as insecure and are penalized in search rankings.',
    },
    {
      id: 'no-vulnerable-libraries',
      severity: 'critical',
      title: 'Vulnerable JavaScript libraries detected',
      recommendation: 'Update all libraries to their latest secure versions.',
      impact: 'Vulnerable libraries expose users to security attacks.',
    },
    {
      id: 'csp-xss',
      severity: 'major',
      title: 'Missing Content Security Policy',
      recommendation: 'Implement a strong Content-Security-Policy header.',
      impact: 'Without CSP, the site is vulnerable to XSS attacks.',
    },
    {
      id: 'geolocation-on-start',
      severity: 'minor',
      title: 'Page requests geolocation on load',
      recommendation: 'Request geolocation only in response to user interaction.',
      impact: 'Unsolicited permission requests create a poor user experience.',
    },
  ];

  for (const check of bpAuditChecks) {
    const audit = lhData.audits[check.id];
    if (audit && audit.score !== null && audit.score < 1) {
      issues.push({
        id: uuidv4(),
        category: 'best-practices',
        severity: check.severity,
        title: check.title,
        description: audit.displayValue || audit.description || check.title,
        recommendation: check.recommendation,
        impact: check.impact,
      });
    }
  }

  return { score, issues, metrics: {} };
}

function buildFallbackResult(category: string): CategoryResult {
  logger.warn(`Using fallback result for category: ${category} (Lighthouse unavailable)`);
  return {
    score: 0,
    issues: [
      {
        id: uuidv4(),
        category: category as AuditIssue['category'],
        severity: 'suggestion',
        title: 'Analysis unavailable',
        description: 'Lighthouse analysis could not be completed. Chrome may not be installed.',
        recommendation: 'Install Google Chrome and ensure PUPPETEER_EXECUTABLE_PATH is configured.',
        impact: 'Full analysis requires Chrome/Chromium to be installed on the server.',
      },
    ],
    metrics: {},
  };
}
