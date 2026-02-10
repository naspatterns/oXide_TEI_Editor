import type { ReactNode } from 'react';
import { StatusBar } from './StatusBar';
import './AppShell.css';

interface AppShellProps {
  toolbar: ReactNode;
  children: ReactNode;
}

export function AppShell({ toolbar, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-toolbar">{toolbar}</header>
      <main className="app-main">{children}</main>
      <StatusBar />
    </div>
  );
}
