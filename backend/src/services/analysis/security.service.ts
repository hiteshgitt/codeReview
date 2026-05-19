import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

// Sensitive paths to probe for accidental exposure
const SENSITIVE_PATHS = [
  { path: '/.env',               label: '.env file',                severity: 'critical' as const },
  { path: '/.env.local',         label: '.env.local file',          severity: 'critical' as const },
  { path: '/.git/config',        label: 'Git config',               severity: 'critical' as const },
  { path: '/wp-config.php.bak',  label: 'wp-config.php backup',     severity: 'critical' as const },
  { path: '/backup.sql',         label: 'Database backup',          severity: 'critical' as const },
  { path: '/db.sql',             label: 'Database dump',            severity: 'critical' as const },
  { path: '/phpinfo.php',        label: 'phpinfo() page',           severity: 'major'    as const },
  { path: '/server-status',      label: 'Apache server-status',     severity: 'major'    as const },
  { path: '/admin/config.php',   label: 'Admin config file',        severity: 'major'    as const },
  { path: '/config.php',         label: 'config.php',               severity: 'major'    as const },
];

export async function analyzeSecurityHeaders(url: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebAuditPro-Security/1.0)' },
    });

    const headers = response.headers as Record<string, string>;
    const isHttps = url.startsWith('https://');
    const html = typeof response.data === 'string' ? response.data : '';
    const $ = cheerio.load(html);

    // ── 1. HTTPS ──────────────────────────────────────────────────────────────
    metrics.isHttps = isHttps;
    if (!isHttps) {
      issues.push(makeIssue('critical', 'Site does not use HTTPS',
        'The site is served over HTTP. All data is transmitted in plain text.',
        'Install an SSL/TLS certificate and redirect all HTTP traffic to HTTPS.',
        'HTTP sites expose user data to man-in-the-middle attacks and are flagged as insecure by browsers.'));
    }

    // ── 2. Content-Security-Policy ────────────────────────────────────────────
    const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'] || null;
    metrics.hasCSP = !!csp;
    metrics.csp = csp || null;

    if (!csp) {
      issues.push(makeIssue('critical', 'Missing Content-Security-Policy header',
        'No Content-Security-Policy (CSP) header is set on this page.',
        "Add a CSP header to restrict sources of scripts, styles, and other resources. Start with: Content-Security-Policy: default-src 'self'",
        'Without CSP, the site is vulnerable to Cross-Site Scripting (XSS) attacks that can steal user data.'));
    } else {
      if (csp.includes("'unsafe-inline'")) {
        issues.push(makeIssue('major', "CSP allows 'unsafe-inline' scripts",
          "The Content-Security-Policy contains 'unsafe-inline', which permits inline JavaScript.",
          "Remove 'unsafe-inline' and use nonces or hashes for inline scripts instead.",
          "'unsafe-inline' significantly weakens CSP protection against XSS attacks."));
      }
      if (csp.includes("'unsafe-eval'")) {
        issues.push(makeIssue('major', "CSP allows 'unsafe-eval'",
          "The Content-Security-Policy contains 'unsafe-eval', which permits eval() and similar.",
          "Remove 'unsafe-eval'. Refactor code to avoid dynamic code evaluation.",
          "'unsafe-eval' allows attackers to execute arbitrary code if they can inject strings."));
      }
      if (csp.includes('*')) {
        issues.push(makeIssue('minor', 'CSP contains wildcard (*) directive',
          "A wildcard source (*) in CSP negates the protection for that directive.",
          'Replace wildcard sources with specific trusted domains.',
          'Wildcard sources allow resources to be loaded from any origin.'));
      }
    }

    // ── 3. HTTP Strict-Transport-Security (HSTS) ──────────────────────────────
    const hsts = headers['strict-transport-security'] || null;
    metrics.hasHSTS = !!hsts;
    metrics.hsts = hsts || null;

    if (isHttps && !hsts) {
      issues.push(makeIssue('major', 'Missing Strict-Transport-Security (HSTS) header',
        'The site uses HTTPS but does not set the HSTS header.',
        'Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
        'Without HSTS, users can still be downgraded to HTTP by a man-in-the-middle attacker.'));
    } else if (hsts) {
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]) : 0;
      metrics.hstsMaxAge = maxAge;
      if (maxAge < 31536000) {
        issues.push(makeIssue('minor', 'HSTS max-age is too short',
          `HSTS max-age is ${maxAge} seconds (${Math.round(maxAge / 86400)} days). Recommended minimum is 1 year (31536000 seconds).`,
          'Set max-age to at least 31536000 (1 year).',
          'A short max-age allows browsers to fall back to HTTP sooner than necessary.'));
      }
    }

    // ── 4. X-Frame-Options (Clickjacking) ─────────────────────────────────────
    const xFrameOptions = headers['x-frame-options'] || null;
    const frameAncestors = csp?.includes('frame-ancestors') ?? false;
    metrics.hasXFrameOptions = !!(xFrameOptions || frameAncestors);

    if (!xFrameOptions && !frameAncestors) {
      issues.push(makeIssue('major', 'Missing clickjacking protection',
        'No X-Frame-Options header or CSP frame-ancestors directive found.',
        "Add: X-Frame-Options: DENY (or SAMEORIGIN) or use CSP frame-ancestors 'self'",
        'Without this header, the page can be embedded in an iframe and used for clickjacking attacks.'));
    }

    // ── 5. X-Content-Type-Options ─────────────────────────────────────────────
    const xContentType = headers['x-content-type-options'] || null;
    metrics.hasXContentTypeOptions = xContentType?.toLowerCase() === 'nosniff';

    if (!xContentType || xContentType.toLowerCase() !== 'nosniff') {
      issues.push(makeIssue('minor', 'Missing X-Content-Type-Options: nosniff',
        'The X-Content-Type-Options header is not set to "nosniff".',
        'Add: X-Content-Type-Options: nosniff',
        'Without this header, browsers may MIME-sniff responses and execute malicious files as scripts.'));
    }

    // ── 6. Referrer-Policy ────────────────────────────────────────────────────
    const referrerPolicy = headers['referrer-policy'] || null;
    metrics.hasReferrerPolicy = !!referrerPolicy;

    if (!referrerPolicy) {
      issues.push(makeIssue('minor', 'Missing Referrer-Policy header',
        'No Referrer-Policy header found.',
        'Add: Referrer-Policy: strict-origin-when-cross-origin',
        'Without a referrer policy, the browser may send the full URL as the Referer header, leaking sensitive path information.'));
    }

    // ── 7. Permissions-Policy ─────────────────────────────────────────────────
    const permissionsPolicy = headers['permissions-policy'] || headers['feature-policy'] || null;
    metrics.hasPermissionsPolicy = !!permissionsPolicy;

    if (!permissionsPolicy) {
      issues.push(makeIssue('suggestion', 'Missing Permissions-Policy header',
        'No Permissions-Policy (formerly Feature-Policy) header found.',
        'Add a Permissions-Policy header to restrict access to browser features like camera, microphone, and geolocation.',
        'Without this header, any embedded third-party script can request powerful browser permissions.'));
    }

    // ── 8. Cookie Security ────────────────────────────────────────────────────
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader) {
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
      const insecureCookies = cookies.filter(c => isHttps && !c.toLowerCase().includes('secure'));
      const noHttpOnlyCookies = cookies.filter(c => !c.toLowerCase().includes('httponly'));
      const noSameSiteCookies = cookies.filter(c => !c.toLowerCase().includes('samesite'));

      metrics.cookieCount = cookies.length;

      if (insecureCookies.length > 0) {
        issues.push(makeIssue('major', `${insecureCookies.length} cookie(s) missing Secure flag`,
          'Cookies are set without the Secure flag on an HTTPS site.',
          'Add the Secure flag to all cookies: Set-Cookie: name=value; Secure; HttpOnly; SameSite=Lax',
          'Cookies without Secure can be transmitted over HTTP, exposing session tokens.'));
      }
      if (noHttpOnlyCookies.length > 0) {
        issues.push(makeIssue('major', `${noHttpOnlyCookies.length} cookie(s) missing HttpOnly flag`,
          'Cookies are accessible via JavaScript (missing HttpOnly flag).',
          'Add HttpOnly flag to prevent JavaScript from reading cookies.',
          'Without HttpOnly, XSS attacks can steal session cookies directly.'));
      }
      if (noSameSiteCookies.length > 0) {
        issues.push(makeIssue('minor', `${noSameSiteCookies.length} cookie(s) missing SameSite attribute`,
          'Cookies do not specify a SameSite attribute.',
          'Add SameSite=Lax or SameSite=Strict to all cookies.',
          'Without SameSite, cookies are sent on cross-site requests, enabling CSRF attacks.'));
      }
    }

    // ── 9. Mixed Content ──────────────────────────────────────────────────────
    if (isHttps) {
      const httpResources: string[] = [];
      $('[src]').each((_, el) => {
        const src = $(el).attr('src') || '';
        if (src.startsWith('http://')) httpResources.push(src.substring(0, 60));
      });
      $('link[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.startsWith('http://')) httpResources.push(href.substring(0, 60));
      });

      metrics.mixedContentCount = httpResources.length;
      if (httpResources.length > 0) {
        issues.push(makeIssue('major', `Mixed content: ${httpResources.length} HTTP resource(s) on HTTPS page`,
          `HTTP resources detected on an HTTPS page: ${httpResources.slice(0, 3).join(', ')}${httpResources.length > 3 ? '…' : ''}`,
          'Update all resource URLs to use HTTPS.',
          'Mixed content is blocked by modern browsers and undermines HTTPS security.'));
      }
    }

    // ── 10. Sensitive file exposure ───────────────────────────────────────────
    const baseUrl = new URL(url).origin;
    const exposureChecks = await Promise.allSettled(
      SENSITIVE_PATHS.map(({ path: p }) =>
        axios.get(baseUrl + p, {
          timeout: 5000,
          validateStatus: () => true,
          maxRedirects: 0,
        }).then(r => ({ path: p, status: r.status }))
      )
    );

    for (let i = 0; i < exposureChecks.length; i++) {
      const result = exposureChecks[i];
      const { path: p, label, severity } = SENSITIVE_PATHS[i];
      if (result.status === 'fulfilled' && result.value.status === 200) {
        issues.push(makeIssue(severity, `Sensitive file exposed: ${label}`,
          `The file ${p} is publicly accessible (HTTP 200).`,
          `Immediately block access to ${p} via web server configuration (deny in nginx/Apache) or delete the file.`,
          'Exposed sensitive files can leak credentials, source code, and database access details.'));
      }
    }

    // ── Score calculation ──────────────────────────────────────────────────────
    const score = calculateSecurityScore(issues);
    return { score, issues, metrics };

  } catch (error) {
    logger.error('Security analysis failed', { error, url });
    return {
      score: 0,
      issues: [{
        id: uuidv4(),
        category: 'security',
        severity: 'suggestion',
        title: 'Security header analysis could not be completed',
        description: 'Failed to fetch the page for security header analysis.',
        recommendation: 'Ensure the URL is publicly accessible.',
        impact: 'Security header posture could not be evaluated.',
      }],
      metrics: { error: true },
    };
  }
}

function calculateSecurityScore(issues: AuditIssue[]): number {
  let score = 10;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 2.5;
    else if (issue.severity === 'major') score -= 1.5;
    else if (issue.severity === 'minor') score -= 0.5;
    else score -= 0.2;
  }
  return Math.max(0, Math.round(score * 10) / 10);
}

function makeIssue(
  severity: AuditIssue['severity'],
  title: string,
  description: string,
  recommendation: string,
  impact: string,
): AuditIssue {
  return { id: uuidv4(), category: 'security', severity, title, description, recommendation, impact };
}
