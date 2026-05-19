'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Loader2, Globe, GitBranch, Sparkles, Info, FileCode2, LayoutTemplate, Check, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAudit, getErrorMessage } from '@/lib/api';
import { useAuditStore } from '@/store/audit.store';
import { cn } from '@/lib/utils';
import type { ProjectType, Framework } from '@/types';

const schema = z.object({
  websiteUrl: z
    .string()
    .url('Enter a valid URL including http:// or https://')
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'URL must start with http:// or https://'),
  repoUrl: z
    .string()
    .min(1, 'Repository URL is required')
    .url('Enter a valid repository URL'),
  repoToken: z.string().optional(),
  name: z.string().max(100, 'Name must be under 100 characters').optional(),
});

type FormData = z.infer<typeof schema>;

interface FrameworkOption {
  value: Framework;
  label: string;
  description: string;
  icon: string;
}

const FRAMEWORKS: FrameworkOption[] = [
  { value: 'html',        label: 'HTML / CSS / JS', description: 'Plain static site, no framework',   icon: '🌐' },
  { value: 'php',         label: 'PHP',              description: 'Generic PHP without a framework',   icon: '🐘' },
  { value: 'nextjs',      label: 'Next.js',          description: 'React meta-framework by Vercel',    icon: '▲' },
  { value: 'react',       label: 'React',            description: 'CRA, Vite, or custom React setup',  icon: '⚛️' },
  { value: 'vue',         label: 'Vue.js',           description: 'Vue 3 / Nuxt or similar',           icon: '💚' },
  { value: 'laravel',     label: 'Laravel',          description: 'PHP MVC framework by Taylor Otwell', icon: '🔴' },
  { value: 'codeigniter', label: 'CodeIgniter',      description: 'Lightweight PHP MVC framework',     icon: '🔥' },
  { value: 'wordpress',   label: 'WordPress',        description: 'WordPress theme or plugin project', icon: '🔵' },
];

export default function NewAuditPage() {
  const router = useRouter();
  const { addAudit } = useAuditStore();

  const [projectType, setProjectType] = useState<ProjectType>('website');
  const [framework, setFramework] = useState<Framework>('html');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const audit = await createAudit(
        data.websiteUrl,
        data.repoUrl,
        data.name || undefined,
        projectType,
        projectType === 'landing_page' ? 'html' : framework,
        data.repoToken || undefined,
      );
      addAudit(audit);
      toast.success('Audit started! Analysis is now running.');
      router.push(`/audits/${audit.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-slide-up">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">New Audit</h1>
        <p className="text-slate-500 text-sm mt-1">
          Enter your website URL to begin a comprehensive quality audit
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

          {/* ── Project Type ──────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Project Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProjectType('landing_page')}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
                  projectType === 'landing_page'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600',
                )}
              >
                {projectType === 'landing_page' && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                <LayoutTemplate className="h-7 w-7" />
                <div>
                  <p className="font-semibold text-sm">Landing Page</p>
                  <p className="text-xs mt-0.5 opacity-70">HTML / CSS / JS only</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setProjectType('website')}
                className={cn(
                  'relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center',
                  projectType === 'website'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600',
                )}
              >
                {projectType === 'website' && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </span>
                )}
                <FileCode2 className="h-7 w-7" />
                <div>
                  <p className="font-semibold text-sm">Website / Web App</p>
                  <p className="text-xs mt-0.5 opacity-70">Framework-based project</p>
                </div>
              </button>
            </div>
          </div>

          {/* ── Framework (only for website/app) ─────────────── */}
          {projectType === 'website' && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Framework <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FRAMEWORKS.map((fw) => (
                  <button
                    key={fw.value}
                    type="button"
                    onClick={() => setFramework(fw.value)}
                    title={fw.description}
                    className={cn(
                      'relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border-2 transition-all text-center',
                      framework === fw.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600',
                    )}
                  >
                    {framework === fw.value && (
                      <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-brand-500 flex items-center justify-center">
                        <Check className="h-2 w-2 text-white" />
                      </span>
                    )}
                    <span className="text-xl leading-none">{fw.icon}</span>
                    <span className="text-xs font-semibold leading-tight">{fw.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-slate-400 text-xs mt-2">
                {FRAMEWORKS.find(f => f.value === framework)?.description}
              </p>
            </div>
          )}

          {/* ── Website URL ───────────────────────────────────── */}
          <div>
            <label htmlFor="websiteUrl" className="block text-sm font-semibold text-slate-700 mb-2">
              Website URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="websiteUrl"
                type="url"
                {...register('websiteUrl')}
                placeholder="https://yourwebsite.com"
                className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all placeholder-slate-400"
              />
            </div>
            {errors.websiteUrl && (
              <p className="text-red-500 text-xs mt-1.5">{errors.websiteUrl.message}</p>
            )}
            <p className="text-slate-400 text-xs mt-1.5">
              The live or staging URL to audit. Must be publicly accessible.
            </p>
          </div>

          {/* ── Repo URL ──────────────────────────────────────── */}
          <div>
            <label htmlFor="repoUrl" className="block text-sm font-semibold text-slate-700 mb-2">
              Git Repository URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <GitBranch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="repoUrl"
                type="url"
                {...register('repoUrl')}
                placeholder="https://github.com/org/repo"
                className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all placeholder-slate-400"
              />
            </div>
            {errors.repoUrl && (
              <p className="text-red-500 text-xs mt-1.5">{errors.repoUrl.message}</p>
            )}
            <p className="text-slate-400 text-xs mt-1.5">
              {projectType === 'landing_page'
                ? 'Enables HTML/CSS/JS code quality analysis of your landing page source.'
                : `Enables ${FRAMEWORKS.find(f => f.value === framework)?.label ?? 'framework'}-specific code quality checks (linting, dependencies, structure).`}
            </p>
          </div>

          {/* ── Repo Access Token ─────────────────────────────── */}
          <div>
            <label htmlFor="repoToken" className="block text-sm font-semibold text-slate-700 mb-2">
              Repository Access Token <span className="text-slate-400 font-normal">(private repos only)</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="repoToken"
                type="password"
                {...register('repoToken')}
                placeholder="glpat-xxxxxxxxxxxx or ghp_xxxxxxxxxxxx"
                className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all placeholder-slate-400"
              />
            </div>
            <p className="text-slate-400 text-xs mt-1.5">
              Required for private repositories. GitLab: create a project access token with <code className="bg-slate-100 px-1 rounded">read_repository</code> scope. GitHub: use a personal access token with <code className="bg-slate-100 px-1 rounded">repo</code> scope. Never stored.
            </p>
          </div>

          {/* ── Audit Name ────────────────────────────────────── */}
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-slate-700 mb-2">
              Audit Name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              placeholder="e.g. Production v2.1 audit"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all placeholder-slate-400"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1.5">{errors.name.message}</p>
            )}
          </div>

          {/* ── What we check ─────────────────────────────────── */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-brand-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-700">What we analyse</span>
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
              {[
                'Performance (Core Web Vitals)',
                'SEO on-page factors',
                'WCAG 2.1 Accessibility',
                'Responsiveness & mobile',
                'Security best practices',
                'UX/UI heuristics',
                projectType === 'landing_page'
                  ? 'HTML/CSS code quality (with repo)'
                  : `${FRAMEWORKS.find(f => f.value === framework)?.label} code quality (with repo)`,
              ].map((item) => (
                <div key={item} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Sparkles className="h-3 w-3 text-brand-500 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Starting audit…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Start Audit
              </>
            )}
          </button>

          <p className="text-center text-slate-400 text-xs">
            Analysis takes 1–2 minutes depending on site complexity
          </p>
        </form>
      </div>
    </div>
  );
}
