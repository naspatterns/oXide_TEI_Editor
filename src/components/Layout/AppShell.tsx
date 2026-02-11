import type { ReactNode } from 'react';
import { StatusBar } from './StatusBar';
import './AppShell.css';

interface AppShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export function AppShell({ toolbar, children }: AppShellProps) {
  return (
    <div className="app-shell" role="application" aria-label="oXide TEI Editor">
      <header className="app-toolbar" role="toolbar" aria-label="Main toolbar">
        {toolbar}
      </header>
      <main className="app-main" role="main" aria-label="Editor workspace">
        {children}
      </main>
      <StatusBar />
    </div>
  );
}
