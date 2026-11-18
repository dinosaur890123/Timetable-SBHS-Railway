import React from 'react';
import PrivacyView from './PrivacyView';

const PublicPrivacyPage = () => (
    <div className="min-h-[100dvh] bg-m-page text-zinc-900 dark:text-zinc-100">
        <div className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-m-panel md:p-2 md:rounded-2xl md:border border-m-line">
            <header className="sticky top-0 z-30 border-b border-m-line bg-m-panel/75 backdrop-blur-xl">
                <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5 sm:px-8">
                    <a href="/" className="flex items-center gap-2.5" aria-label="Synchron home">
                        <span className="relative w-7 h-7">
                            <img src="/synchron-ring-warm-vector.svg" alt="" className="block w-full h-full rounded-lg" />
                            <span className="absolute -right-0.5 -bottom-0.5 w-2 h-2 rounded-full bg-accent ring-2 ring-m-page"></span>
                        </span>
                        <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Synchron</span>
                    </a>
                    <a
                        href="/"
                        className="h-8 px-3 inline-flex items-center rounded-lg border border-m-line bg-m-card text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    >
                        Home
                    </a>
                </div>
            </header>

            <main className="flex-1 px-4 py-8 sm:px-6">
                <PrivacyView publicOnly />
            </main>

            <footer className="border-t border-m-line">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">© Synchron {new Date().getFullYear()}</span>
                    <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400" aria-label="Footer">
                        <a href="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Home</a>
                        <a href="/privacy" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
                        <a href="https://student.sbhs.net.au" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 dark:hover:text-white transition-colors">SBHS portal</a>
                    </nav>
                </div>
            </footer>
        </div>
    </div>
);

export default PublicPrivacyPage;
