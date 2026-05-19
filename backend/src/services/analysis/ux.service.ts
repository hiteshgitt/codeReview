import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

export async function analyzeUX(url: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};

  try {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await axios.get(url, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebAuditPro/1.0)' },
        });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 2000));
        logger.warn(`UX fetch retry ${attempt}/3`, { url, error: (err as Error).message });
      }
    }
    if (!response) throw new Error('No response after retries');

    const $ = cheerio.load(response.data as string);

    // Navigation structure
    const navElements = $('nav, [role="navigation"]').length;
    metrics.hasNavigation = navElements > 0;

    if (navElements === 0) {
      issues.push(makeIssue('major', 'No navigation landmark found',
        'No <nav> element or role="navigation" detected.',
        'Wrap your main navigation in a <nav> element.',
        'Without navigation landmarks, users and screen readers cannot easily find the site navigation.'));
    }

    // Main content landmark
    const mainElements = $('main, [role="main"]').length;
    metrics.hasMainLandmark = mainElements > 0;

    if (mainElements === 0) {
      issues.push(makeIssue('minor', 'No main content landmark',
        'No <main> element or role="main" found.',
        'Wrap the primary page content in a <main> element.',
        'The main landmark helps users skip to primary content.'));
    }

    // Footer
    const footerElements = $('footer, [role="contentinfo"]').length;
    metrics.hasFooter = footerElements > 0;

    if (footerElements === 0) {
      issues.push(makeIssue('suggestion', 'No footer element',
        'No <footer> element found.',
        'Add a <footer> with contact info, privacy policy, and other utility links.',
        'Footers provide important secondary navigation and trust signals.'));
    }

    // Skip to content link
    const skipLink = $('a[href^="#"]').filter((_, el) =>
      /skip|main content/i.test($(el).text()),
    ).length;
    metrics.hasSkipLink = skipLink > 0;

    if (skipLink === 0) {
      issues.push(makeIssue('minor', 'No "skip to content" link',
        'No skip navigation link found.',
        'Add a "Skip to main content" link as the first focusable element on the page.',
        'Without a skip link, keyboard users must tab through all navigation on every page.'));
    }

    // Form usability
    const forms = $('form');
    metrics.formCount = forms.length;

    forms.each((_, form) => {
      const submitBtn = $(form).find('button[type="submit"], input[type="submit"]');
      if (submitBtn.length === 0) {
        issues.push(makeIssue('major', 'Form missing submit button',
          'A form element has no submit button.',
          'Add a clearly visible submit button to every form.',
          'Forms without submit buttons cannot be submitted by keyboard-only users.'));
      }

      const requiredFields = $(form).find('[required]');
      const labelledRequired = requiredFields.filter((_, el) => {
        const id = $(el).attr('id');
        return id ? $(`label[for="${id}"]`).length > 0 : false;
      });

      if (requiredFields.length > 0 && requiredFields.length !== labelledRequired.length) {
        issues.push(makeIssue('minor', 'Required form fields may lack visual indicators',
          'Some required fields may not be visually marked as required.',
          'Mark required fields with an asterisk (*) and explain what the marker means.',
          'Users need clear visual indication of which form fields are mandatory.'));
      }
    });

    // Error pages & 404 handling (just check if there's helpful content)
    const pageText = $('body').text().toLowerCase();
    const is404Page = /404|not found|page doesn't exist/i.test(pageText);
    if (is404Page) {
      const hasNavigationOnError = $('nav a, a[href="/"]').length > 0;
      if (!hasNavigationOnError) {
        issues.push(makeIssue('major', '404 page lacks navigation',
          'This appears to be an error page without links back to the site.',
          'Add navigation, search, and suggestions to error pages.',
          'Dead-end error pages cause users to leave the site.'));
      }
    }

    // Loading indicators / async content
    const hasLoadingSpinner = $('[class*="spinner"], [class*="loading"], [class*="skeleton"]').length > 0;
    metrics.hasLoadingIndicators = hasLoadingSpinner;

    // Breadcrumbs
    const hasBreadcrumbs = $('[aria-label*="breadcrumb"], [class*="breadcrumb"], nav ol, nav ul li + li').length > 0;
    metrics.hasBreadcrumbs = hasBreadcrumbs;

    // Font size check (heuristic)
    const smallTextElements: string[] = [];
    $('[style*="font-size"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = style.match(/font-size\s*:\s*(\d+)px/i);
      if (match && parseInt(match[1], 10) < 12) {
        smallTextElements.push(el.tagName);
      }
    });
    metrics.smallTextElements = smallTextElements.length;

    if (smallTextElements.length > 0) {
      issues.push(makeIssue('minor', 'Text smaller than 12px detected',
        `${smallTextElements.length} element(s) use font size below 12px.`,
        'Use a minimum font size of 16px for body text and 12px for secondary text.',
        'Small text is hard to read, especially on mobile devices.'));
    }

    // Check for search functionality
    const hasSearch = $('input[type="search"], [role="search"], input[name*="search"], input[placeholder*="search" i]').length > 0;
    metrics.hasSearch = hasSearch;

    // Back to top button (for long pages)
    const bodyContentLength = $('body').text().length;
    if (bodyContentLength > 5000 && !$('[class*="back-to-top"], [class*="scroll-top"], a[href="#top"]').length) {
      issues.push(makeIssue('suggestion', 'No back-to-top button on long page',
        'This page has substantial content but no back-to-top functionality.',
        'Add a back-to-top button for pages with significant scroll depth.',
        'Back-to-top buttons improve navigation on long pages.'));
    }

    // Favicon
    const hasFavicon = $('link[rel*="icon"]').length > 0 || $('link[rel="shortcut icon"]').length > 0;
    metrics.hasFavicon = hasFavicon;

    if (!hasFavicon) {
      issues.push(makeIssue('minor', 'No favicon',
        'No favicon link tag found in the <head>.',
        'Add a favicon to improve brand recognition in browser tabs and bookmarks.',
        'Missing favicons make a site look unfinished and harder to identify.'));
    }

    const score = calculateUXScore(issues, metrics);
    return { score, issues, metrics };
  } catch (error) {
    logger.error('UX analysis failed', { error, url });
    return {
      score: 0,
      issues: [makeIssue('critical', 'UX analysis failed',
        `Could not complete UX analysis: ${(error as Error).message}`,
        'Ensure the URL is publicly accessible.',
        'Unable to evaluate UX/UI characteristics.')],
      metrics: {},
    };
  }
}

function calculateUXScore(
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): number {
  let score = 10;

  if (!metrics.hasNavigation) score -= 1.5;
  if (!metrics.hasMainLandmark) score -= 0.5;
  if (!metrics.hasFavicon) score -= 0.3;

  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 2;
    else if (issue.severity === 'major') score -= 0.8;
    else if (issue.severity === 'minor') score -= 0.3;
    else score -= 0.1;
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
  return { id: uuidv4(), category: 'ux-ui', severity, title, description, recommendation, impact };
}
