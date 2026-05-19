'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Menu, X, LayoutDashboard, ListChecks, PlusCircle, LogOut, User } from 'lucide-react';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/audits', icon: ListChecks, label: 'My Audits' },
  { href: '/new-audit', icon: PlusCircle, label: 'New Audit' },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    toast.success('Signed out');
    router.push('/login');
  };

  const pageTitle = navItems.find((n) =>
    n.href === '/dashboard' ? pathname === n.href : pathname.startsWith(n.href),
  )?.label ?? 'Dashboard';

  return (
    <header className="lg:hidden bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 py-3.5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand-400" />
          <span className="font-bold text-white">Web Audit Pro</span>
        </Link>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="text-slate-400 hover:text-white transition-colors p-1"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav className="border-t border-slate-800 px-3 py-4 space-y-1" aria-label="Mobile navigation">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}

          <div className="border-t border-slate-800 pt-3 mt-3">
            <div className="flex items-center gap-3 px-3 py-2 mb-1">
              <div className="w-7 h-7 bg-brand-700 rounded-full flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-brand-200" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
