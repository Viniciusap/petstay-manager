import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from '../ui/ThemeToggle';
import LanguageToggle from '../ui/LanguageToggle';

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r flex-col" style={{ borderColor: 'var(--border)' }}>
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 flex flex-col border-r shadow-xl" style={{ borderColor: 'var(--border)', zIndex: 41 }}>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl hover:bg-[var(--bg-hover)] transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            style={{ color: 'var(--text-primary)' }}
          >
            ☰
          </button>
          <span className="md:hidden font-bold text-sm" style={{ color: 'var(--color-primary)' }}>🐾 PetStay</span>
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="px-4 py-2 border-t text-center flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <a href="/privacidade" className="text-xs hover:underline" style={{ color: 'var(--text-muted)' }}>
            Política de Privacidade
          </a>
        </footer>
      </div>

    </div>
  );
}
