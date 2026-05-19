import Link from 'next/link';
import { BarChart3, Shield, Zap, Search, Accessibility, Code2, Smartphone, ArrowRight, CheckCircle2 } from 'lucide-react';

const features = [
  { icon: Zap, title: 'Performance', desc: 'Core Web Vitals, LCP, CLS, FCP, TBT analysis via Lighthouse.' },
  { icon: Accessibility, title: 'Accessibility', desc: 'WCAG 2.1 compliance checks across AA and AAA criteria.' },
  { icon: Search, title: 'SEO', desc: 'Comprehensive on-page SEO analysis with actionable fixes.' },
  { icon: Shield, title: 'Best Practices', desc: 'Security headers, HTTPS, vulnerable libraries, and more.' },
  { icon: Code2, title: 'Code Quality', desc: 'Repository analysis: linting, tests, docs, and security.' },
  { icon: Smartphone, title: 'Responsiveness', desc: 'Mobile-first checks — viewport, media queries, touch targets.' },
];

const steps = [
  { num: '01', title: 'Enter your URL', desc: 'Provide your website URL and optionally a Git repository URL.' },
  { num: '02', title: 'We analyse', desc: 'Our engine runs Lighthouse, SEO, accessibility, and code checks in parallel.' },
  { num: '03', title: 'Get your report', desc: 'View a scored dashboard with all issues and download a PDF report.' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-brand-400" />
            <span className="font-bold text-lg">Web Audit Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-slate-400 hover:text-white transition-colors text-sm font-medium px-4 py-2">
              Sign in
            </Link>
            <Link
              href="/register"
              className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-24 pb-20 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-brand-950 border border-brand-800 text-brand-300 text-xs font-medium px-4 py-1.5 rounded-full mb-8">
            <span className="w-2 h-2 bg-brand-400 rounded-full animate-pulse" />
            Automated website quality auditing
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Know exactly what&apos;s wrong
            <br />
            <span className="text-brand-400">with your website</span>
          </h1>
          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Web Audit Pro scores your site across 7 categories — performance, SEO, accessibility, code quality,
            and more — then gives you a prioritised fix list with a downloadable PDF report.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-base"
            >
              Start your free audit <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold px-8 py-4 rounded-xl transition-colors text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Score preview strip */}
      <section className="px-6 py-10 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: 'Performance', score: 8.4, color: '#84cc16' },
              { label: 'Accessibility', score: 9.1, color: '#22c55e' },
              { label: 'SEO', score: 7.6, color: '#84cc16' },
              { label: 'Best Practices', score: 9.5, color: '#22c55e' },
              { label: 'Code Quality', score: 6.2, color: '#f59e0b' },
              { label: 'Responsive', score: 8.8, color: '#22c55e' },
              { label: 'UX / UI', score: 7.3, color: '#84cc16' },
            ].map(({ label, score, color }) => (
              <div key={label} className="bg-slate-800/80 rounded-xl p-4 text-center border border-slate-700">
                <div className="text-2xl font-bold" style={{ color }}>{score}</div>
                <div className="text-slate-400 text-xs mt-1 leading-tight">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Everything you need to ship with confidence</h2>
          <p className="text-slate-400 text-center mb-14 max-w-2xl mx-auto">
            Seven deeply integrated audit categories powered by Lighthouse, custom parsers, and static analysis.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-brand-700 transition-colors">
                <div className="w-10 h-10 bg-brand-950 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-brand-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {steps.map(({ num, title, desc }) => (
              <div key={num} className="text-center">
                <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-5 text-xl font-black">
                  {num}
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Ready to audit your site?</h2>
          <p className="text-slate-400 mb-8">Free to start. No credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {['Performance analysis', 'PDF reports', 'Audit history', 'Code quality checks'].map((item) => (
              <div key={item} className="flex items-center gap-1.5 text-sm text-slate-400">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-10 py-4 rounded-xl transition-colors text-base mt-10"
          >
            Get started — it&apos;s free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-slate-500 text-sm">
        <p>© {new Date().getFullYear()} Web Audit Pro. Built for developers who care about quality.</p>
      </footer>
    </div>
  );
}
