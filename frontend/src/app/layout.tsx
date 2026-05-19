import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Web Audit Pro — Comprehensive Website Analysis',
    template: '%s | Web Audit Pro',
  },
  description:
    'Audit your website for performance, accessibility, SEO, code quality, and more. Get actionable insights and PDF reports.',
  keywords: ['web audit', 'performance', 'SEO', 'accessibility', 'Core Web Vitals', 'lighthouse'],
  openGraph: {
    type: 'website',
    title: 'Web Audit Pro',
    description: 'Comprehensive website quality analysis',
    siteName: 'Web Audit Pro',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              borderRadius: '10px',
              fontSize: '14px',
              maxWidth: '400px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
