import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { CommandPalette } from './command-palette';

export function Shell() {
  const [cmdOpen, setCmdOpen] = useState(false);
  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar onOpenCommandPalette={() => setCmdOpen(true)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
