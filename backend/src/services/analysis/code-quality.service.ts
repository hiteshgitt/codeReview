import * as fs from 'fs';
import * as path from 'path';
import simpleGit from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { CategoryResult, AuditIssue } from '../../types';
import config from '../../config';
import { logger } from '../../utils/logger';
import { runAIReview } from './ai-review.service';

interface FileStats {
  totalFiles: number;
  totalLines: number;
  largeFiles: string[];
  filesByExtension: Record<string, number>;
}

function buildCloneUrl(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  const url = new URL(repoUrl);
  url.username = url.hostname === 'github.com' ? 'x-access-token' : 'oauth2';
  url.password = token;
  return url.toString();
}

export async function analyzeCodeQuality(repoUrl: string, framework = 'html', repoToken?: string): Promise<CategoryResult> {
  const issues: AuditIssue[] = [];
  const metrics: Record<string, string | number | boolean | null> = {};
  const tmpDir = path.join(config.audit.tmpDir, `repo-${uuidv4()}`);

  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const git = simpleGit();
    git.env({
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
    });
    const cloneUrl = buildCloneUrl(repoUrl, repoToken);
    logger.info('Cloning repository for analysis', { repoUrl, tmpDir });

    await git.clone(cloneUrl, tmpDir, ['--depth=1', '--single-branch']);
    logger.info('Repository cloned successfully');

    metrics.framework = framework;

    // Config file checks
    const configChecks = checkConfigFiles(tmpDir, issues, metrics, framework);

    // Documentation checks
    checkDocumentation(tmpDir, issues, metrics);

    // Dependency checks
    await checkDependencies(tmpDir, issues, metrics);

    // File structure analysis
    const fileStats = analyzeFiles(tmpDir, issues, metrics);
    metrics.totalFiles = fileStats.totalFiles;
    metrics.totalLines = fileStats.totalLines;

    // Security checks (generic)
    checkSecurityIndicators(tmpDir, issues, metrics);

    // Framework-specific security checks
    checkSecurityByFramework(tmpDir, framework, issues, metrics);

    // Test coverage
    checkTestCoverage(tmpDir, issues, metrics);

    // CI/CD
    checkCICD(tmpDir, issues, metrics);

    // Code patterns (console.log, debugger, TODO)
    checkCodePatterns(tmpDir, fileStats, issues, metrics);

    // 1. Naming conventions & language standards
    checkNamingAndStandards(tmpDir, framework, issues, metrics);

    // 2. File structure & architecture
    checkFileStructure(tmpDir, framework, issues, metrics);

    // 3. Performance anti-patterns in code
    checkPerformancePatterns(tmpDir, framework, issues, metrics);

    // 4. Accessibility in code (static analysis)
    checkAccessibilityInCode(tmpDir, framework, issues, metrics);

    // 5. Maintainability & scalability
    checkMaintainability(tmpDir, framework, issues, metrics);

    // 6. Developer experience
    checkDeveloperExperience(tmpDir, framework, issues, metrics);

    // 7. CSS quality & naming conventions
    checkCSSQuality(tmpDir, framework, issues, metrics);

    // 8. AI review — finds logic bugs, architecture issues, and context-aware problems
    const aiIssues = await runAIReview(tmpDir, framework, issues);
    issues.push(...aiIssues);
    metrics.aiReviewIssues = aiIssues.length;

    const score = calculateCodeQualityScore(issues, metrics);
    return { score, issues, metrics };
  } catch (error) {
    logger.error('Code quality analysis failed', { error, repoUrl });
    return {
      score: 0,
      issues: [
        makeIssue('critical', 'Repository analysis failed',
          `Could not clone or analyze repository: ${(error as Error).message}`,
          'Ensure the repository URL is correct and publicly accessible.',
          'Code quality cannot be assessed without repository access.'),
      ],
      metrics: { error: (error as Error).message },
    };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, (err) => {
      if (err) logger.warn('Failed to clean up temp directory', { tmpDir, err });
    });
  }
}

const PHP_FRAMEWORKS = ['laravel', 'codeigniter', 'php', 'wordpress'];
const JS_FRAMEWORKS = ['nextjs', 'react', 'vue', 'html'];

function checkConfigFiles(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
  framework = 'html',
): void {
  const isPhpFramework = PHP_FRAMEWORKS.includes(framework);

  // Linting — PHP uses phpcs/phpstan, JS uses ESLint
  if (isPhpFramework) {
    const phpLintConfigs = ['phpcs.xml', '.phpcs.xml', 'phpstan.neon', 'phpstan.neon.dist',
      '.phpstan.neon', 'phpmd.xml', '.phpmd.xml'];
    const hasPhpLinting = phpLintConfigs.some(f => fs.existsSync(path.join(dir, f)));
    metrics.hasLinting = hasPhpLinting;

    if (!hasPhpLinting) {
      const fwLabel = framework === 'laravel' ? 'Laravel' : framework === 'codeigniter' ? 'CodeIgniter' : framework === 'wordpress' ? 'WordPress' : 'PHP';
      issues.push(makeIssue('major', `No PHP linting configuration found`,
        `No PHP_CodeSniffer (phpcs.xml) or PHPStan configuration detected for your ${fwLabel} project.`,
        `Add phpcs.xml with ${framework === 'laravel' ? 'Laravel' : 'PSR-12'} standards, or phpstan.neon for static analysis.`,
        'PHP linting catches type errors, unused variables, and style violations before they reach production.'));
    }

    // Laravel-specific checks
    if (framework === 'laravel') {
      const hasArtisan = fs.existsSync(path.join(dir, 'artisan'));
      metrics.hasArtisan = hasArtisan;
      if (!hasArtisan) {
        issues.push(makeIssue('critical', 'Missing artisan file',
          'The Laravel artisan CLI file is missing from the repository root.',
          'Ensure the full Laravel project is committed, including the artisan file.',
          'Without artisan, Laravel commands, migrations, and seeding cannot run.'));
      }
      const hasEnvExample = fs.existsSync(path.join(dir, '.env.example'));
      metrics.hasEnvExample = hasEnvExample;
      if (!hasEnvExample) {
        issues.push(makeIssue('major', 'No .env.example file',
          'Laravel projects should include a .env.example to document required environment variables.',
          'Create a .env.example with all required keys (without values) and commit it.',
          'Missing .env.example makes onboarding new developers difficult and increases misconfiguration risk.'));
      }
    }

    // CodeIgniter-specific checks
    if (framework === 'codeigniter') {
      const hasAppFolder = fs.existsSync(path.join(dir, 'app')) || fs.existsSync(path.join(dir, 'application'));
      metrics.hasAppFolder = hasAppFolder;
      if (!hasAppFolder) {
        issues.push(makeIssue('critical', 'Missing CodeIgniter app directory',
          'The CodeIgniter application directory (app/ or application/) is missing.',
          'Ensure the full CodeIgniter project structure is committed.',
          'Without the app directory the framework cannot bootstrap routes, controllers, or models.'));
      }
    }

    // WordPress-specific checks
    if (framework === 'wordpress') {
      const hasWpConfig = fs.existsSync(path.join(dir, 'wp-config-sample.php')) ||
        fs.existsSync(path.join(dir, 'wp-config.php'));
      metrics.hasWpConfig = hasWpConfig;
      if (!hasWpConfig) {
        issues.push(makeIssue('major', 'No wp-config-sample.php found',
          'WordPress projects should include wp-config-sample.php (not wp-config.php) in version control.',
          'Commit wp-config-sample.php with placeholder values. Never commit wp-config.php.',
          'Without a config sample, contributors cannot set up a local environment.'));
      }
    }
  } else {
    // JS/TS ecosystem linting
    const lintingConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.ts', '.eslintrc.json',
      '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs'];
    const hasLinting = lintingConfigs.some(f => fs.existsSync(path.join(dir, f)));
    metrics.hasLinting = hasLinting;

    if (!hasLinting) {
      issues.push(makeIssue('major', 'No linting configuration found',
        'No ESLint or similar linting configuration detected.',
        'Add ESLint with appropriate rules to enforce code quality standards.',
        'Linting catches bugs and enforces consistent code style across the team.'));
    }

    // Next.js-specific checks
    if (framework === 'nextjs') {
      const hasNextConfig = fs.existsSync(path.join(dir, 'next.config.js')) ||
        fs.existsSync(path.join(dir, 'next.config.ts')) ||
        fs.existsSync(path.join(dir, 'next.config.mjs'));
      metrics.hasNextConfig = hasNextConfig;
      if (!hasNextConfig) {
        issues.push(makeIssue('minor', 'No next.config file found',
          'A next.config.js / next.config.mjs is recommended for Next.js projects.',
          'Create next.config.mjs to configure image domains, redirects, headers, and optimisations.',
          'Without a config file, Next.js optimisation features may not be enabled.'));
      }
    }
  }

  const formatterConfigs = ['.prettierrc', '.prettierrc.js', '.prettierrc.json',
    '.prettierrc.yml', 'prettier.config.js'];
  const hasFormatter = formatterConfigs.some(f => fs.existsSync(path.join(dir, f)));
  metrics.hasFormatter = hasFormatter;

  if (!hasFormatter && !isPhpFramework) {
    issues.push(makeIssue('minor', 'No code formatter configuration',
      'No Prettier or similar formatter configuration found.',
      'Add a Prettier configuration to enforce consistent code formatting.',
      'Without a formatter, code style inconsistencies accumulate over time.'));
  }

  if (!isPhpFramework) {
    const tsConfig = fs.existsSync(path.join(dir, 'tsconfig.json'));
    metrics.hasTypeScript = tsConfig;

    if (!tsConfig && framework !== 'html') {
      issues.push(makeIssue('suggestion', 'No TypeScript configuration',
        'This project does not appear to use TypeScript.',
        'Consider migrating to TypeScript for improved type safety and developer experience.',
        'TypeScript catches type errors at compile time, reducing runtime bugs.'));
    }
  }

  const editorConfig = fs.existsSync(path.join(dir, '.editorconfig'));
  metrics.hasEditorConfig = editorConfig;

  if (!editorConfig) {
    issues.push(makeIssue('suggestion', 'No .editorconfig file',
      'No .editorconfig file found.',
      'Add a .editorconfig to ensure consistent editor settings across the team.',
      'Without .editorconfig, different editors may produce inconsistent whitespace and line endings.'));
  }
}

function checkDocumentation(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const readmeFiles = ['README.md', 'readme.md', 'README.txt', 'README'];
  const hasReadme = readmeFiles.some(f => fs.existsSync(path.join(dir, f)));
  metrics.hasReadme = hasReadme;

  if (!hasReadme) {
    issues.push(makeIssue('major', 'Missing README file',
      'No README file found in the repository root.',
      'Add a README.md with project description, setup instructions, and contribution guidelines.',
      'Without a README, contributors and users have no documentation on how to set up or use the project.'));
  } else {
    // Check README quality
    const readmePath = readmeFiles.find(f => fs.existsSync(path.join(dir, f)));
    if (readmePath) {
      const content = fs.readFileSync(path.join(dir, readmePath), 'utf-8');
      if (content.length < 200) {
        issues.push(makeIssue('minor', 'README is too brief',
          `README is only ${content.length} characters long.`,
          'Expand the README with setup instructions, architecture overview, and usage examples.',
          'Minimal READMEs leave contributors without the context needed to work on the project.'));
      }
      metrics.hasSetupInstructions = /install|setup|getting started/i.test(content);
    }
  }

  // Check for .env.example
  const hasEnvExample = fs.existsSync(path.join(dir, '.env.example')) ||
    fs.existsSync(path.join(dir, '.env.sample'));
  const hasEnvFile = fs.existsSync(path.join(dir, '.env'));
  metrics.hasEnvExample = hasEnvExample;
  metrics.hasEnvCommitted = hasEnvFile;

  if (hasEnvFile) {
    issues.push(makeIssue('critical', '.env file committed to repository',
      'A .env file was found in the repository root.',
      'Remove .env from the repository immediately and add it to .gitignore. Use .env.example instead.',
      'Committed .env files expose secrets (API keys, passwords) to everyone with repo access.'));
  }

  if (!hasEnvExample && !hasEnvFile) {
    issues.push(makeIssue('minor', 'No .env.example file',
      'No .env.example or .env.sample file found.',
      'Create a .env.example file listing required environment variables without values.',
      'Without .env.example, new developers don\'t know which environment variables to configure.'));
  }
}

async function checkDependencies(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): Promise<void> {
  const packageJsonPath = path.join(dir, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    metrics.hasPackageJson = false;
    return;
  }

  metrics.hasPackageJson = true;

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    metrics.dependencyCount = deps.length;
    metrics.devDependencyCount = devDeps.length;

    // Check for lock file
    const hasLockFile = fs.existsSync(path.join(dir, 'package-lock.json')) ||
      fs.existsSync(path.join(dir, 'yarn.lock')) ||
      fs.existsSync(path.join(dir, 'pnpm-lock.yaml'));
    metrics.hasLockFile = hasLockFile;

    if (!hasLockFile) {
      issues.push(makeIssue('major', 'No dependency lock file',
        'No package-lock.json, yarn.lock, or pnpm-lock.yaml found.',
        'Commit your lock file to ensure reproducible builds across environments.',
        'Without a lock file, different environments may install different package versions.'));
    }

    // Only flag missing test script when test files exist — checkTestCoverage handles the no-tests case
    const testDirsExist = ['__tests__', 'test', 'tests', 'spec', 'specs']
      .some(p => fs.existsSync(path.join(dir, p)));
    if (!pkg.scripts?.test && testDirsExist) {
      issues.push(makeIssue('major', 'No test script defined',
        'Test files found but no "test" script in package.json.',
        'Add a test script so CI/CD can run tests automatically.',
        'Without a test script, CI systems cannot verify code correctness.'));
    }

    if (!pkg.scripts?.build) {
      issues.push(makeIssue('minor', 'No build script defined',
        'No "build" script found in package.json.',
        'Add a build script to standardize the production build process.',
        'Missing build scripts make deployment processes inconsistent.'));
    }

    // Check for known vulnerable patterns (old major versions)
    const knownOldPackages: Record<string, { minSafe: number; reason: string }> = {
      'express': { minSafe: 4, reason: 'Express v3 and below have known security vulnerabilities' },
      'lodash': { minSafe: 4, reason: 'Lodash v3 has prototype pollution vulnerabilities' },
      'axios': { minSafe: 1, reason: 'Axios v0.x has known request forgery vulnerabilities' },
    };

    for (const [pkg_name, info] of Object.entries(knownOldPackages)) {
      const version = (pkg.dependencies?.[pkg_name] || pkg.devDependencies?.[pkg_name]) as string | undefined;
      if (version) {
        const major = parseInt(version.replace(/[^0-9]/, ''), 10);
        if (!isNaN(major) && major < info.minSafe) {
          issues.push(makeIssue('critical', `Outdated package: ${pkg_name}`,
            `${pkg_name} version ${version} is outdated. ${info.reason}`,
            `Update ${pkg_name} to the latest stable version.`,
            'Outdated packages may contain security vulnerabilities.'));
        }
      }
    }

  } catch (err) {
    logger.warn('Could not parse package.json', { err });
  }
}

function analyzeFiles(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): FileStats {
  const stats: FileStats = {
    totalFiles: 0,
    totalLines: 0,
    largeFiles: [],
    filesByExtension: {},
  };

  const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'coverage']);
  const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.rb', '.php', '.cs', '.cpp', '.c']);

  function walkDir(currentDir: string, depth: number = 0): void {
    if (depth > 8) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoreDirs.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;
        stats.totalFiles++;

        if (codeExtensions.has(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n').length;
            stats.totalLines += lines;

            if (lines > 500) {
              stats.largeFiles.push(`${path.relative(dir, fullPath)} (${lines} lines)`);
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  walkDir(dir);

  if (stats.largeFiles.length > 0) {
    issues.push(makeIssue('minor', `${stats.largeFiles.length} overly large file(s)`,
      `Files over 500 lines: ${stats.largeFiles.slice(0, 3).join(', ')}${stats.largeFiles.length > 3 ? '...' : ''}`,
      'Refactor large files into smaller, focused modules following the Single Responsibility Principle.',
      'Large files are harder to review, test, and maintain.'));
  }

  return stats;
}

function checkSecurityIndicators(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  // .gitignore presence + completeness is handled in checkDeveloperExperience
  // to avoid duplicate issues. Only track the metric here.
  metrics.hasGitignore = fs.existsSync(path.join(dir, '.gitignore'));
}

function checkTestCoverage(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const testPatterns = [
    '__tests__', 'test', 'tests', 'spec', 'specs',
  ];

  const testExtensions = ['.test.ts', '.test.js', '.spec.ts', '.spec.js', '.test.tsx', '.spec.tsx'];

  let hasTests = testPatterns.some(p => fs.existsSync(path.join(dir, p)));

  if (!hasTests) {
    // Check for test files within src
    try {
      const srcDir = path.join(dir, 'src');
      if (fs.existsSync(srcDir)) {
        const findTests = (d: string): boolean => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === 'node_modules') continue;
            if (entry.isFile() && testExtensions.some(ext => entry.name.endsWith(ext))) return true;
            if (entry.isDirectory()) {
              if (findTests(path.join(d, entry.name))) return true;
            }
          }
          return false;
        };
        hasTests = findTests(srcDir);
      }
    } catch {
      // Ignore errors
    }
  }

  metrics.hasTests = hasTests;

  if (!hasTests) {
    issues.push(makeIssue('major', 'No test files found',
      'No unit or integration test files were detected.',
      'Add tests using Jest, Vitest, or Mocha. Aim for at least 70% coverage on critical paths.',
      'Code without tests is fragile. Bugs can go undetected until they reach production.'));
  }
}

function checkCICD(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const ciConfigs = [
    '.github/workflows',
    '.gitlab-ci.yml',
    '.circleci/config.yml',
    'Jenkinsfile',
    '.travis.yml',
    'azure-pipelines.yml',
    '.bitbucket-pipelines.yml',
  ];

  const hasCICD = ciConfigs.some(p => fs.existsSync(path.join(dir, p)));
  metrics.hasCICD = hasCICD;

  if (!hasCICD) {
    issues.push(makeIssue('suggestion', 'No CI/CD configuration found',
      'No continuous integration or deployment configuration detected.',
      'Set up GitHub Actions, GitLab CI, or CircleCI to automate testing and deployment.',
      'Without CI/CD, code changes are not automatically tested, increasing the risk of regressions.'));
  }
}

function checkCodePatterns(
  dir: string,
  fileStats: FileStats,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const srcDir = path.join(dir, 'src');
  if (!fs.existsSync(srcDir)) return;

  let consoleLogCount = 0;
  let debuggerCount = 0;
  let todoCount = 0;

  const checkFile = (filePath: string): void => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const consoleMatches = content.match(/console\.(log|debug|warn|error)\(/g);
      const debuggerMatches = content.match(/debugger;/g);
      const todoMatches = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi);

      if (consoleMatches) consoleLogCount += consoleMatches.length;
      if (debuggerMatches) debuggerCount += debuggerMatches.length;
      if (todoMatches) todoCount += todoMatches.length;
    } catch {
      // Skip unreadable files
    }
  };

  const walkAndCheck = (currentDir: string, depth: number = 0): void => {
    if (depth > 6) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkAndCheck(fullPath, depth + 1);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        checkFile(fullPath);
      }
    }
  };

  walkAndCheck(srcDir);

  metrics.consoleLogCount = consoleLogCount;
  metrics.debuggerCount = debuggerCount;
  metrics.todoCount = todoCount;

  if (consoleLogCount > 10) {
    issues.push(makeIssue('minor', `${consoleLogCount} console.log statements found`,
      'Large number of console statements in production code.',
      'Remove or replace console.log with a proper logging library (winston, pino).',
      'Console logs expose debugging information and pollute application output.'));
  }

  if (debuggerCount > 0) {
    issues.push(makeIssue('major', `${debuggerCount} debugger statement(s) found`,
      'debugger; statements pause execution in browser dev tools.',
      'Remove all debugger statements before deploying to production.',
      'Debugger statements can break user experience in production.'));
  }

  if (todoCount > 20) {
    issues.push(makeIssue('suggestion', `${todoCount} TODO/FIXME comments found`,
      'A large number of TODO/FIXME comments suggest unfinished work.',
      'Address outstanding TODOs or track them in an issue tracker.',
      'Excessive TODO comments indicate technical debt that may affect reliability.'));
  }
}

// ── Framework-specific security scanning ──────────────────────────────────────

function walkFiles(
  dir: string,
  extensions: string[],
  skip: string[] = ['node_modules', '.git', 'dist', 'build', 'vendor'],
  depth = 0,
  maxDepth = 8,
): string[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, extensions, skip, depth + 1, maxDepth));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function grepCount(files: string[], pattern: RegExp): number {
  let count = 0;
  for (const f of files) {
    try { count += (fs.readFileSync(f, 'utf-8').match(pattern) || []).length; } catch { /* skip */ }
  }
  return count;
}

function grepLines(
  files: string[],
  pattern: RegExp,
  rootDir: string,
  maxResults = 8,
): string[] {
  const locations: string[] = [];
  const testRe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  for (const f of files) {
    if (locations.length >= maxResults) break;
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      const rel = path.relative(rootDir, f);
      for (let i = 0; i < lines.length && locations.length < maxResults; i++) {
        if (testRe.test(lines[i])) {
          locations.push(`${rel}:${i + 1}`);
        }
      }
    } catch { /* skip */ }
  }
  return locations;
}

function grepAny(files: string[], pattern: RegExp): boolean {
  return files.some(f => { try { return pattern.test(fs.readFileSync(f, 'utf-8')); } catch { return false; } });
}

function checkSecurityByFramework(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  if (framework === 'wordpress') checkWordPressSecurity(dir, issues, metrics);
  else if (['php', 'laravel', 'codeigniter'].includes(framework)) checkPhpSecurity(dir, framework, issues, metrics);
  else if (['nextjs', 'react', 'vue', 'html'].includes(framework)) checkJsSecurity(dir, framework, issues, metrics);
}

// ── WordPress security ────────────────────────────────────────────────────────

function checkWordPressSecurity(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const phpFiles = walkFiles(dir, ['.php']);
  if (phpFiles.length === 0) return;

  // 1. Direct $_GET / $_POST output without escaping
  const rawOutput = grepCount(phpFiles, /echo\s+\$_(GET|POST|REQUEST|COOKIE)\s*\[/g);
  metrics.wpRawOutputCount = rawOutput;
  if (rawOutput > 0) {
    const rawOutputLocs = grepLines(phpFiles, /echo\s+\$_(GET|POST|REQUEST|COOKIE)\s*\[/, dir);
    issues.push(makeIssue('critical',
      `${rawOutput} instance(s) of unescaped user input echoed directly`,
      `Found echo \$_GET/\$_POST/\$_REQUEST without escaping in ${rawOutput} location(s).`,
      'Always escape output with esc_html(), esc_attr(), esc_url(), or wp_kses() before echoing.',
      'Directly echoing user input enables Cross-Site Scripting (XSS) attacks.',
      rawOutputLocs));
  }

  // 2. esc_html / esc_attr / esc_url usage
  const escHtmlCount = grepCount(phpFiles, /esc_html\s*\(/g);
  const escAttrCount = grepCount(phpFiles, /esc_attr\s*\(/g);
  const escUrlCount  = grepCount(phpFiles, /esc_url\s*\(/g);
  const sanitizeCount = grepCount(phpFiles, /sanitize_text_field\s*\(|sanitize_email\s*\(|sanitize_url\s*\(/g);
  metrics.wpEscHtmlUsage  = escHtmlCount;
  metrics.wpEscAttrUsage  = escAttrCount;
  metrics.wpEscUrlUsage   = escUrlCount;
  metrics.wpSanitizeUsage = sanitizeCount;

  if (escHtmlCount + escAttrCount + escUrlCount === 0) {
    issues.push(makeIssue('major',
      'No WordPress output escaping functions detected',
      'No esc_html(), esc_attr(), or esc_url() calls found in PHP files.',
      'Use WordPress escaping functions on all dynamic output: esc_html() for text, esc_attr() for HTML attributes, esc_url() for URLs.',
      'Missing output escaping is the #1 source of XSS vulnerabilities in WordPress plugins/themes.'));
  }

  if (sanitizeCount === 0 && phpFiles.length > 3) {
    issues.push(makeIssue('major',
      'No WordPress input sanitization functions detected',
      'No sanitize_text_field(), sanitize_email(), or similar calls found.',
      'Sanitize all user input on save with sanitize_text_field(), sanitize_email(), wp_kses(), etc.',
      'Unsanitized input can lead to stored XSS and data integrity issues.'));
  }

  // 3. $wpdb->prepare() for database queries
  const wpdbQueryRaw   = grepCount(phpFiles, /\$wpdb\s*->\s*(query|get_results|get_row|get_var)\s*\(\s*["'`]/g);
  const wpdbPrepare    = grepCount(phpFiles, /\$wpdb\s*->\s*prepare\s*\(/g);
  metrics.wpdbRawQueries  = wpdbQueryRaw;
  metrics.wpdbPrepareUsage = wpdbPrepare;

  if (wpdbQueryRaw > 0 && wpdbPrepare === 0) {
    const wpdbLocs = grepLines(phpFiles, /\$wpdb\s*->\s*(query|get_results|get_row|get_var)\s*\(/, dir);
    issues.push(makeIssue('critical',
      `${wpdbQueryRaw} raw \$wpdb quer${wpdbQueryRaw === 1 ? 'y' : 'ies'} without \$wpdb->prepare()`,
      'Database queries using $wpdb->query/get_results with hardcoded or interpolated strings detected.',
      'Use $wpdb->prepare() for all queries with dynamic data: $wpdb->get_results($wpdb->prepare("SELECT * FROM %s WHERE id = %d", $table, $id))',
      'Raw SQL queries with user input are vulnerable to SQL injection.',
      wpdbLocs));
  } else if (wpdbQueryRaw > 0) {
    const wpdbLocs = grepLines(phpFiles, /\$wpdb\s*->\s*(query|get_results|get_row|get_var)\s*\(/, dir);
    issues.push(makeIssue('minor',
      `${wpdbQueryRaw} potential raw \$wpdb quer${wpdbQueryRaw === 1 ? 'y' : 'ies'} — verify all use prepare()`,
      'Some $wpdb queries were detected. Ensure all dynamic queries use $wpdb->prepare().',
      'Audit each $wpdb->query/get_results call and wrap dynamic values with $wpdb->prepare().',
      'Missing prepare() on even one query can expose the database to SQL injection.',
      wpdbLocs));
  }

  // 4. Nonce verification
  const nonceField  = grepCount(phpFiles, /wp_nonce_field\s*\(|wp_create_nonce\s*\(/g);
  const nonceVerify = grepCount(phpFiles, /wp_verify_nonce\s*\(|check_admin_referer\s*\(|check_ajax_referer\s*\(/g);
  metrics.wpNonceCreate = nonceField;
  metrics.wpNonceVerify = nonceVerify;

  if (nonceField > 0 && nonceVerify === 0) {
    issues.push(makeIssue('critical',
      'Nonces created but never verified',
      `Found ${nonceField} wp_nonce_field/wp_create_nonce call(s) but no wp_verify_nonce() or check_admin_referer().`,
      'Verify nonces on every form submission and AJAX action: if (!wp_verify_nonce($_POST["_wpnonce"], "action_name")) { wp_die(); }',
      'Unverified nonces provide no CSRF protection — form submissions can be forged.'));
  } else if (nonceField === 0 && phpFiles.length > 5) {
    issues.push(makeIssue('major',
      'No WordPress nonce usage detected',
      'No wp_nonce_field() or wp_create_nonce() calls found. Forms may lack CSRF protection.',
      'Add wp_nonce_field() to all forms and verify with wp_verify_nonce() or check_admin_referer() on submission.',
      'Without nonces, all form actions are vulnerable to Cross-Site Request Forgery (CSRF).'));
  }

  // 5. Authorization checks
  const capChecks = grepCount(phpFiles, /current_user_can\s*\(|user_can\s*\(/g);
  metrics.wpCapabilityChecks = capChecks;

  if (capChecks === 0 && phpFiles.length > 5) {
    issues.push(makeIssue('major',
      'No capability/permission checks detected',
      'No current_user_can() or user_can() calls found in plugin/theme PHP files.',
      'Add capability checks before any privileged action: if (!current_user_can("manage_options")) { wp_die("Unauthorized"); }',
      'Missing authorization checks allow any logged-in user (or unauthenticated user) to perform admin actions.'));
  }

  // 6. Hardcoded credentials / secrets
  checkHardcodedSecrets(phpFiles, issues, metrics, dir);

  // 7. eval() and base64_decode() on user input
  const evalUsage = grepCount(phpFiles, /\beval\s*\(/g);
  metrics.phpEvalUsage = evalUsage;
  if (evalUsage > 0) {
    const evalLocs = grepLines(phpFiles, /\beval\s*\(/, dir);
    issues.push(makeIssue('critical',
      `${evalUsage} eval() call(s) detected`,
      'eval() executes arbitrary PHP code. If any user-controlled input reaches eval(), it is a critical RCE vulnerability.',
      'Remove eval() entirely. If dynamic code execution is truly needed, use a safe alternative.',
      'eval() with user input leads to Remote Code Execution (RCE) — the most severe class of vulnerability.',
      evalLocs));
  }
}

// ── PHP security (Laravel, CodeIgniter, plain PHP) ────────────────────────────

function checkPhpSecurity(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const phpFiles = walkFiles(dir, ['.php']);
  if (phpFiles.length === 0) return;

  // 1. Raw SQL with string concatenation / interpolation
  const rawSqlPatterns = /\b(mysql_query|mysqli_query|pg_query|PDO::query)\s*\(\s*["'].*\.\s*\$|SELECT.*\.\s*\$_(GET|POST|REQUEST)/ig;
  const rawSqlCount = grepCount(phpFiles, rawSqlPatterns);
  metrics.rawSqlCount = rawSqlCount;

  if (rawSqlCount > 0) {
    const rawSqlLocs = grepLines(phpFiles, /\b(mysql_query|mysqli_query|pg_query|PDO::query)\s*\(|SELECT.*\.\s*\$_(GET|POST|REQUEST)/, dir);
    issues.push(makeIssue('critical',
      `${rawSqlCount} potential SQL injection vector(s) detected`,
      'String concatenation with user input detected in SQL queries.',
      framework === 'laravel'
        ? 'Use Eloquent ORM or query builder with parameter binding: DB::select("SELECT * FROM users WHERE id = ?", [$id])'
        : framework === 'codeigniter'
          ? 'Use CodeIgniter query binding: $this->db->query("SELECT * FROM users WHERE id = ?", [$id])'
          : 'Use PDO prepared statements: $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$id])',
      'SQL injection can expose, modify, or delete your entire database.',
      rawSqlLocs));
  }

  // 2. Direct echo of user input without escaping
  const rawEcho = grepCount(phpFiles, /echo\s+\$_(GET|POST|REQUEST|COOKIE)\s*\[/g);
  metrics.rawEchoCount = rawEcho;

  if (rawEcho > 0) {
    const rawEchoLocs = grepLines(phpFiles, /echo\s+\$_(GET|POST|REQUEST|COOKIE)\s*\[/, dir);
    issues.push(makeIssue('critical',
      `${rawEcho} instance(s) of unescaped user input output`,
      'User input from $_GET/$_POST is echoed directly without escaping.',
      'Use htmlspecialchars($_GET["x"], ENT_QUOTES, "UTF-8") or framework-specific escaping.',
      'Unescaped user output enables Cross-Site Scripting (XSS) attacks.',
      rawEchoLocs));
  }

  // 3. Laravel-specific
  if (framework === 'laravel') {
    const phpFiles2 = walkFiles(dir, ['.php', '.blade.php']);
    const tripleBladeRaw = grepCount(phpFiles2, /\{\!\!\s*\$/g);
    metrics.laravelUnescapedOutput = tripleBladeRaw;

    if (tripleBladeRaw > 0) {
      const bladeLocs = grepLines(phpFiles2, /\{\!\!\s*\$/, dir);
      issues.push(makeIssue('major',
        `${tripleBladeRaw} unescaped Blade output(s) using {!! ... !!}`,
        '{!! $variable !!} outputs raw HTML without escaping — safe only for trusted content.',
        'Use {{ $variable }} (auto-escaped) instead of {!! $variable !!} unless the content is explicitly trusted and sanitized.',
        'Unescaped Blade output can enable stored XSS if the value contains user-controlled data.',
        bladeLocs));
    }

    const csrfMiddleware = grepAny(phpFiles, /VerifyCsrfToken|csrf_token\(\)|@csrf/);
    metrics.laravelHasCsrf = csrfMiddleware;

    if (!csrfMiddleware) {
      issues.push(makeIssue('major',
        'No CSRF protection found in Laravel project',
        'No @csrf directive, csrf_token(), or VerifyCsrfToken middleware usage detected.',
        'Add @csrf to all Blade forms. Ensure VerifyCsrfToken middleware is active in app/Http/Middleware/VerifyCsrfToken.php.',
        'Without CSRF tokens, all POST/PUT/DELETE form actions can be forged by malicious sites.'));
    }

    const massAssignmentGuard = grepAny(phpFiles, /\$fillable\s*=|\$guarded\s*=/);
    metrics.laravelMassAssignmentProtection = massAssignmentGuard;

    if (!massAssignmentGuard) {
      issues.push(makeIssue('major',
        'No mass assignment protection (\$fillable / \$guarded) found',
        'No $fillable or $guarded property found in Eloquent models.',
        'Define $fillable or $guarded on every Eloquent model to prevent mass assignment vulnerabilities.',
        'Without protection, Model::create($request->all()) can overwrite any column including role, admin, etc.'));
    }
  }

  // 4. CodeIgniter-specific
  if (framework === 'codeigniter') {
    const usesInputLibrary = grepAny(phpFiles, /\$this\s*->\s*input\s*->\s*(get|post|request)/);
    const directGet = grepCount(phpFiles, /\$_(GET|POST|REQUEST)\s*\[/g);
    metrics.ciUsesInputLibrary = usesInputLibrary;
    metrics.ciDirectSuperglobalCount = directGet;

    if (directGet > 5 && !usesInputLibrary) {
      const ciInputLocs = grepLines(phpFiles, /\$_(GET|POST|REQUEST)\s*\[/, dir);
      issues.push(makeIssue('major',
        `${directGet} direct \$_GET/\$_POST superglobal access(es) found`,
        'CodeIgniter recommends using $this->input->get() and $this->input->post() which apply XSS filtering.',
        'Replace $_GET["x"] with $this->input->get("x", TRUE) and $_POST["x"] with $this->input->post("x", TRUE).',
        'Direct superglobal access bypasses CodeIgniter\'s built-in input filtering.',
        ciInputLocs));
    }
  }

  // 5. Hardcoded credentials
  checkHardcodedSecrets(phpFiles, issues, metrics, dir);

  // 6. eval()
  const evalUsage = grepCount(phpFiles, /\beval\s*\(/g);
  metrics.phpEvalUsage = evalUsage;
  if (evalUsage > 0) {
    const phpEvalLocs = grepLines(phpFiles, /\beval\s*\(/, dir);
    issues.push(makeIssue('critical',
      `${evalUsage} eval() call(s) detected`,
      'eval() is a severe security risk if any user-controlled data can reach it.',
      'Remove all eval() calls. Consider using data structures or strategy patterns instead.',
      'eval() with user input leads to Remote Code Execution.',
      phpEvalLocs));
  }
}

// ── JavaScript / TypeScript security ─────────────────────────────────────────

function checkJsSecurity(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx', '.vue'],
    ['node_modules', '.git', 'dist', 'build', '.next', 'out']);

  if (jsFiles.length === 0) return;

  // 1. dangerouslySetInnerHTML (React/Next.js)
  if (['react', 'nextjs'].includes(framework)) {
    const dangerCount = grepCount(jsFiles, /dangerouslySetInnerHTML\s*=/g);
    metrics.dangerouslySetInnerHTMLCount = dangerCount;

    if (dangerCount > 0) {
      const dangerLocs = grepLines(jsFiles, /dangerouslySetInnerHTML\s*=/, dir);
      issues.push(makeIssue('major',
        `${dangerCount} dangerouslySetInnerHTML usage(s) detected`,
        'dangerouslySetInnerHTML renders raw HTML without React\'s XSS escaping.',
        'Remove dangerouslySetInnerHTML where possible. When unavoidable, sanitize the HTML first with DOMPurify: { __html: DOMPurify.sanitize(content) }',
        'Unsanitized dangerouslySetInnerHTML enables stored XSS — attackers can inject scripts that run for all users.',
        dangerLocs));
    }
  }

  // 2. eval() / Function() constructor
  const evalCount = grepCount(jsFiles, /\beval\s*\(|new\s+Function\s*\(/g);
  metrics.jsEvalCount = evalCount;

  if (evalCount > 0) {
    const jsEvalLocs = grepLines(jsFiles, /\beval\s*\(|new\s+Function\s*\(/, dir);
    issues.push(makeIssue('critical',
      `${evalCount} eval() / new Function() call(s) detected`,
      'eval() and new Function() execute arbitrary code strings.',
      'Remove all eval() and new Function() calls. Use JSON.parse() for JSON, or refactor to avoid dynamic code execution.',
      'eval() with user-controlled strings enables code injection attacks.',
      jsEvalLocs));
  }

  // 3. document.write()
  const docWriteCount = grepCount(jsFiles, /document\.write\s*\(/g);
  metrics.documentWriteCount = docWriteCount;

  if (docWriteCount > 0) {
    const docWriteLocs = grepLines(jsFiles, /document\.write\s*\(/, dir);
    issues.push(makeIssue('major',
      `${docWriteCount} document.write() call(s) detected`,
      'document.write() is a legacy API that can introduce XSS if user data is inserted.',
      'Replace document.write() with DOM manipulation (createElement, appendChild, textContent).',
      'document.write() with unsanitized user content enables XSS.',
      docWriteLocs));
  }

  // 4. innerHTML assignment
  const innerHtmlCount = grepCount(jsFiles, /\.innerHTML\s*=/g);
  metrics.innerHtmlAssignments = innerHtmlCount;

  if (innerHtmlCount > 0) {
    const innerHtmlLocs = grepLines(jsFiles, /\.innerHTML\s*=/, dir);
    issues.push(makeIssue('minor',
      `${innerHtmlCount} innerHTML assignment(s) detected`,
      'Direct innerHTML assignments can introduce XSS if the value contains user input.',
      'Use textContent for plain text, or sanitize HTML with DOMPurify before assigning to innerHTML.',
      'Unsanitized innerHTML with user data enables XSS attacks.',
      innerHtmlLocs));
  }

  // 5. Hardcoded secrets / API keys
  checkHardcodedSecrets(jsFiles, issues, metrics, dir);

  // 6. Next.js specific — server actions without auth checks
  if (framework === 'nextjs') {
    const serverActions = grepCount(jsFiles, /'use server'/g);
    metrics.nextServerActionsCount = serverActions;
    // We can only flag if found — actual auth check analysis is complex
  }
}

// ── Shared: hardcoded secrets scanner ────────────────────────────────────────

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /['"]?(?:password|passwd|pwd)\s*['"]?\s*[:=]\s*['"][^'"]{6,}/gi, label: 'hardcoded password' },
  { pattern: /(?:api_key|apikey|api-key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}/gi, label: 'hardcoded API key' },
  { pattern: /(?:secret|secret_key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}/gi, label: 'hardcoded secret' },
  { pattern: /(?:access_token|auth_token)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{20,}/gi, label: 'hardcoded token' },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key ID' },
  { pattern: /(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{24,}/g, label: 'Stripe key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/g, label: 'GitHub personal access token' },
];

function checkHardcodedSecrets(
  files: string[],
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
  rootDir: string,
): void {
  const found: string[] = [];
  const locations: string[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      const rel = path.relative(rootDir, file);
      for (const { pattern, label } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
          found.push(label);
          if (locations.length < 8) {
            const testRe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
            const lineIdx = lines.findIndex(l => testRe.test(l));
            if (lineIdx >= 0) locations.push(`${rel}:${lineIdx + 1}`);
          }
        }
      }
    } catch { /* skip */ }
  }

  const unique = [...new Set(found)];
  metrics.hardcodedSecretTypes = unique.join(', ') || null;

  if (unique.length > 0) {
    issues.push(makeIssue('critical',
      `Possible hardcoded secret(s) detected: ${unique.join(', ')}`,
      `Pattern matches for ${unique.join(', ')} found in source files.`,
      'Move all secrets to environment variables (.env) and never commit credentials to version control. Rotate any exposed keys immediately.',
      'Hardcoded credentials in source code are trivially exploitable if the repository is ever accessed.',
      [...new Set(locations)]));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Naming conventions & language standards
// ══════════════════════════════════════════════════════════════════════════════

function checkNamingAndStandards(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const isPhp = PHP_FRAMEWORKS.includes(framework);

  if (isPhp) {
    checkPhpNaming(dir, framework, issues, metrics);
  } else {
    checkJsNaming(dir, framework, issues, metrics);
  }
}

function checkJsNaming(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const files = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx', '.vue'],
    ['node_modules', '.git', 'dist', 'build', '.next', 'out']);
  if (files.length === 0) return;

  // var usage — should be const or let (ES6+)
  const varCount = grepCount(files, /\bvar\s+[a-zA-Z_]/g);
  metrics.varKeywordCount = varCount;
  if (varCount > 0) {
    const varLocs = grepLines(files, /\bvar\s+[a-zA-Z_]/, dir);
    issues.push(makeIssue(varCount > 10 ? 'major' : 'minor',
      `${varCount} \`var\` declaration(s) found — use \`const\` or \`let\``,
      `\`var\` is function-scoped and hoisted, causing subtle bugs. Found ${varCount} usage(s).`,
      'Replace all \`var\` with \`const\` (preferred) or \`let\`. Use \`const\` when the binding does not change.',
      '`var` leaks into function scope and is subject to hoisting, making code harder to reason about.',
      varLocs));
  }

  // Single-letter variable names outside loop counters
  const singleLetterVars = grepCount(files, /(?:const|let|var)\s+([a-wyzA-WYZ])\s*=/g);
  metrics.singleLetterVarCount = singleLetterVars;
  if (singleLetterVars > 3) {
    const singleLetterLocs = grepLines(files, /(?:const|let|var)\s+[a-wyzA-WYZ]\s*=/, dir);
    issues.push(makeIssue('minor',
      `${singleLetterVars} single-letter variable name(s) detected`,
      'Short variable names like \`a\`, \`b\`, \`x\` reduce code readability.',
      'Use descriptive names: \`userCount\` instead of \`n\`, \`errorMessage\` instead of \`e\`.',
      'Unintelligible names increase onboarding time and introduce bugs during maintenance.',
      singleLetterLocs));
  }

  // TypeScript: `any` type usage
  if (framework !== 'html') {
    const anyTypeCount = grepCount(files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')),
      /:\s*any\b|as\s+any\b/g);
    metrics.tsAnyTypeCount = anyTypeCount;
    if (anyTypeCount > 5) {
      const tsAnyFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      const anyTypeLocs = grepLines(tsAnyFiles, /:\s*any\b|as\s+any\b/, dir);
      issues.push(makeIssue(anyTypeCount > 20 ? 'major' : 'minor',
        `${anyTypeCount} \`any\` type usage(s) in TypeScript`,
        `\`any\` disables TypeScript's type checking. Found ${anyTypeCount} explicit usage(s).`,
        'Replace \`any\` with proper types, generics, or \`unknown\`. Use \`// eslint-disable-next-line @typescript-eslint/no-explicit-any\` only when truly unavoidable.',
        'Excessive \`any\` negates the safety benefits of TypeScript.',
        anyTypeLocs));
    }
  }

  // Long lines (>120 chars) — sample first 20 files
  let longLineCount = 0;
  for (const f of files.slice(0, 20)) {
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      longLineCount += lines.filter(l => l.length > 120 && !l.trimStart().startsWith('//')).length;
    } catch { /* skip */ }
  }
  metrics.longLineCount = longLineCount;
  if (longLineCount > 30) {
    issues.push(makeIssue('minor',
      `${longLineCount} line(s) exceeding 120 characters`,
      'Long lines reduce readability and require horizontal scrolling.',
      'Configure your formatter (Prettier) to enforce a max line width of 100–120 characters.',
      'Overly long lines are difficult to read in split-editor views and code reviews.'));
  }

  // Deep nesting (5+ levels of braces) — sample files
  let deepNestCount = 0;
  for (const f of files.slice(0, 20)) {
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n');
      for (const line of lines) {
        const depth = (line.match(/^\s*/)?.[0].length ?? 0) / 2;
        if (depth >= 5 && line.trim().length > 0) deepNestCount++;
      }
    } catch { /* skip */ }
  }
  metrics.deepNestingLines = deepNestCount;
  if (deepNestCount > 20) {
    issues.push(makeIssue('minor',
      `${deepNestCount} deeply nested line(s) detected (≥5 levels)`,
      'Deeply nested code is hard to read, test, and maintain.',
      'Refactor deep nesting using early returns, guard clauses, extracted functions, or Promise chains.',
      'Deep nesting forces readers to track multiple levels of context simultaneously.'));
  }

  // Commented-out code blocks
  const commentedCode = grepCount(files,
    /^\s*\/\/\s*(const|let|var|function|if|return|import|export|class|for|while)\b/gm);
  metrics.commentedOutCodeLines = commentedCode;
  if (commentedCode > 10) {
    const commentedLocs = grepLines(files, /^\s*\/\/\s*(const|let|var|function|if|return|import|export|class|for|while)\b/, dir);
    issues.push(makeIssue('minor',
      `${commentedCode} line(s) of commented-out code found`,
      'Commented-out code clutters the codebase and is better tracked in version control.',
      'Delete commented-out code. Use git history to recover removed code if needed.',
      'Dead code reduces readability and causes confusion about whether it is intentional.',
      commentedLocs));
  }

  // Magic numbers — count UNIQUE values, not occurrences
  const uniqueMagicNumbers = new Set<string>();
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf-8');
      const matches = content.match(/(?<![a-zA-Z'"`])([2-9]\d{2,}|\d{4,})(?!\s*px|\s*ms|\s*%|[a-zA-Z])/g) || [];
      matches.forEach(m => uniqueMagicNumbers.add(m.trim()));
    } catch { /* skip */ }
  }
  const magicNumbers = uniqueMagicNumbers.size;
  metrics.magicNumberCount = magicNumbers;
  if (magicNumbers > 10) {
    issues.push(makeIssue('minor',
      `${magicNumbers} unique magic number(s) detected`,
      'Numeric literals scattered in logic are hard to understand and maintain.',
      'Extract magic numbers into named constants: `const MAX_RETRY_COUNT = 3;`',
      'Magic numbers make it impossible to understand the intent of a value without context.'));
  }
}

function checkPhpNaming(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const files = walkFiles(dir, ['.php']);
  if (files.length === 0) return;

  // Short variable names ($a, $x etc. — not $i/$j loop counters)
  const shortVarCount = grepCount(files, /\$[a-wyzA-WYZ]\s*[=;,)]/g);
  metrics.phpShortVarCount = shortVarCount;
  if (shortVarCount > 5) {
    const shortVarLocs = grepLines(files, /\$[a-wyzA-WYZ]\s*[=;,)]/, dir);
    issues.push(makeIssue('minor',
      `${shortVarCount} short PHP variable name(s) detected`,
      'Single-letter variables like \`$a\`, \`$x\` hurt readability.',
      'Use descriptive names: \`$userCount\`, \`$productId\`, \`$errorMessage\`.',
      'Unintelligible variable names slow down code review and increase bug risk.',
      shortVarLocs));
  }

  // Missing PHP type hints (PHP 7+)
  const functionDefs  = grepCount(files, /^\s*(?:public|protected|private)?\s*function\s+\w+\s*\(/gm);
  const typedFunctions = grepCount(files, /\)\s*:\s*(?:string|int|float|bool|array|void|self|static|\?)/g);
  metrics.phpFunctionCount = functionDefs;
  metrics.phpTypedFunctionCount = typedFunctions;

  if (functionDefs > 5 && typedFunctions / functionDefs < 0.3) {
    issues.push(makeIssue('minor',
      'Less than 30% of PHP functions have return type hints',
      `${functionDefs} functions found, only ~${typedFunctions} have return types.`,
      'Add return type declarations to all functions (PHP 7+): \`function getUser(int $id): ?User\`',
      'Type hints catch type mismatches at call time and serve as inline documentation.'));
  }

  // Commented-out code
  const commentedCode = grepCount(files,
    /^\s*\/\/\s*(function|class|if|return|\$\w+\s*=|echo|foreach|while)\b/gm);
  metrics.phpCommentedOutCode = commentedCode;
  if (commentedCode > 8) {
    issues.push(makeIssue('minor',
      `${commentedCode} line(s) of commented-out PHP code`,
      'Commented-out code is clutter; version control tracks history.',
      'Delete commented-out code and rely on git to recover it if needed.',
      'Dead code confuses readers and inflates file sizes.'));
  }

  // Deep nesting
  let deepNest = 0;
  for (const f of files.slice(0, 20)) {
    try {
      for (const line of fs.readFileSync(f, 'utf-8').split('\n')) {
        const depth = (line.match(/^\s*/)?.[0].length ?? 0) / 4;
        if (depth >= 5 && line.trim().length > 0) deepNest++;
      }
    } catch { /* skip */ }
  }
  metrics.phpDeepNestingLines = deepNest;
  if (deepNest > 15) {
    issues.push(makeIssue('minor',
      `${deepNest} deeply nested line(s) in PHP files (≥5 levels)`,
      'Deeply nested PHP code is a maintenance and readability hazard.',
      'Apply early returns and extract helper methods to flatten nesting.',
      'Deep nesting is a strong indicator of code that violates the Single Responsibility Principle.'));
  }

  // PSR-12: class names PascalCase (sample check)
  const snakeCaseClasses = grepCount(files, /^\s*class\s+[a-z][a-z_]+\s*[{(]/gm);
  if (snakeCaseClasses > 0) {
    issues.push(makeIssue('minor',
      `${snakeCaseClasses} class name(s) not following PascalCase (PSR-12)`,
      'PSR-12 requires class names to use PascalCase (StudlyCase).',
      'Rename classes to PascalCase: \`user_profile\` → \`UserProfile\`.',
      'Inconsistent naming violates PSR-12 and makes class usage harder to locate.'));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — File structure & architecture
// ══════════════════════════════════════════════════════════════════════════════

function checkFileStructure(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  if (framework === 'wordpress')   checkWordPressStructure(dir, issues, metrics);
  else if (framework === 'laravel') checkLaravelStructure(dir, issues, metrics);
  else if (framework === 'codeigniter') checkCodeIgniterStructure(dir, issues, metrics);
  else if (['nextjs', 'react'].includes(framework)) checkReactStructure(dir, framework, issues, metrics);
  else if (framework === 'vue')    checkVueStructure(dir, issues, metrics);
  else checkGenericStructure(dir, issues, metrics);
}

function checkWordPressStructure(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const phpFiles = walkFiles(dir, ['.php']);

  // Hooks vs core modification
  const addActionCount = grepCount(phpFiles, /\badd_action\s*\(|add_filter\s*\(/g);
  const removeCoreFiles = phpFiles.filter(f =>
    f.includes('wp-admin') || f.includes('wp-includes')).length;

  metrics.wpHookCount = addActionCount;
  metrics.wpCoreModified = removeCoreFiles;

  if (addActionCount === 0 && phpFiles.length > 3) {
    issues.push(makeIssue('major',
      'No WordPress hooks (add_action / add_filter) found',
      'WordPress extensions should use the hooks API rather than modifying files directly.',
      'Use add_action() and add_filter() to extend WordPress functionality without touching core files.',
      'Direct core modifications are overwritten on every WordPress update.'));
  }

  if (removeCoreFiles > 0) {
    issues.push(makeIssue('critical',
      `${removeCoreFiles} file(s) found inside wp-admin or wp-includes`,
      'Core WordPress directories should never be modified.',
      'Move custom code to a plugin (wp-content/plugins/) or theme (wp-content/themes/).',
      'Core file modifications break on every WordPress update and cause security risks.'));
  }

  // wp_enqueue_scripts for assets
  const enqueue = grepAny(phpFiles, /wp_enqueue_scripts|wp_enqueue_styles|wp_enqueue_style\s*\(|wp_enqueue_script\s*\(/);
  metrics.wpUsesEnqueue = enqueue;
  if (!enqueue) {
    issues.push(makeIssue('major',
      'No wp_enqueue_scripts/wp_enqueue_styles usage detected',
      'Assets should be registered via the WordPress enqueue API, not hardcoded with <link>/<script> tags.',
      'Use wp_enqueue_style() and wp_enqueue_script() inside a function hooked to wp_enqueue_scripts action.',
      'Hardcoded asset tags bypass WordPress dependency management and can cause script conflicts.'));
  }

  // Template hierarchy
  const templateFiles = phpFiles.filter(f =>
    /\/(single|archive|page|index|header|footer|sidebar|404|search|category)\.php$/.test(f));
  metrics.wpTemplateFileCount = templateFiles.length;

  // Plugin structure: main plugin file
  const rootPhpFiles = fs.readdirSync(dir).filter(f => f.endsWith('.php') && !f.startsWith('.'));
  const hasMainPluginFile = rootPhpFiles.some(f => {
    try { return fs.readFileSync(path.join(dir, f), 'utf-8').includes('Plugin Name:'); } catch { return false; }
  });
  metrics.wpHasMainPluginFile = hasMainPluginFile;

  // includes/ or src/ subdirectory
  const hasIncludesDir = fs.existsSync(path.join(dir, 'includes')) || fs.existsSync(path.join(dir, 'src'));
  metrics.wpHasIncludesDir = hasIncludesDir;
  if (!hasIncludesDir && phpFiles.length > 5) {
    issues.push(makeIssue('minor',
      'No includes/ or src/ directory — all code in root',
      'Placing all PHP files in the plugin root creates a flat, hard-to-navigate structure.',
      'Organise code into includes/ (or src/): includes/class-admin.php, includes/class-public.php, etc.',
      'Flat file structures become unmanageable as a plugin grows.'));
  }
}

function checkLaravelStructure(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  // MVC directories
  const hasModels       = fs.existsSync(path.join(dir, 'app', 'Models'));
  const hasControllers  = fs.existsSync(path.join(dir, 'app', 'Http', 'Controllers'));
  const hasRequests     = fs.existsSync(path.join(dir, 'app', 'Http', 'Requests'));
  const hasServices     = fs.existsSync(path.join(dir, 'app', 'Services'));
  const hasRepositories = fs.existsSync(path.join(dir, 'app', 'Repositories'));
  const hasEvents       = fs.existsSync(path.join(dir, 'app', 'Events'));
  const hasJobs         = fs.existsSync(path.join(dir, 'app', 'Jobs'));

  metrics.laravelHasModels      = hasModels;
  metrics.laravelHasControllers = hasControllers;
  metrics.laravelHasRequests    = hasRequests;
  metrics.laravelHasServices    = hasServices;

  if (!hasModels) {
    issues.push(makeIssue('major',
      'No app/Models directory found',
      'Laravel 8+ stores Eloquent models in app/Models/.',
      'Move all Eloquent models to app/Models/ and update namespaces.',
      'Models scattered in app/ root make the codebase hard to navigate.'));
  }

  if (!hasRequests) {
    // Check if there are controllers with inline validation
    const phpFiles = walkFiles(path.join(dir, 'app'), ['.php']);
    const inlineValidate = grepCount(phpFiles, /\$request\s*->\s*validate\s*\(/g);
    metrics.laravelInlineValidationCount = inlineValidate;

    if (inlineValidate > 3) {
      issues.push(makeIssue('minor',
        `${inlineValidate} inline \$request->validate() call(s) — consider Form Requests`,
        'Inline validation in controllers mixes concerns and cannot be reused.',
        'Extract validation rules into dedicated Form Request classes in app/Http/Requests/.',
        'Form Request classes centralise validation, enable reuse, and keep controllers thin.'));
    }
  }

  if (!hasServices && hasControllers) {
    const controllerFiles = walkFiles(path.join(dir, 'app', 'Http', 'Controllers'), ['.php']);
    let fatControllerLines = 0;
    for (const f of controllerFiles) {
      try {
        const lines = fs.readFileSync(f, 'utf-8').split('\n').length;
        if (lines > 150) fatControllerLines++;
      } catch { /* skip */ }
    }
    metrics.laravelFatControllers = fatControllerLines;

    if (fatControllerLines > 0) {
      issues.push(makeIssue('minor',
        `${fatControllerLines} controller(s) over 150 lines — consider a Service layer`,
        'Fat controllers mix business logic with HTTP handling.',
        'Extract business logic into Service classes (app/Services/) and inject them via the controller constructor.',
        'Thin controllers are easier to test and reuse across CLI commands and queued jobs.'));
    }
  }

  // Routes file size
  const routeFiles = ['routes/web.php', 'routes/api.php'].map(r => path.join(dir, r)).filter(fs.existsSync);
  for (const rf of routeFiles) {
    try {
      const lines = fs.readFileSync(rf, 'utf-8').split('\n').length;
      if (lines > 200) {
        issues.push(makeIssue('minor',
          `${path.basename(rf)} has ${lines} lines — consider splitting into route groups`,
          'Large route files are hard to navigate.',
          'Split routes into separate files by domain (routes/admin.php, routes/auth.php) and include them.',
          'Monolithic route files become unmanageable in large applications.'));
      }
    } catch { /* skip */ }
  }
}

function checkCodeIgniterStructure(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  // CI4: app/Controllers, app/Models, app/Views
  const ci4Controllers = fs.existsSync(path.join(dir, 'app', 'Controllers'));
  const ci4Models      = fs.existsSync(path.join(dir, 'app', 'Models'));
  const ci4Views       = fs.existsSync(path.join(dir, 'app', 'Views'));
  // CI3: application/controllers, application/models, application/views
  const ci3Controllers = fs.existsSync(path.join(dir, 'application', 'controllers'));
  const ci3Models      = fs.existsSync(path.join(dir, 'application', 'models'));

  const isCi4 = ci4Controllers;
  metrics.ciVersion     = isCi4 ? 4 : 3;
  metrics.ciHasMVC      = isCi4 ? (ci4Controllers && ci4Models && ci4Views) : (ci3Controllers && ci3Models);

  if (!metrics.ciHasMVC) {
    issues.push(makeIssue('major',
      'CodeIgniter MVC structure not found',
      `Expected ${isCi4 ? 'app/Controllers, app/Models, app/Views' : 'application/controllers, application/models, application/views'} directories.`,
      'Ensure your CodeIgniter project follows the standard MVC directory layout.',
      'Non-standard structure breaks CodeIgniter\'s autoloading and makes the project hard to maintain.'));
  }

  if (isCi4) {
    const phpFiles = walkFiles(path.join(dir, 'app', 'Controllers'), ['.php']);
    const hasBaseController = grepAny(phpFiles, /extends\s+BaseController/);
    metrics.ciUsesBaseController = hasBaseController;
  }
}

function checkReactStructure(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const srcDir = path.join(dir, 'src');
  const appDir = path.join(dir, 'app'); // Next.js 13+ App Router

  const hasComponents = fs.existsSync(path.join(srcDir, 'components')) ||
                        fs.existsSync(path.join(appDir, 'components')) ||
                        fs.existsSync(path.join(dir, 'components'));
  const hasHooks      = fs.existsSync(path.join(srcDir, 'hooks')) ||
                        fs.existsSync(path.join(dir, 'hooks'));
  const hasUtils      = fs.existsSync(path.join(srcDir, 'utils')) ||
                        fs.existsSync(path.join(srcDir, 'lib')) ||
                        fs.existsSync(path.join(dir, 'lib'));
  const hasServices   = fs.existsSync(path.join(srcDir, 'services')) ||
                        fs.existsSync(path.join(srcDir, 'api')) ||
                        fs.existsSync(path.join(dir, 'services'));

  metrics.reactHasComponents = hasComponents;
  metrics.reactHasHooks      = hasHooks;
  metrics.reactHasUtils      = hasUtils;
  metrics.reactHasServices   = hasServices;

  if (!hasComponents) {
    issues.push(makeIssue('minor',
      'No components/ directory found',
      'React/Next.js projects should organise reusable UI into a components/ directory.',
      'Create src/components/ and group related components into sub-folders (Button/, Modal/, etc.).',
      'Flat file layouts make components hard to find and reuse.'));
  }

  if (!hasHooks) {
    const jsxFiles = walkFiles(srcDir.length && fs.existsSync(srcDir) ? srcDir : dir,
      ['.ts', '.tsx', '.js', '.jsx'], ['node_modules', '.git', 'dist', '.next']);
    const customHooks = grepCount(jsxFiles, /export\s+(?:default\s+)?function\s+use[A-Z]/g);
    metrics.reactCustomHookCount = customHooks;
    if (customHooks > 2) {
      issues.push(makeIssue('minor',
        `${customHooks} custom hook(s) found but no hooks/ directory`,
        'Custom hooks are scattered across the codebase.',
        'Centralise all custom hooks in a src/hooks/ directory for discoverability.',
        'Scattered hooks are harder to find, reuse, and test.'));
    }
  }

  if (!hasServices) {
    const allFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx'],
      ['node_modules', '.git', 'dist', '.next', 'out']);
    const apiCallsInComponents = grepCount(allFiles, /fetch\s*\(|axios\s*\.|useQuery\s*\(/g);
    metrics.directApiCallCount = apiCallsInComponents;
    if (apiCallsInComponents > 5) {
      issues.push(makeIssue('minor',
        `${apiCallsInComponents} direct API call(s) — consider a services/ layer`,
        'API calls scattered across components mix data-fetching with presentation concerns.',
        'Extract API calls into src/services/ or src/api/ modules and import them in components.',
        'A dedicated API layer makes mocking, error handling, and URL changes much easier.'));
    }
  }

  // Next.js: check for pages/ vs app/ mixing
  if (framework === 'nextjs') {
    const hasPagesDir = fs.existsSync(path.join(dir, 'pages'));
    const hasAppDir   = fs.existsSync(path.join(dir, 'app'));
    metrics.nextjsUsesPagesRouter = hasPagesDir;
    metrics.nextjsUsesAppRouter   = hasAppDir;
    if (hasPagesDir && hasAppDir) {
      issues.push(makeIssue('minor',
        'Both pages/ and app/ directories found — mixed Next.js routing',
        'Mixing the Pages Router and App Router increases complexity.',
        'Migrate fully to the App Router (Next.js 13+) and remove the pages/ directory when possible.',
        'Mixed routers make it harder to reason about rendering strategies and data fetching patterns.'));
    }
  }
}

function checkVueStructure(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const srcDir = path.join(dir, 'src');
  if (!fs.existsSync(srcDir)) return;

  const hasComponents = fs.existsSync(path.join(srcDir, 'components'));
  const hasViews      = fs.existsSync(path.join(srcDir, 'views')) || fs.existsSync(path.join(srcDir, 'pages'));
  const hasStore      = fs.existsSync(path.join(srcDir, 'store')) || fs.existsSync(path.join(srcDir, 'stores'));
  const hasComposables = fs.existsSync(path.join(srcDir, 'composables'));

  metrics.vueHasComponents  = hasComponents;
  metrics.vueHasViews       = hasViews;
  metrics.vueHasStore       = hasStore;
  metrics.vueHasComposables = hasComposables;

  if (!hasComponents) {
    issues.push(makeIssue('minor',
      'No src/components/ directory found',
      'Vue projects should separate page-level components (views/) from reusable components (components/).',
      'Create src/components/ for reusable UI and src/views/ (or src/pages/) for route-level components.',
      'Without this separation, components become hard to distinguish from pages.'));
  }

  const vueFiles = walkFiles(srcDir, ['.vue']);
  const optionsApiCount = grepCount(vueFiles, /export\s+default\s*\{/g);
  const compositionApiCount = grepCount(vueFiles, /setup\s*\(\)|<script\s+setup/g);
  metrics.vueOptionsApiCount     = optionsApiCount;
  metrics.vueCompositionApiCount = compositionApiCount;

  if (optionsApiCount > compositionApiCount && vueFiles.length > 5) {
    issues.push(makeIssue('suggestion',
      'Most components use Options API — consider Composition API',
      `${optionsApiCount} Options API components vs ${compositionApiCount} Composition API components.`,
      'Vue 3 recommends the Composition API with <script setup> for better TypeScript support and reusability.',
      'Options API components are harder to share logic between and less amenable to TypeScript inference.'));
  }
}

function checkGenericStructure(
  dir: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  // Monolithic files
  const allFiles = walkFiles(dir, ['.js', '.ts', '.php', '.html'],
    ['node_modules', '.git', 'dist', 'build', 'vendor']);
  let monolithicCount = 0;
  for (const f of allFiles) {
    try {
      if (fs.readFileSync(f, 'utf-8').split('\n').length > 500) monolithicCount++;
    } catch { /* skip */ }
  }
  metrics.monolithicFileCount = monolithicCount;

  if (monolithicCount > 0) {
    issues.push(makeIssue('minor',
      `${monolithicCount} file(s) over 500 lines`,
      'Large files are a sign of insufficient separation of concerns.',
      'Break large files into smaller, focused modules. Aim for files under 200–300 lines.',
      'Large files are difficult to navigate, test, and code-review.'));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Performance anti-patterns in code
// ══════════════════════════════════════════════════════════════════════════════

function checkPerformancePatterns(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const isPhp = PHP_FRAMEWORKS.includes(framework);
  if (isPhp) checkPhpPerformance(dir, framework, issues, metrics);
  else checkJsPerformance(dir, framework, issues, metrics);
}

function checkJsPerformance(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const files = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx', '.vue'],
    ['node_modules', '.git', 'dist', 'build', '.next', 'out']);
  if (files.length === 0) return;

  // Missing key prop in list renders (React/Vue)
  if (['react', 'nextjs', 'vue'].includes(framework)) {
    const mapWithoutKey = grepCount(files,
      /\.map\s*\(\s*[^)]+\)\s*=>\s*(?:\(?\s*<(?!.*\bkey\b)[A-Za-z][^>]*>)/g);
    metrics.missingKeyPropCount = mapWithoutKey;
    if (mapWithoutKey > 0) {
      issues.push(makeIssue('major',
        `${mapWithoutKey} list render(s) potentially missing \`key\` prop`,
        'React and Vue require a unique `key` prop on list items to optimise reconciliation.',
        'Add a stable, unique key: {items.map(item => <Component key={item.id} />)}',
        'Missing keys cause unnecessary re-renders and subtle UI bugs when list order changes.'));
    }
  }

  // Inline object/array creation in JSX props (forces re-render every render)
  if (['react', 'nextjs'].includes(framework)) {
    const inlineObjects = grepCount(files, /(?:style|className|(?:on[A-Z]\w+))\s*=\s*\{\s*\{/g);
    metrics.inlineObjectPropsCount = inlineObjects;
    if (inlineObjects > 5) {
      issues.push(makeIssue('minor',
        `${inlineObjects} inline object prop(s) in JSX — causes unnecessary re-renders`,
        'Inline objects like style={{ color: "red" }} create a new reference on every render.',
        'Move constant objects outside the component or memoize with useMemo. Use Tailwind/CSS classes instead of inline styles.',
        'Inline object props break React\'s shallow equality check, causing child re-renders even when data hasn\'t changed.'));
    }

    // useEffect with empty dep array but function reference (missing dep)
    const asyncInUseEffect = grepCount(files, /useEffect\s*\(\s*async\s*\(/g);
    metrics.asyncUseEffectCount = asyncInUseEffect;
    if (asyncInUseEffect > 0) {
      issues.push(makeIssue('minor',
        `${asyncInUseEffect} async function(s) passed directly to useEffect`,
        'useEffect does not support async callbacks directly — the returned Promise is ignored, masking cleanup.',
        'Define the async function inside useEffect and call it: useEffect(() => { const load = async () => { ... }; load(); }, [])',
        'Async useEffect can cause race conditions and memory leaks from unresolved Promises after unmount.'));
    }
  }

  // Large barrel imports (import * from lodash, moment etc.)
  const heavyImports = grepCount(files,
    /import\s+[^{]\s*\*?\s*(?:as\s+\w+\s+)?from\s+['"](?:lodash|moment|underscore)['"]/g);
  metrics.heavyLibraryImports = heavyImports;
  if (heavyImports > 0) {
    issues.push(makeIssue('minor',
      `${heavyImports} full library import(s) detected (lodash/moment/underscore)`,
      'Importing an entire library adds all its code to the bundle, even unused parts.',
      'Import only what you need: \`import debounce from "lodash/debounce"\` or use native alternatives (date-fns instead of moment, native Array methods instead of lodash).',
      'Full library imports can add 50–300 KB to your bundle, increasing load times.'));
  }

  // Synchronous localStorage in component render path
  const syncLocalStorage = grepCount(files,
    /(?:const|let|var)\s+\w+\s*=\s*localStorage\.getItem\s*\(/g);
  metrics.syncLocalStorageCount = syncLocalStorage;
  if (syncLocalStorage > 3) {
    issues.push(makeIssue('minor',
      `${syncLocalStorage} synchronous localStorage.getItem() call(s) in component files`,
      'Synchronous localStorage access on the render path can cause hydration mismatches in SSR.',
      'Wrap localStorage access in useEffect or a custom hook that runs only on the client.',
      'Synchronous storage reads block the main thread and cause server/client HTML mismatches in Next.js.'));
  }
}

function checkPhpPerformance(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const phpFiles = walkFiles(dir, ['.php']);
  if (phpFiles.length === 0) return;

  // SELECT * queries
  const selectStarCount = grepCount(phpFiles, /SELECT\s+\*\s+FROM/gi);
  metrics.selectStarCount = selectStarCount;
  if (selectStarCount > 0) {
    issues.push(makeIssue('minor',
      `${selectStarCount} SELECT * quer${selectStarCount === 1 ? 'y' : 'ies'} found`,
      'SELECT * fetches all columns including large blobs, wasting memory and I/O.',
      'Specify only the columns you need: SELECT id, name, email FROM users.',
      'SELECT * queries over-fetch data and prevent the database from using covering indexes.'));
  }

  // N+1 pattern: queries inside loops
  const queryInLoop = grepCount(phpFiles,
    /(?:for(?:each)?|while)\s*\([^{]+\)\s*\{[^}]*(?:\$wpdb->|mysql_query|mysqli_query|->get\(|->find\()/gs);
  metrics.queryInLoopCount = queryInLoop;
  if (queryInLoop > 0) {
    issues.push(makeIssue('major',
      `${queryInLoop} potential N+1 quer${queryInLoop === 1 ? 'y' : 'ies'} — database call inside a loop`,
      'Running a database query on every loop iteration scales linearly with data volume.',
      framework === 'laravel'
        ? 'Use Eager Loading: User::with("posts")->get() instead of loading relationships in a loop.'
        : 'Fetch all needed data in a single query before the loop, or use JOINs.',
      'N+1 queries are the most common PHP performance issue and can cause 100s of queries per page load.'));
  }

  // WordPress: wp_query / get_posts inside a loop
  if (framework === 'wordpress') {
    const wpQueryInLoop = grepCount(phpFiles,
      /(?:foreach|while)\s*\([^{]+\)\s*\{[^}]*(?:new\s+WP_Query|get_posts\s*\()/gs);
    metrics.wpQueryInLoopCount = wpQueryInLoop;
    if (wpQueryInLoop > 0) {
      issues.push(makeIssue('major',
        `${wpQueryInLoop} WP_Query / get_posts() call(s) inside a loop`,
        'Running WP_Query on every loop iteration is an N+1 problem.',
        'Fetch all posts in a single WP_Query before the loop, or use the main query and wp_reset_postdata().',
        'Multiple WP_Query calls per request dramatically slow page rendering for sites with many posts.'));
    }
  }

  // Missing output buffering for large HTML generation
  const echoInLoop = grepCount(phpFiles,
    /(?:for(?:each)?|while)\s*\([^{]+\)\s*\{[^}]*echo\s/gs);
  metrics.echoInLoopCount = echoInLoop;
  if (echoInLoop > 3) {
    issues.push(makeIssue('suggestion',
      `${echoInLoop} echo statement(s) inside loops`,
      'Echoing inside loops can flush output incrementally; output buffering is more efficient.',
      'Consider building strings and echoing once, or use output buffering (ob_start/ob_get_clean).',
      'Many small echo calls generate more HTTP overhead than a single buffered response.'));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Accessibility in code (static analysis)
// ══════════════════════════════════════════════════════════════════════════════

function checkAccessibilityInCode(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const isPhp = PHP_FRAMEWORKS.includes(framework);
  const extensions = isPhp
    ? ['.php', '.html']
    : ['.tsx', '.jsx', '.vue', '.html', '.js'];

  const files = walkFiles(dir, extensions, ['node_modules', '.git', 'dist', 'build', '.next', 'out']);
  if (files.length === 0) return;

  // ── Images without alt text ────────────────────────────────────────────────
  // HTML/PHP: <img without alt= anywhere in the tag (lookahead scans whole tag from <img)
  const imgNoAlt = grepCount(files,
    /<img\b(?![^>]*\balt\s*=)[^>]*>/gi);
  // React/JSX self-closing: <img without alt=
  const imgNoAltJsx = grepCount(files,
    /<img\b(?![^/\n]*\balt\s*=)[^/\n]*\/>/gi);
  const totalImgNoAlt = imgNoAlt + imgNoAltJsx;
  metrics.a11yImgNoAlt = totalImgNoAlt;

  if (totalImgNoAlt > 0) {
    const imgNoAltLocs = grepLines(files, /<img\b(?![^>\n]*\balt\s*=)[^>\n]*>/, dir);
    issues.push(makeIssue('critical',
      `${totalImgNoAlt} <img> element(s) missing \`alt\` attribute`,
      'Images without alt text are invisible to screen readers (WCAG 1.1.1 — Level A).',
      'Add descriptive alt text to informative images: alt="product photo showing blue sneakers". Use alt="" for decorative images.',
      'Missing alt text fails WCAG 1.1.1 and blocks access for blind and visually impaired users.',
      imgNoAltLocs));
  }

  // ── Buttons without accessible names ──────────────────────────────────────
  // HTML: <button></button> or <button> with only icon child
  const emptyButtons = grepCount(files, /<button[^>]*>\s*<\/button>/gi);
  metrics.a11yEmptyButtons = emptyButtons;
  if (emptyButtons > 0) {
    const emptyBtnLocs = grepLines(files, /<button[^>]*>\s*<\/button>/, dir);
    issues.push(makeIssue('critical',
      `${emptyButtons} empty <button> element(s)`,
      'Buttons with no text content or aria-label are inaccessible to screen readers (WCAG 4.1.2).',
      'Add visible text, aria-label, or aria-labelledby to every button.',
      'Screen reader users cannot determine the button\'s purpose without an accessible name.',
      emptyBtnLocs));
  }

  // ── Links without text ────────────────────────────────────────────────────
  const emptyLinks = grepCount(files, /<a\b[^>]*>\s*<\/a>|<a\b[^>]*>\s*<img\b(?=[^>]*)(?![^>]*\balt\b)[^>]*>/gi);
  metrics.a11yEmptyLinks = emptyLinks;
  if (emptyLinks > 0) {
    const emptyLinkLocs = grepLines(files, /<a\b[^>]*>\s*<\/a>/, dir);
    issues.push(makeIssue('major',
      `${emptyLinks} link(s) without accessible text`,
      'Links must have discernible text (WCAG 2.4.4). Empty links or icon-only links without aria-label are inaccessible.',
      'Add text content or aria-label to every link. For icon links: <a href="..." aria-label="Go to homepage">',
      'Screen readers announce link purpose from their text; empty links provide no navigation information.',
      emptyLinkLocs));
  }

  // ── Form inputs without labels ────────────────────────────────────────────
  const inputNoLabel = grepCount(files,
    /<input(?=[^>]*\btype\b)(?=[^>]*(?:text|email|password|number|tel|search))[^>]*(?!\baria-label\b)(?!\baria-labelledby\b)[^>]*>/gi);
  metrics.a11yInputNoLabel = inputNoLabel;
  if (inputNoLabel > 0) {
    issues.push(makeIssue('major',
      `${inputNoLabel} form input(s) potentially missing labels`,
      'Form inputs must be associated with labels (WCAG 1.3.1, 3.3.2).',
      'Use <label for="inputId"> or add aria-label/aria-labelledby to each input.',
      'Unlabelled inputs prevent screen reader users from identifying what data to enter.'));
  }

  // ── Missing lang attribute on <html> ─────────────────────────────────────
  const htmlNoLang = grepCount(files,
    /<html(?![^>]*\blang\b)[^>]*>/gi);
  metrics.a11yHtmlNoLang = htmlNoLang;
  if (htmlNoLang > 0) {
    issues.push(makeIssue('major',
      `${htmlNoLang} <html> element(s) missing \`lang\` attribute`,
      'The lang attribute on <html> tells assistive technologies which language to use (WCAG 3.1.1 — Level A).',
      'Add a lang attribute: <html lang="en">',
      'Missing lang causes screen readers to use incorrect pronunciation, making content unintelligible.'));
  }

  // ── Non-semantic click handlers (div/span with onClick) ──────────────────
  const divOnClick = grepCount(files,
    /<(?:div|span)[^>]*(?:onClick|onclick)\s*=/gi);
  metrics.a11yDivOnClickCount = divOnClick;
  if (divOnClick > 2) {
    const divClickLocs = grepLines(files, /<(?:div|span)[^>]*(?:onClick|onclick)\s*=/, dir);
    issues.push(makeIssue('major',
      `${divOnClick} \`<div>\`/\`<span>\` element(s) with click handlers`,
      'Div and span are not keyboard-accessible by default. Click-only elements exclude keyboard-only users (WCAG 2.1.1).',
      'Replace clickable divs/spans with <button> (for actions) or <a> (for navigation). If a div must be clickable, add role="button", tabIndex={0}, and keyboard event handlers.',
      'Non-interactive elements with click handlers break keyboard navigation and screen reader interaction.',
      divClickLocs));
  }

  // ── ARIA roles on incorrect elements ─────────────────────────────────────
  const invalidAriaRoles = grepCount(files,
    /<(?:span|p|div)[^>]*\brole\s*=\s*["'](?:button|link|checkbox|menuitem)["'][^>]*(?!tabindex|tabIndex)/gi);
  metrics.a11yMissingTabIndex = invalidAriaRoles;
  if (invalidAriaRoles > 0) {
    issues.push(makeIssue('minor',
      `${invalidAriaRoles} element(s) with interactive ARIA role but no tabIndex`,
      'Elements with interactive ARIA roles (button, link) must be keyboard-focusable.',
      'Add tabIndex="0" to elements with role="button" or role="link", and handle keyboard events (Enter, Space).',
      'Without tabIndex, keyboard users cannot reach or activate these elements.'));
  }

  // ── <table> without <caption> or summary ─────────────────────────────────
  const tableNoCaption = grepCount(files,
    /<table(?![^>]*\bsummary\b)[^>]*>\s*(?![\s\S]*?<caption\b)/gi);
  metrics.a11yTableNoCaption = tableNoCaption;
  if (tableNoCaption > 0) {
    issues.push(makeIssue('minor',
      `${tableNoCaption} data table(s) without <caption>`,
      'Data tables should have a caption describing their content (WCAG 1.3.1).',
      'Add a <caption> as the first child of <table>: <table><caption>Monthly sales report</caption>...',
      'Without captions, screen reader users cannot quickly determine whether a table is relevant to their task.'));
  }

  // ── WordPress: wp_kses for output ─────────────────────────────────────────
  if (framework === 'wordpress') {
    const phpFiles = walkFiles(dir, ['.php']);
    const wkpKsesCount = grepCount(phpFiles, /wp_kses\s*\(|wp_kses_post\s*\(/g);
    metrics.wpKsesUsage = wkpKsesCount;
  }
}

// ─── 5. MAINTAINABILITY & SCALABILITY ────────────────────────────────────────

function checkMaintainability(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const isPhp = PHP_FRAMEWORKS.includes(framework);
  const isJs  = JS_FRAMEWORKS.includes(framework);

  // ── God files / God classes ────────────────────────────────────────────────
  // Files over 300 lines are a maintainability smell; 600+ is a god file
  const codeExts = isPhp ? ['.php'] : ['.ts', '.tsx', '.js', '.jsx'];
  const allCode = walkFiles(dir, codeExts);
  const godFiles: string[] = [];
  const longFiles: string[] = [];

  for (const f of allCode) {
    try {
      const lines = fs.readFileSync(f, 'utf-8').split('\n').length;
      const rel   = path.relative(dir, f);
      if (lines > 600) godFiles.push(`${rel} (${lines} lines)`);
      else if (lines > 300) longFiles.push(`${rel} (${lines} lines)`);
    } catch { /* skip */ }
  }

  metrics.godFileCount  = godFiles.length;
  metrics.longFileCount = longFiles.length;

  if (godFiles.length > 0) {
    const godFileLocs = godFiles.map(f => f.replace(/ \(\d+ lines\)$/, ''));
    issues.push(makeIssue('critical', `${godFiles.length} god file(s) detected (600+ lines)`,
      `Files over 600 lines are extremely hard to maintain: ${godFiles.slice(0, 3).join(', ')}${godFiles.length > 3 ? '…' : ''}`,
      'Split each god file into smaller, single-responsibility modules or classes.',
      'God files become a merge-conflict hotspot and are nearly impossible to review, test, or hand off to a new developer.',
      godFileLocs));
  } else if (longFiles.length > 2) {
    const longFileLocs = longFiles.map(f => f.replace(/ \(\d+ lines\)$/, ''));
    issues.push(makeIssue('major', `${longFiles.length} large file(s) detected (300–600 lines)`,
      `Files approaching god-file territory: ${longFiles.slice(0, 3).join(', ')}${longFiles.length > 3 ? '…' : ''}`,
      'Refactor large files into focused modules before they grow further.',
      'Large files slow code reviews and make the codebase harder to navigate for new developers.',
      longFileLocs));
  }

  // ── Duplicated logic (copy-paste detection) ───────────────────────────────
  // Detect repeated identical function signatures — a proxy for copy-paste
  if (isJs) {
    const jsTsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    const funcSigs: Record<string, number> = {};
    for (const f of jsTsFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const matches = content.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g) || [];
        for (const m of matches) {
          funcSigs[m] = (funcSigs[m] || 0) + 1;
        }
      } catch { /* skip */ }
    }
    const duplicates = Object.entries(funcSigs).filter(([, c]) => c > 2).map(([name]) => name);
    metrics.duplicateFunctionNames = duplicates.length;
    if (duplicates.length > 3) {
      issues.push(makeIssue('major', `${duplicates.length} duplicate function name(s) across files`,
        `Function names defined in 3+ places suggest copy-pasted logic: ${duplicates.slice(0, 5).join(', ')}`,
        'Extract shared logic into a utility or service module imported by all callers.',
        'Copy-pasted functions diverge over time — bug fixes applied to one copy are missed in others.'));
    }
  }

  if (isPhp) {
    const phpFiles = walkFiles(dir, ['.php']);
    const funcSigs: Record<string, number> = {};
    for (const f of phpFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const matches = content.match(/function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g) || [];
        for (const m of matches) {
          funcSigs[m] = (funcSigs[m] || 0) + 1;
        }
      } catch { /* skip */ }
    }
    const duplicates = Object.entries(funcSigs).filter(([, c]) => c > 2).map(([n]) => n);
    metrics.duplicateFunctionNames = duplicates.length;
    if (duplicates.length > 3) {
      issues.push(makeIssue('major', `${duplicates.length} duplicate function name(s) across PHP files`,
        `Functions defined in 3+ files suggest copy-pasted logic: ${duplicates.slice(0, 5).join(', ')}`,
        'Move shared functions into a helpers/utilities file and require/import it where needed.',
        'Duplicated PHP functions cause inconsistent behaviour when only one copy gets patched.'));
    }
  }

  // ── Hard-coded configuration values ──────────────────────────────────────
  // URLs, ports, IPs, DB names hard-coded in source
  const srcFiles = isJs
    ? walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx'])
    : walkFiles(dir, ['.php']);

  // Hard-coded config — count affected FILES, not occurrences
  const configPattern = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:3306|:5432|:6379|:27017|:8080|:3000)\b/;
  const filesWithHardCodedConfig = srcFiles.filter(f => {
    try { return configPattern.test(fs.readFileSync(f, 'utf-8')); } catch { return false; }
  });
  const hardCodedConfig = filesWithHardCodedConfig.length;
  metrics.hardCodedConfigCount = hardCodedConfig;

  if (hardCodedConfig > 2) {
    const configLocs = grepLines(filesWithHardCodedConfig, /localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{4,5}\b/, dir);
    issues.push(makeIssue('major', `Hard-coded config values found in ${hardCodedConfig} file(s)`,
      `Hostnames, ports, or IPs hard-coded in: ${filesWithHardCodedConfig.map(f => path.basename(f)).slice(0, 4).join(', ')}.`,
      'Move all environment-specific values to .env / config files and reference them via environment variables.',
      'Hard-coded config makes the codebase impossible to deploy to staging/production without modifying source.',
      configLocs));
  }

  // ── Circular dependency indicators (barrel file abuse) ────────────────────
  if (isJs) {
    const indexFiles = walkFiles(dir, ['.ts', '.js']).filter(f =>
      path.basename(f) === 'index.ts' || path.basename(f) === 'index.js');
    let reExportCount = 0;
    for (const f of indexFiles) {
      try {
        const lines = fs.readFileSync(f, 'utf-8').split('\n').filter(l => l.trim().startsWith('export'));
        reExportCount += lines.length;
      } catch { /* skip */ }
    }
    metrics.barrelReExportCount = reExportCount;
    if (reExportCount > 60) {
      issues.push(makeIssue('minor', 'Excessive barrel re-exports detected',
        `${reExportCount} re-exports found across index files — large barrels slow build tools and hide circular deps.`,
        'Break up large barrel files into domain-specific exports. Avoid re-exporting everything from a single index.',
        'Barrel files that grow without bounds cause slow cold-start times and make circular dependency errors hard to trace.'));
    }
  }

  // ── Tight coupling: direct cross-module imports ────────────────────────────
  // Detect files importing from too many sibling directories (>6 unique paths = coupling smell)
  if (isJs) {
    const files = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    let tightlyCoupledFiles = 0;
    for (const f of files) {
      try {
        const content  = fs.readFileSync(f, 'utf-8');
        const imports  = content.match(/from\s+['"](\.\.[/\\][^'"]+)['"]/g) || [];
        const uniqDirs = new Set(imports.map(i => i.replace(/from\s+['"]/, '').replace(/['"]/, '').split('/')[1]));
        if (uniqDirs.size > 6) tightlyCoupledFiles++;
      } catch { /* skip */ }
    }
    metrics.tightlyCoupledFiles = tightlyCoupledFiles;
    if (tightlyCoupledFiles > 2) {
      issues.push(makeIssue('major', `${tightlyCoupledFiles} tightly coupled file(s) detected`,
        'Files importing from 7+ different sibling directories indicate excessive coupling.',
        'Introduce service/façade layers to reduce direct cross-module dependencies.',
        'Tightly coupled files break the moment a module is renamed, moved, or split — multiplying refactoring cost.'));
    }
  }

  // ── Magic strings (inline string literals used as flags/types) ────────────
  if (isJs) {
    const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    // Magic strings — count UNIQUE string values, not occurrences
    const uniqueMagicStrings = new Set<string>();
    for (const f of jsFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const matches = content.match(/===\s*['"][a-z_-]{4,}['"]/g) || [];
        matches.forEach(m => {
          const val = m.match(/['"][a-z_-]{4,}['"]/)?.[0];
          if (val) uniqueMagicStrings.add(val);
        });
      } catch { /* skip */ }
    }
    const magicStrings = uniqueMagicStrings.size;
    metrics.magicStringCount = magicStrings;
    if (magicStrings > 8) {
      const magicStringLocs = grepLines(jsFiles, /===\s*['"][a-z_-]{4,}['"]/, dir);
      issues.push(makeIssue('minor', `${magicStrings} unique magic string(s) used in comparisons`,
        `Hard-coded string literals in equality checks: ${[...uniqueMagicStrings].slice(0, 5).join(', ')}.`,
        'Replace magic strings with TypeScript enums, const maps, or named constants.',
        'Magic strings are invisible to refactor tools — rename one literal and every comparison silently breaks.',
        magicStringLocs));
    }
  }

  // ── Framework-specific maintainability ────────────────────────────────────
  if (framework === 'react' || framework === 'nextjs') {
    const reactFiles = walkFiles(dir, ['.tsx', '.jsx', '.ts', '.js']);

    // Props drilling — count FILES where props.x is accessed heavily, not total accesses
    const filesWithHeavyProps: string[] = [];
    for (const f of reactFiles) {
      try {
        const count = (fs.readFileSync(f, 'utf-8').match(/\bprops\.\w+/g) || []).length;
        if (count > 15) filesWithHeavyProps.push(path.basename(f));
      } catch { /* skip */ }
    }
    metrics.propsAccessCount = filesWithHeavyProps.length;
    if (filesWithHeavyProps.length > 2) {
      issues.push(makeIssue('minor', `Props drilling detected in ${filesWithHeavyProps.length} component(s)`,
        `Components with 15+ direct props accesses: ${filesWithHeavyProps.slice(0, 4).join(', ')}.`,
        'Use React Context, Zustand, or a state management library to share data without prop drilling.',
        'Deep prop drilling makes component refactoring extremely difficult and obscures data flow.'));
    }

    // useEffect with missing/empty dependency arrays
    const effectNoDeps = grepCount(reactFiles, /useEffect\s*\(\s*\(\s*\)\s*=>/g);
    metrics.useEffectNoDepsCount = effectNoDeps;
    if (effectNoDeps > 3) {
      const effectLocs = grepLines(reactFiles, /useEffect\s*\(\s*\(\s*\)\s*=>/, dir);
      issues.push(makeIssue('minor', `${effectNoDeps} useEffect(s) with no dependency array`,
        'useEffect with no deps runs after every render — usually a logic error or infinite loop risk.',
        'Always provide a dependency array. Use [] for mount-only effects, and list all dependencies explicitly.',
        'Missing dependency arrays create subtle re-render bugs that are nearly impossible to trace in production.',
        effectLocs));
    }
  }

  if (framework === 'laravel') {
    const phpFiles = walkFiles(dir, ['.php']);

    // Raw DB queries vs Eloquent — raw queries are harder to maintain
    const rawQueryCount = grepCount(phpFiles, /DB::(?:select|insert|update|delete|statement)\s*\(/g);
    metrics.rawQueryCount = rawQueryCount;
    if (rawQueryCount > 10) {
      const rawQueryLocs = grepLines(phpFiles, /DB::(?:select|insert|update|delete|statement)\s*\(/, dir);
      issues.push(makeIssue('minor', `${rawQueryCount} raw DB query(ies) found`,
        'Multiple DB::select/insert/update calls bypass Eloquent relationships and query scopes.',
        'Replace raw queries with Eloquent models and Query Builder where possible.',
        'Raw queries are harder to mock in tests, bypass model events, and break when schemas change.',
        rawQueryLocs));
    }
  }

  if (framework === 'wordpress') {
    const phpFiles = walkFiles(dir, ['.php']);

    // Direct SQL without $wpdb->prepare
    const directSql = grepCount(phpFiles, /\$wpdb->(?:query|get_results|get_row|get_var)\s*\(\s*["']/g);
    metrics.directWpdbCount = directSql;
    if (directSql > 0) {
      const directSqlLocs = grepLines(phpFiles, /\$wpdb->(?:query|get_results|get_row|get_var)\s*\(\s*["']/, dir);
      issues.push(makeIssue('critical', `${directSql} direct \$wpdb query(ies) without prepare()`,
        '$wpdb queries with hard-coded SQL strings bypass parameterisation.',
        'Always use $wpdb->prepare() for queries that include any variable data.',
        'Unparameterised queries are SQL injection vectors and are extremely hard to audit at scale.',
        directSqlLocs));
    }
  }
}

// ─── 6. DEVELOPER EXPERIENCE (DX) ────────────────────────────────────────────

function checkDeveloperExperience(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const isPhp = PHP_FRAMEWORKS.includes(framework);
  const isJs  = JS_FRAMEWORKS.includes(framework);

  // ── Debug artifacts left in code ──────────────────────────────────────────
  if (isJs) {
    const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    const debuggerCount = grepCount(jsFiles, /\bdebugger\b/g);
    const consoleCount  = grepCount(jsFiles, /console\.(log|warn|error|debug|info)\s*\(/g);
    metrics.debuggerStatements = debuggerCount;
    metrics.consoleStatements  = consoleCount;

    if (debuggerCount > 0) {
      const debuggerLocs = grepLines(jsFiles, /\bdebugger\b/, dir);
      issues.push(makeIssue('major', `${debuggerCount} debugger statement(s) left in code`,
        '`debugger` statements pause execution in DevTools and should never reach production.',
        'Remove all `debugger` statements. Use a linting rule (no-debugger) to prevent recurrence.',
        'debugger statements break production for every user with DevTools open.',
        debuggerLocs));
    }
    if (consoleCount > 10) {
      const consoleLocs = grepLines(jsFiles, /console\.(log|warn|error|debug|info)\s*\(/, dir);
      issues.push(makeIssue('minor', `${consoleCount} console.log/warn/error statement(s) detected`,
        'Excessive console calls pollute browser and server logs.',
        'Replace console.* with a structured logger (e.g. winston, pino). Remove debug console.logs.',
        'Uncontrolled console output makes log analysis impossible and can leak sensitive data.',
        consoleLocs));
    }
  }

  if (isPhp) {
    const phpFiles = walkFiles(dir, ['.php']);
    const varDumpCount  = grepCount(phpFiles, /\bvar_dump\s*\(|print_r\s*\(/g);
    const errorLogCount = grepCount(phpFiles, /\berror_log\s*\(/g);
    metrics.varDumpCount  = varDumpCount;
    metrics.errorLogCount = errorLogCount;

    if (varDumpCount > 0) {
      const varDumpLocs = grepLines(phpFiles, /\bvar_dump\s*\(|print_r\s*\(/, dir);
      issues.push(makeIssue('major', `${varDumpCount} var_dump/print_r call(s) left in code`,
        'Debug output functions (var_dump, print_r) must not remain in production code.',
        'Remove all var_dump/print_r calls. Use a PSR-3 logger (Monolog) for diagnostic output.',
        'Debug output leaks internal data structures to users and breaks JSON/API responses.',
        varDumpLocs));
    }
  }

  // ── TODO / FIXME / HACK comments (technical debt markers) ─────────────────
  const allSrc = isJs
    ? walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx'])
    : walkFiles(dir, ['.php']);

  const todoCount  = grepCount(allSrc, /\/\/\s*TODO\b|#\s*TODO\b/gi);
  const fixmeCount = grepCount(allSrc, /\/\/\s*FIXME\b|#\s*FIXME\b/gi);
  const hackCount  = grepCount(allSrc, /\/\/\s*HACK\b|\/\/\s*WORKAROUND\b|#\s*HACK\b/gi);
  metrics.todoCount  = todoCount;
  metrics.fixmeCount = fixmeCount;
  metrics.hackCount  = hackCount;

  if (fixmeCount > 0) {
    const fixmeLocs = grepLines(allSrc, /\/\/\s*FIXME\b|#\s*FIXME\b/, dir);
    issues.push(makeIssue('major', `${fixmeCount} FIXME comment(s) indicating known broken code`,
      'FIXME comments document code the author knows is broken or incorrect.',
      'Resolve every FIXME before production deployment. Convert remaining items to tracked issues.',
      'FIXME comments are explicit markers of production risk — they represent known defects, not future improvements.',
      fixmeLocs));
  }
  if (hackCount > 0) {
    const hackLocs = grepLines(allSrc, /\/\/\s*HACK\b|\/\/\s*WORKAROUND\b|#\s*HACK\b/, dir);
    issues.push(makeIssue('major', `${hackCount} HACK/WORKAROUND comment(s) detected`,
      'HACK comments document brittle workarounds that will break under changed conditions.',
      'Replace each workaround with a proper solution, or at minimum document the exact condition that makes it safe.',
      'Workarounds accumulate silently — when the condition they depend on changes, they fail without warning.',
      hackLocs));
  }
  if (todoCount > 10) {
    const todoLocs = grepLines(allSrc, /\/\/\s*TODO\b|#\s*TODO\b/, dir);
    issues.push(makeIssue('minor', `${todoCount} TODO comment(s) — high technical debt marker count`,
      `${todoCount} unresolved TODO items indicate deferred work that will block future features.`,
      'Move TODOs to a task tracker (GitHub Issues, Jira). A codebase with 10+ TODOs is not production-ready.',
      'TODO comments are invisible to new developers unless they read every file — critical context gets lost.',
      todoLocs));
  }

  // ── Error handling quality ─────────────────────────────────────────────────
  if (isJs) {
    const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);

    // Empty catch blocks: catch(e) {} or catch(err) { /* */ }
    const emptyCatch = grepCount(jsFiles, /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/g);
    metrics.emptyCatchBlocks = emptyCatch;
    if (emptyCatch > 0) {
      const emptyCatchLocs = grepLines(jsFiles, /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/, dir);
      issues.push(makeIssue('critical', `${emptyCatch} empty catch block(s) — errors silently swallowed`,
        'Empty catch blocks hide errors entirely, making debugging impossible.',
        'At minimum, log the error. Never silently discard exceptions in production code.',
        'Silent catch blocks turn intermittent production failures into complete mysteries — no error, no log, no trace.',
        emptyCatchLocs));
    }

    // Unhandled promise rejection patterns: .catch() missing on fetch/axios chains
    const awaitWithoutTry = grepCount(jsFiles, /^\s*(?:const|let)\s+\w+\s*=\s*await\s+(?!.*try)/gm);
    metrics.awaitWithoutTryCount = awaitWithoutTry;
    if (awaitWithoutTry > 15) {
      issues.push(makeIssue('minor', `${awaitWithoutTry} await expression(s) potentially outside try/catch`,
        'async/await calls without surrounding try/catch produce unhandled promise rejections.',
        'Wrap await calls in try/catch blocks or add a global unhandledRejection handler.',
        'Unhandled rejections crash Node.js workers silently in older versions and are invisible to users.'));
    }
  }

  if (isPhp) {
    const phpFiles = walkFiles(dir, ['.php']);
    // Empty catch blocks in PHP
    const emptyCatch = grepCount(phpFiles, /catch\s*\(\s*\w[\w\\]*\s+\$\w+\s*\)\s*\{\s*\}/g);
    metrics.emptyCatchBlocks = emptyCatch;
    if (emptyCatch > 0) {
      const phpCatchLocs = grepLines(phpFiles, /catch\s*\(\s*\w[\w\\]*\s+\$\w+\s*\)\s*\{\s*\}/, dir);
      issues.push(makeIssue('critical', `${emptyCatch} empty catch block(s) — exceptions silently swallowed`,
        'Exceptions caught and discarded make debugging impossible in production.',
        'Log every caught exception with context. Never use an empty catch block.',
        'Silent exceptions mask data corruption, permission failures, and network errors.',
        phpCatchLocs));
    }
  }

  // ── Type safety (JS/TS) ───────────────────────────────────────────────────
  if (isJs) {
    const tsFiles = walkFiles(dir, ['.ts', '.tsx']);
    if (tsFiles.length > 0) {
      // `as any` casts — escape-hatches that bypass the type system
      const anyAsCount = grepCount(tsFiles, /\bas\s+any\b/g);
      metrics.typeAsAnyCount = anyAsCount;
      if (anyAsCount > 5) {
        const asAnyLocs = grepLines(tsFiles, /\bas\s+any\b/, dir);
        issues.push(makeIssue('minor', `${anyAsCount} "as any" type cast(s) bypass TypeScript safety`,
          '`as any` casts silence type errors without solving them.',
          'Replace `as any` with proper types, generics, or type guards.',
          'Every `as any` is a future runtime error waiting to happen — they are invisible to the compiler and invisible to reviewers.',
          asAnyLocs));
      }

      // Non-null assertions — !. — often mask undefined access bugs
      const nonNullCount = grepCount(tsFiles, /\w!\./g);
      metrics.nonNullAssertionCount = nonNullCount;
      if (nonNullCount > 10) {
        const nonNullLocs = grepLines(tsFiles, /\w!\./, dir);
        issues.push(makeIssue('minor', `${nonNullCount} non-null assertion(s) (!) may mask undefined errors`,
          'Non-null assertions (obj!.prop) tell TypeScript to trust you — if wrong, you get a runtime crash.',
          'Replace non-null assertions with proper null checks or optional chaining (?.).',
          'Non-null assertions concentrate technical debt — each one is a contract with no enforcement.',
          nonNullLocs));
      }
    }
  }

  // ── Changelogs and versioning ──────────────────────────────────────────────
  const hasChangelog = fs.existsSync(path.join(dir, 'CHANGELOG.md')) ||
    fs.existsSync(path.join(dir, 'CHANGELOG')) ||
    fs.existsSync(path.join(dir, 'HISTORY.md'));
  metrics.hasChangelog = hasChangelog;

  if (!hasChangelog) {
    issues.push(makeIssue('suggestion', 'No CHANGELOG file',
      'No CHANGELOG.md or HISTORY.md found.',
      'Maintain a CHANGELOG (following Keep a Changelog format) to document what changed and when.',
      'Without a changelog, teams cannot determine what changed between deployments — critical when rolling back.'));
  }

  // ── CONTRIBUTING guide ────────────────────────────────────────────────────
  const hasContributing = fs.existsSync(path.join(dir, 'CONTRIBUTING.md')) ||
    fs.existsSync(path.join(dir, '.github/CONTRIBUTING.md'));
  metrics.hasContributing = hasContributing;

  if (!hasContributing) {
    issues.push(makeIssue('suggestion', 'No CONTRIBUTING guide',
      'No CONTRIBUTING.md found.',
      'Add a CONTRIBUTING.md describing branch naming, PR process, coding standards, and local setup.',
      'Without contribution guidelines, every new developer invents their own workflow — creating inconsistency across PRs.'));
  }

  // ── PR / Issue templates (GitHub) ─────────────────────────────────────────
  const hasPrTemplate = fs.existsSync(path.join(dir, '.github/pull_request_template.md')) ||
    fs.existsSync(path.join(dir, '.github/PULL_REQUEST_TEMPLATE.md'));
  const hasIssueTemplate = fs.existsSync(path.join(dir, '.github/ISSUE_TEMPLATE')) ||
    fs.existsSync(path.join(dir, '.github/issue_template.md'));
  metrics.hasPrTemplate    = hasPrTemplate;
  metrics.hasIssueTemplate = hasIssueTemplate;

  if (!hasPrTemplate) {
    issues.push(makeIssue('suggestion', 'No pull request template',
      'No .github/pull_request_template.md found.',
      'Add a PR template with sections for: what changed, how to test, screenshots, and checklist.',
      'Without a PR template, reviews are inconsistent — reviewers miss context and test steps vary between contributors.'));
  }

  // ── .gitignore completeness ───────────────────────────────────────────────
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gi = fs.readFileSync(gitignorePath, 'utf-8');
    const missingRules: string[] = [];
    if (isJs && !gi.includes('node_modules')) missingRules.push('node_modules');
    if (isJs && !gi.includes('.env'))         missingRules.push('.env');
    if (isJs && !gi.includes('dist') && !gi.includes('build')) missingRules.push('dist/build');
    if (isPhp && !gi.includes('vendor'))      missingRules.push('vendor');
    if (isPhp && !gi.includes('.env'))        missingRules.push('.env');
    if (framework === 'laravel' && !gi.includes('storage/'))  missingRules.push('storage/');
    metrics.gitignoreMissingRules = missingRules.length;
    if (missingRules.length > 0) {
      issues.push(makeIssue('major', `Incomplete .gitignore — missing: ${missingRules.join(', ')}`,
        `.gitignore does not exclude: ${missingRules.join(', ')}`,
        `Add the following to .gitignore: ${missingRules.join(', ')}`,
        'Missing .gitignore entries lead to accidentally committed secrets, build artifacts, or 100MB vendor directories.'));
    }
  } else {
    issues.push(makeIssue('major', 'No .gitignore file found',
      'No .gitignore found in the repository root.',
      'Add a .gitignore appropriate for your framework. Use gitignore.io to generate one.',
      'Without .gitignore, build artifacts, secrets, and IDE files will pollute every commit.'));
    metrics.hasGitignore = false;
  }

  // ── Env variable usage without validation ─────────────────────────────────
  if (isJs) {
    const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    const rawEnvAccess = grepCount(jsFiles, /process\.env\.\w+(?!\s*\?\?|\s*\|\|)/g);
    metrics.rawEnvAccessCount = rawEnvAccess;
    if (rawEnvAccess > 8) {
      issues.push(makeIssue('minor', `${rawEnvAccess} unguarded process.env access(es)`,
        'Environment variables accessed without fallback values (|| or ??) crash the app when the variable is absent.',
        'Use a validated env schema (e.g. zod + dotenv, or envalid) and fail fast at startup if required vars are missing.',
        'Missing env vars cause silent undefined bugs in production — caught only when a specific code path is hit.'));
    }
  }

  // ── Commented-out code blocks ─────────────────────────────────────────────
  if (isJs) {
    const jsFiles = walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);
    const commentedCodeCount = grepCount(jsFiles, /\/\/\s*(const|let|var|function|return|if|for|import|export)\b/g);
    metrics.commentedCodeCount = commentedCodeCount;
    if (commentedCodeCount > 15) {
      issues.push(makeIssue('minor', `${commentedCodeCount} commented-out code block(s) detected`,
        'Large amounts of commented-out code create noise and confusion about what is actually active.',
        'Delete commented-out code. Git history preserves it if ever needed again.',
        'Commented code creates uncertainty for every developer who reads the file: "Is this intentional? Is it safe to delete?"'));
    }
  }

  if (isPhp) {
    const phpFiles = walkFiles(dir, ['.php']);
    const commentedCodeCount = grepCount(phpFiles, /\/\/\s*(\$\w+|echo|function|if|for|return)\b/g);
    metrics.commentedCodeCount = commentedCodeCount;
    if (commentedCodeCount > 15) {
      issues.push(makeIssue('minor', `${commentedCodeCount} commented-out PHP code block(s)`,
        'Commented-out PHP code creates maintenance confusion.',
        'Delete commented-out code and rely on git history for recovery.',
        'Commented code left in place causes reviewers to waste time deciding whether it should be restored.'));
    }
  }
}

// ─── 7. CSS QUALITY & NAMING CONVENTIONS ─────────────────────────────────────

function checkCSSQuality(
  dir: string,
  framework: string,
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): void {
  const allCssFiles = walkFiles(dir, ['.css', '.scss', '.sass', '.less']);
  // Exclude minified files and large compiled bundles (>100 KB) from style analysis
  const cssFiles = allCssFiles.filter(f => {
    if (f.endsWith('.min.css')) return false;
    try { return fs.statSync(f).size <= 100 * 1024; } catch { return false; }
  });
  const htmlFiles = walkFiles(dir, ['.html', '.php', '.twig', '.blade.php']);
  const jsxFiles  = walkFiles(dir, ['.tsx', '.jsx', '.ts', '.js', '.vue']);

  if (cssFiles.length === 0 && htmlFiles.length === 0 && jsxFiles.length === 0) return;

  // Detect whether this project uses Tailwind (utility-first) or custom CSS
  const hasTailwind =
    fs.existsSync(path.join(dir, 'tailwind.config.js')) ||
    fs.existsSync(path.join(dir, 'tailwind.config.ts')) ||
    fs.existsSync(path.join(dir, 'tailwind.config.mjs')) ||
    cssFiles.some(f => {
      try { return fs.readFileSync(f, 'utf-8').includes('@tailwind'); } catch { return false; }
    });

  metrics.usesTailwind = hasTailwind;

  // ── 1. !important abuse ──────────────────────────────────────────────────
  const importantCount = grepCount(cssFiles, /!important/g);
  metrics.cssImportantCount = importantCount;
  if (importantCount > 5) {
    const importantLocs = grepLines(cssFiles, /!important/, dir);
    issues.push(makeIssue('major', `${importantCount} !important declaration(s) found in CSS`,
      '!important overrides the cascade and makes debugging specificity issues nearly impossible.',
      'Refactor selectors to be more specific instead of using !important. Reserve it only for utility overrides.',
      '!important declarations become a crutch — each one requires another !important to override it, spiralling into unmaintainable CSS.',
      importantLocs));
  } else if (importantCount > 0) {
    const importantLocs = grepLines(cssFiles, /!important/, dir);
    issues.push(makeIssue('minor', `${importantCount} !important declaration(s) — use sparingly`,
      '!important bypasses the CSS cascade.',
      'Increase selector specificity instead of using !important where possible.',
      'Overusing !important makes theming and responsive overrides harder to manage.',
      importantLocs));
  }

  // ── 2. ID selectors used for styling ────────────────────────────────────
  const idSelectorCount = grepCount(cssFiles, /#[a-zA-Z][a-zA-Z0-9_-]*\s*\{/g);
  metrics.cssIdSelectorCount = idSelectorCount;
  if (idSelectorCount > 3) {
    const idSelectorLocs = grepLines(cssFiles, /#[a-zA-Z][a-zA-Z0-9_-]*\s*\{/, dir);
    issues.push(makeIssue('minor', `${idSelectorCount} ID selector(s) used for styling`,
      'CSS ID selectors (#id) have very high specificity and cannot be reused.',
      'Replace ID selectors with class selectors. IDs should be used for anchors and JavaScript hooks, not styling.',
      'ID selectors are nearly impossible to override without !important, making component reuse and theming difficult.',
      idSelectorLocs));
  }

  // ── 3. CSS custom properties (CSS variables) ─────────────────────────────
  if (!hasTailwind && cssFiles.length > 0) {
    const cssVarDefs   = grepCount(cssFiles, /--[a-z][a-z0-9-]*\s*:/g);
    const cssVarUsage  = grepCount(cssFiles, /var\(--[a-z][a-z0-9-]*/g);
    metrics.cssCustomPropertyDefs  = cssVarDefs;
    metrics.cssCustomPropertyUsage = cssVarUsage;

    // Hard-coded hex/rgb colors — line-by-line so we can skip var definitions and track locations
    const uniqueHardCodedColors = new Set<string>();
    const colorLocations: string[] = [];
    const colorRe = /:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;

    for (const f of cssFiles) {
      try {
        const rel = path.relative(dir, f);
        const lines = fs.readFileSync(f, 'utf-8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip CSS variable definition lines (--varname: value) — with OR without trailing semicolon
          if (/^\s*--[a-z][a-z0-9-]/i.test(line)) continue;
          // Skip CSS block comment lines
          if (/^\s*\/\*/.test(line)) continue;
          // Strip var() calls (including fallbacks) before matching
          const stripped = line.replace(/var\([^)]+\)/gi, '');
          colorRe.lastIndex = 0;
          const matches = stripped.match(colorRe) || [];
          for (const m of matches) {
            uniqueHardCodedColors.add(m.replace(/^:\s*/, '').trim().toLowerCase());
          }
          if (matches.length > 0 && colorLocations.length < 10) {
            colorLocations.push(`${rel}:${i + 1}`);
          }
        }
      } catch { /* skip */ }
    }
    const hardCodedColors = uniqueHardCodedColors.size;
    metrics.hardCodedColorCount = hardCodedColors;
    const colorSample = [...uniqueHardCodedColors].slice(0, 6).join(', ');

    if (cssVarDefs === 0 && hardCodedColors > 5) {
      issues.push(makeIssue('major', 'No CSS custom properties (variables) defined',
        `${hardCodedColors} unique hard-coded color value(s) found but no CSS custom properties (--variable) are defined. Sample: ${colorSample}`,
        'Define a design token system using CSS custom properties: --color-primary, --spacing-md, --font-size-base, etc.',
        'Without CSS variables, changing the brand colour or spacing requires a find-and-replace across every file — a maintenance nightmare at scale.',
        colorLocations));
    } else if (hardCodedColors > 10 && cssVarDefs > 0) {
      issues.push(makeIssue('minor', `${hardCodedColors} unique hard-coded color value(s) not using CSS variables`,
        `Raw color values used directly instead of CSS custom properties. Sample: ${colorSample}`,
        'Replace hard-coded colors with var(--your-token) references to maintain consistency.',
        'Hard-coded values diverge from the design system over time, leading to inconsistent UI.',
        colorLocations));
    }
  }

  // ── 4. BEM naming convention (for non-Tailwind projects) ─────────────────
  if (!hasTailwind && cssFiles.length > 0) {
    let totalClasses   = 0;
    let bemClasses     = 0;
    let nonBemClasses  = 0;

    for (const f of cssFiles) {
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const classSelectors = content.match(/\.[a-zA-Z][a-zA-Z0-9_-]*(?=[\s{,:])/g) || [];
        totalClasses += classSelectors.length;
        for (const sel of classSelectors) {
          const name = sel.slice(1); // remove leading dot
          if (/^[a-z][a-z0-9]*(__[a-z][a-z0-9-]*)?(--[a-z][a-z0-9-]*)?$/.test(name)) {
            bemClasses++;
          } else if (/[A-Z]/.test(name)) {
            nonBemClasses++; // camelCase in CSS is non-standard
          }
        }
      } catch { /* skip */ }
    }

    metrics.totalCssClasses  = totalClasses;
    metrics.nonBemClassCount = nonBemClasses;

    if (totalClasses > 10 && nonBemClasses > totalClasses * 0.3) {
      issues.push(makeIssue('minor', `${nonBemClasses} CSS class name(s) use camelCase — not industry standard`,
        'CSS class names should use kebab-case (e.g. .card-title) not camelCase (e.g. .cardTitle).',
        'Follow the BEM convention: .block__element--modifier or at minimum use kebab-case for all class names.',
        'camelCase class names are unconventional in CSS and break grep-ability across HTML and CSS files.'));
    }

    if (totalClasses > 20 && bemClasses < totalClasses * 0.4) {
      issues.push(makeIssue('suggestion', 'Consider adopting BEM naming convention',
        'Less than 40% of CSS class names follow BEM (Block__Element--Modifier) structure.',
        'Adopt BEM or a similar methodology (SMACSS, OOCSS) to make component boundaries explicit in class names.',
        'Without a naming convention, class names collide as the project grows and components become hard to isolate.'));
    }
  }

  // ── 5. Inline styles in markup / JSX ─────────────────────────────────────
  const inlineStyleHtmlLocs = grepLines(htmlFiles, /style\s*=\s*["'][^"']{10,}["']/, dir);
  const inlineStyleJsxLocs  = grepLines(jsxFiles,  /style=\{\{[^}]{10,}\}\}/, dir);
  const inlineStyleHtml = grepCount(htmlFiles, /style\s*=\s*["'][^"']{10,}["']/g);
  const inlineStyleJsx  = grepCount(jsxFiles,  /style=\{\{[^}]{10,}\}\}/g);
  metrics.inlineStyleCountHtml = inlineStyleHtml;
  metrics.inlineStyleCountJsx  = inlineStyleJsx;

  const totalInlineStyles = inlineStyleHtml + inlineStyleJsx;
  const inlineStyleLocs = [...inlineStyleHtmlLocs, ...inlineStyleJsxLocs].slice(0, 10);
  if (totalInlineStyles > 10) {
    issues.push(makeIssue('major', `${totalInlineStyles} inline style attribute(s) found`,
      'Inline styles bypass the stylesheet, cannot be overridden by media queries, and cannot be reused.',
      'Move styles to CSS classes or design tokens. In React, use className with Tailwind or a CSS module.',
      'Inline styles are invisible to theming, dark mode, and responsive overrides — they are the hardest type of style to maintain.',
      inlineStyleLocs));
  } else if (totalInlineStyles > 3) {
    issues.push(makeIssue('minor', `${totalInlineStyles} inline style attribute(s) — prefer CSS classes`,
      'Some elements use inline style attributes.',
      'Extract repeated inline styles into reusable CSS classes or design tokens.',
      'Inline styles cannot benefit from browser caching, cascade, or responsive overrides.',
      inlineStyleLocs));
  }

  // ── 6. Consistent units — mixing px and rem ───────────────────────────────
  if (cssFiles.length > 0) {
    const pxCount  = grepCount(cssFiles, /:\s*\d+px\b/g);
    const remCount = grepCount(cssFiles, /:\s*[\d.]+rem\b/g);
    const emCount  = grepCount(cssFiles, /:\s*[\d.]+em\b/g);
    metrics.cssPxCount  = pxCount;
    metrics.cssRemCount = remCount;

    // Mixing absolute px with relative rem heavily suggests inconsistency
    if (pxCount > 10 && remCount > 10 && Math.min(pxCount, remCount) / Math.max(pxCount, remCount) > 0.3) {
      issues.push(makeIssue('minor', 'Inconsistent CSS units — mixing px and rem',
        `${pxCount} px and ${remCount} rem values found. Mixing units makes responsive scaling unpredictable.`,
        'Standardise on rem for font sizes and spacing (scales with user font preferences). Use px only for borders, shadows, and fixed elements.',
        'Mixing px and rem breaks accessibility for users who change their browser default font size.'));
    }

    // Deep nesting in SCSS
    const scssFiles = cssFiles.filter(f => f.endsWith('.scss') || f.endsWith('.sass'));
    if (scssFiles.length > 0) {
      let deepNestingCount = 0;
      for (const f of scssFiles) {
        try {
          const lines = fs.readFileSync(f, 'utf-8').split('\n');
          for (const line of lines) {
            const depth = (line.match(/^\s*/)?.[0].length ?? 0) / 2;
            if (depth >= 4 && line.trim().startsWith('&')) deepNestingCount++;
          }
        } catch { /* skip */ }
      }
      metrics.scssDeepNestingCount = deepNestingCount;
      if (deepNestingCount > 5) {
        issues.push(makeIssue('minor', `${deepNestingCount} deeply nested SCSS selector(s) (4+ levels)`,
          'Deeply nested SCSS generates overly specific selectors that are hard to override.',
          'Limit SCSS nesting to 3 levels maximum. Use BEM class names instead of deep nesting.',
          'Deep nesting produces selectors like .a .b .c .d .e {} which are fragile and impossible to reuse.'));
      }
    }
  }

  // ── 7. Missing :focus styles (keyboard accessibility in CSS) ─────────────
  if (cssFiles.length > 0) {
    const focusRules    = grepCount(cssFiles, /:focus\b/g);
    const focusVisible  = grepCount(cssFiles, /:focus-visible\b/g);
    const focusNone     = grepCount(cssFiles, /outline\s*:\s*none|outline\s*:\s*0\b/g);
    metrics.cssFocusRules   = focusRules;
    metrics.cssFocusNone    = focusNone;

    if (focusNone > 0 && (focusRules + focusVisible) < focusNone) {
      const focusLocs = grepLines(cssFiles, /outline\s*:\s*none|outline\s*:\s*0\b/, dir);
      issues.push(makeIssue('critical', `Focus outline removed without replacement (${focusNone} instance(s))`,
        '`outline: none` or `outline: 0` removes the visible keyboard focus indicator without providing an alternative.',
        'Replace `outline: none` with a custom :focus-visible style: `outline: 2px solid var(--color-focus); outline-offset: 2px`',
        'Removing focus outlines fails WCAG 2.4.7 (Focus Visible) — keyboard and switch-access users cannot see where they are on the page.',
        focusLocs));
    }
  }

  // ── 8. Tailwind-specific: no custom CSS overriding Tailwind ──────────────
  if (hasTailwind && cssFiles.length > 0) {
    const nonUtilitySelectors = grepCount(cssFiles,
      /^\s*\.[a-zA-Z][a-zA-Z0-9_-]*\s*\{/gm);
    const tailwindDirectives = grepCount(cssFiles, /@apply\b/g);
    metrics.tailwindCustomSelectors = nonUtilitySelectors;
    metrics.tailwindApplyCount      = tailwindDirectives;

    if (nonUtilitySelectors > 20 && tailwindDirectives === 0) {
      issues.push(makeIssue('minor', `${nonUtilitySelectors} custom CSS class(es) alongside Tailwind`,
        'Large amounts of custom CSS alongside Tailwind often indicate duplicated utility work.',
        'Use @apply to compose Tailwind utilities into component classes, or use Tailwind\'s config to extend the design system.',
        'Mixing custom CSS with Tailwind leads to conflicting styles and defeats the purpose of utility-first CSS.'));
    }
  }

  // ── 9. WordPress: wp_enqueue_style instead of direct <link> tags ─────────
  if (framework === 'wordpress') {
    const phpFiles = walkFiles(dir, ['.php']);
    const directLinkTags  = grepCount(phpFiles, /<link[^>]+rel=["']stylesheet["']/g);
    const enqueuedStyles  = grepCount(phpFiles, /wp_enqueue_style\s*\(/g);
    metrics.wpDirectLinkTags   = directLinkTags;
    metrics.wpEnqueuedStyles   = enqueuedStyles;

    if (directLinkTags > 0) {
      const wpLinkLocs = grepLines(phpFiles, /<link[^>]+rel=["']stylesheet["']/, dir);
      issues.push(makeIssue('major', `${directLinkTags} hard-coded <link rel="stylesheet"> in PHP template(s)`,
        'WordPress themes should enqueue stylesheets via wp_enqueue_style(), not raw <link> tags.',
        'Use wp_enqueue_style() in functions.php to register and enqueue all stylesheets.',
        'Hard-coded <link> tags bypass WordPress\'s dependency management, cause duplicate loading, and break child theme overrides.',
        wpLinkLocs));
    }
  }
}

function calculateCodeQualityScore(
  issues: AuditIssue[],
  metrics: Record<string, string | number | boolean | null>,
): number {
  const counts = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  for (const issue of issues) counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;

  // Cap each bucket so a flood of one type can't zero the score alone
  const deduction =
    Math.min(counts.critical * 1.5, 3.0) +
    Math.min(counts.major    * 0.5, 2.5) +
    Math.min(counts.minor    * 0.2, 2.0) +
    Math.min(counts.suggestion * 0.05, 0.5);

  let score = 10 - deduction;

  if (metrics.hasLinting)    score += 0.5;
  if (metrics.hasTests)      score += 0.5;
  if (metrics.hasTypeScript) score += 0.3;
  if (metrics.hasCICD)       score += 0.3;

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function makeIssue(
  severity: AuditIssue['severity'],
  title: string,
  description: string,
  recommendation: string,
  impact: string,
  locations?: string[],
): AuditIssue {
  return {
    id: uuidv4(),
    category: 'code-quality',
    severity,
    title,
    description,
    recommendation,
    impact,
    ...(locations && locations.length > 0 ? { locations } : {}),
  };
}
