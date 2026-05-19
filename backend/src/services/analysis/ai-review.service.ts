import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AuditIssue } from '../../types';
import { logger } from '../../utils/logger';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.php'];
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'out', 'vendor', '.nuxt', 'coverage'];
const ENTRY_NAMES = new Set(['index', 'app', 'main', 'server', 'router', 'routes']);

const SYSTEM_PROMPT = `You are a senior software engineer performing a code review. You will be given source files from a web project and a list of issues already detected by static analysis tools.

Your job is to find issues that static analysis MISSED — things that require reading and understanding the code:
- Logic bugs and edge cases
- Security vulnerabilities not caught by pattern matching
- Performance bottlenecks in business logic
- Poor architecture decisions (doing too much in one function, wrong separation of concerns)
- Missing error handling on critical paths
- Misleading variable/function names that suggest wrong behavior
- Dead code that serves no purpose

Rules:
- Do NOT repeat issues already listed in the static analysis summary
- Do NOT flag style preferences (formatting, spacing, semicolons)
- Do NOT flag things you cannot confirm from the code shown
- Focus on actionable, high-confidence findings only
- Maximum 8 issues total

Respond with ONLY a valid JSON array. No explanation, no markdown, no code fences. Example:
[{"severity":"critical","title":"...","description":"...","recommendation":"...","impact":"...","file":"src/foo.ts"}]

Severity levels: critical (security/data loss risk), major (likely bug or serious quality issue), minor (code smell with real impact), suggestion (improvement worth considering).`;

interface RawAIIssue {
  severity?: string;
  title?: string;
  description?: string;
  recommendation?: string;
  impact?: string;
  file?: string;
}

function walkSourceFiles(dir: string): Array<{ filePath: string; size: number }> {
  const results: Array<{ filePath: string; size: number }> = [];
  function walk(d: string) {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.includes(entry.name)) walk(full);
        } else if (SOURCE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
          try { results.push({ filePath: full, size: fs.statSync(full).size }); } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }
  walk(dir);
  return results;
}

function selectFiles(dir: string, maxFiles = 10, maxLines = 150): Array<{ name: string; content: string }> {
  const all = walkSourceFiles(dir);

  all.sort((a, b) => {
    const aEntry = ENTRY_NAMES.has(path.basename(a.filePath, path.extname(a.filePath)).toLowerCase());
    const bEntry = ENTRY_NAMES.has(path.basename(b.filePath, path.extname(b.filePath)).toLowerCase());
    if (aEntry !== bEntry) return aEntry ? -1 : 1;
    return b.size - a.size;
  });

  const selected: Array<{ name: string; content: string }> = [];
  for (const c of all.slice(0, maxFiles)) {
    try {
      const lines = fs.readFileSync(c.filePath, 'utf-8').split('\n').slice(0, maxLines).join('\n');
      selected.push({ name: path.relative(dir, c.filePath), content: lines });
    } catch { /* skip */ }
  }
  return selected;
}

function buildPrompt(
  framework: string,
  files: Array<{ name: string; content: string }>,
  existingIssues: AuditIssue[],
): string {
  const issuesSummary = existingIssues.length > 0
    ? existingIssues.map(i => `- [${i.severity}] ${i.title}`).join('\n')
    : 'None yet.';

  const filesBlock = files
    .map(f => `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  return `${SYSTEM_PROMPT}

Framework: ${framework}

## Already found by static analysis (do not repeat these):
${issuesSummary}

## Source files to review:
${filesBlock}`;
}

function parseAIResponse(raw: string): RawAIIssue[] {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return [];
  }
}

const VALID_SEVERITIES = new Set(['critical', 'major', 'minor', 'suggestion']);

function toAuditIssue(raw: RawAIIssue): AuditIssue | null {
  if (!raw.title || !raw.description) return null;
  const severity = VALID_SEVERITIES.has(raw.severity ?? '')
    ? (raw.severity as AuditIssue['severity'])
    : 'minor';
  return {
    id: uuidv4(),
    category: 'code-quality',
    severity,
    title: raw.title.slice(0, 120),
    description: raw.description.slice(0, 500),
    recommendation: (raw.recommendation ?? '').slice(0, 500),
    impact: (raw.impact ?? '').slice(0, 300),
    element: raw.file,
  };
}

export async function runAIReview(
  dir: string,
  framework: string,
  existingIssues: AuditIssue[],
): Promise<AuditIssue[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.info('GEMINI_API_KEY not set — skipping AI review');
    return [];
  }

  try {
    const files = selectFiles(dir);
    if (files.length === 0) return [];

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = buildPrompt(framework, files, existingIssues);

    logger.info('Running AI code review', { framework, fileCount: files.length });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    const aiIssues = parseAIResponse(raw)
      .map(toAuditIssue)
      .filter((i): i is AuditIssue => i !== null)
      .slice(0, 8);

    logger.info('AI review complete', { issuesFound: aiIssues.length });
    return aiIssues;
  } catch (error) {
    logger.warn('AI review failed — continuing without it', { error: (error as Error).message });
    return [];
  }
}
