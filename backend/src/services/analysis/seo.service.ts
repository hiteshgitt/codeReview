import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

export async function analyzeSEO(url: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};

  try {
    let response;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WebAuditPro/1.0; +https://webauditpro.io)',
          },
          maxRedirects: 5,
        });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, 2000));
        logger.warn(`SEO fetch retry ${attempt}/3`, { url, error: (err as Error).message });
      }
    }
    if (!response) throw new Error('No response after retries');

    const $ = cheerio.load(response.data as string);

    // Title analysis
    const title = $('title').first().text().trim();
    metrics.title = title || null;
    metrics.titleLength = title.length;

    if (!title) {
      issues.push(makeIssue('seo', 'critical', 'Missing title tag',
        'The page has no <title> element.',
        'Add a unique, descriptive title tag with 50–60 characters.',
        'Title tags are the most important on-page SEO factor and appear in search results.'));
    } else if (title.length < 10) {
      issues.push(makeIssue('seo', 'major', 'Title tag too short',
        `Current title: "${title}" (${title.length} characters).`,
        'Expand the title to clearly describe the page (50–60 characters recommended).',
        'Very short titles miss ranking opportunities and are less compelling in search results.'));
    } else if (title.length > 60) {
      issues.push(makeIssue('seo', 'minor', 'Title tag too long',
        `Current title is ${title.length} characters (recommended: 50–60).`,
        'Shorten the title to prevent truncation in search results.',
        'Long titles are cut off in search result listings.'));
    }

    // Meta description
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() ?? '';
    metrics.metaDescription = metaDesc || null;
    metrics.metaDescriptionLength = metaDesc.length;

    if (!metaDesc) {
      issues.push(makeIssue('seo', 'major', 'Missing meta description',
        'No meta description found on the page.',
        'Add a compelling meta description of 150–160 characters.',
        'Meta descriptions appear in search results and significantly affect click-through rates.'));
    } else if (metaDesc.length < 70) {
      issues.push(makeIssue('seo', 'minor', 'Meta description too short',
        `Current description is ${metaDesc.length} characters.`,
        'Expand the meta description to 150–160 characters.',
        'Short descriptions miss the opportunity to describe the page and entice clicks.'));
    } else if (metaDesc.length > 160) {
      issues.push(makeIssue('seo', 'minor', 'Meta description too long',
        `Current description is ${metaDesc.length} characters (recommended: 150–160).`,
        'Trim the description to prevent truncation in search results.',
        'Descriptions over 160 characters are cut off in search listings.'));
    }

    // H1 analysis
    const h1Tags = $('h1');
    metrics.h1Count = h1Tags.length;

    if (h1Tags.length === 0) {
      issues.push(makeIssue('seo', 'major', 'Missing H1 heading',
        'The page has no <h1> element.',
        'Add exactly one H1 tag with the primary keyword for the page.',
        'H1 tags signal the main topic of the page to search engines.'));
    } else if (h1Tags.length > 1) {
      issues.push(makeIssue('seo', 'minor', 'Multiple H1 headings',
        `Found ${h1Tags.length} H1 tags. Best practice is one per page.`,
        'Consolidate to a single H1 tag representing the main page topic.',
        'Multiple H1 tags can dilute SEO signals and confuse crawlers.'));
    }

    // Image alt text
    const images = $('img');
    const imagesWithoutAlt: string[] = [];
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt === undefined || alt === '') {
        const src = $(el).attr('src') || 'unknown';
        imagesWithoutAlt.push(src);
      }
    });
    metrics.totalImages = images.length;
    metrics.imagesWithoutAlt = imagesWithoutAlt.length;

    if (imagesWithoutAlt.length > 0) {
      issues.push(makeIssue('seo', 'major',
        `${imagesWithoutAlt.length} image(s) missing alt text`,
        `Images without alt: ${imagesWithoutAlt.slice(0, 3).join(', ')}${imagesWithoutAlt.length > 3 ? '...' : ''}`,
        'Add descriptive alt attributes to all informative images.',
        'Alt text helps search engines understand images and improves accessibility.'));
    }

    // Open Graph tags
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    metrics.hasOgTags = !!(ogTitle && ogDesc && ogImage);

    if (!ogTitle || !ogDesc || !ogImage) {
      const missing = [
        !ogTitle && 'og:title',
        !ogDesc && 'og:description',
        !ogImage && 'og:image',
      ].filter(Boolean).join(', ');
      issues.push(makeIssue('seo', 'minor', 'Incomplete Open Graph tags',
        `Missing Open Graph properties: ${missing}`,
        'Add complete Open Graph meta tags to control how your page appears when shared on social media.',
        'Missing OG tags result in poor social media preview cards.'));
    }

    // Canonical URL
    const canonical = $('link[rel="canonical"]').attr('href');
    metrics.canonicalUrl = canonical || null;

    if (!canonical) {
      issues.push(makeIssue('seo', 'minor', 'Missing canonical URL',
        'No <link rel="canonical"> tag found.',
        'Add a canonical tag to specify the preferred URL for this content.',
        'Without canonical tags, search engines may index duplicate versions of your content.'));
    }

    // Heading hierarchy
    const headings = { h1: $('h1').length, h2: $('h2').length, h3: $('h3').length };
    metrics.headingStructure = JSON.stringify(headings);

    if (headings.h1 > 0 && headings.h2 === 0 && $('p,li').length > 5) {
      issues.push(makeIssue('seo', 'suggestion', 'No H2 headings found',
        'The page has an H1 but no H2 subheadings.',
        'Structure your content with H2 and H3 headings for better hierarchy.',
        'Proper heading hierarchy helps search engines understand content structure.'));
    }

    // Schema markup
    const schemaScripts = $('script[type="application/ld+json"]');
    metrics.hasStructuredData = schemaScripts.length > 0;

    if (schemaScripts.length === 0) {
      issues.push(makeIssue('seo', 'suggestion', 'No structured data (Schema.org)',
        'No JSON-LD structured data found on the page.',
        'Add relevant Schema.org markup (e.g., Organization, Product, Article) to enable rich search results.',
        'Structured data can unlock rich snippets, increasing visibility and click-through rates.'));
    }

    // Twitter Card
    const twitterCard = $('meta[name="twitter:card"]').attr('content');
    metrics.hasTwitterCard = !!twitterCard;

    if (!twitterCard) {
      issues.push(makeIssue('seo', 'suggestion', 'Missing Twitter Card tags',
        'No Twitter Card meta tags found.',
        'Add twitter:card, twitter:title, twitter:description, and twitter:image tags.',
        'Twitter Card tags control how your content appears when shared on Twitter/X.'));
    }

    // Robots meta
    const robotsMeta = $('meta[name="robots"]').attr('content');
    if (robotsMeta && (robotsMeta.includes('noindex') || robotsMeta.includes('nofollow'))) {
      issues.push(makeIssue('seo', 'critical', 'Page is blocked from indexing',
        `Robots meta tag: "${robotsMeta}"`,
        'Remove noindex/nofollow from the robots meta tag if you want this page indexed.',
        'A noindex page will not appear in search results.'));
    }

    // Internal links
    const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
    const externalLinks = $('a[href^="http"]').not(`a[href^="${url}"]`).length;
    metrics.internalLinks = internalLinks;
    metrics.externalLinks = externalLinks;

    // Calculate SEO score based on issues
    const score = calculateSEOScore(issues);

    return { score, issues, metrics };
  } catch (error) {
    logger.error('SEO analysis failed', { error, url });
    return {
      score: 0,
      issues: [makeIssue('seo', 'critical', 'Page unreachable',
        `Could not fetch the page: ${(error as Error).message}`,
        'Ensure the URL is publicly accessible and returns a 200 status code.',
        'An unreachable page cannot be indexed by search engines.')],
      metrics: { error: (error as Error).message },
    };
  }
}

function calculateSEOScore(issues: AuditIssue[]): number {
  let deductions = 0;
  for (const issue of issues) {
    if (issue.severity === 'critical') deductions += 2.5;
    else if (issue.severity === 'major') deductions += 1.0;
    else if (issue.severity === 'minor') deductions += 0.3;
    else deductions += 0.1;
  }
  return Math.max(0, Math.round((10 - deductions) * 10) / 10);
}

function makeIssue(
  category: AuditIssue['category'],
  severity: AuditIssue['severity'],
  title: string,
  description: string,
  recommendation: string,
  impact: string,
): AuditIssue {
  return { id: uuidv4(), category, severity, title, description, recommendation, impact };
}
