import React from 'react';
import { ArrowLeft, Shield, Database, Cpu, Eye, Trash2, Lock, Server, Smartphone, LogOut } from 'lucide-react';

const Section = ({ icon: Icon, title, children }) => (
    <section className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2.5">
            <Icon size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
            <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-white">{title}</h2>
        </div>
        <div className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
            {children}
        </div>
    </section>
);

const Item = ({ label, children }) => (
    <div className="px-5 py-3.5">
        {label && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 mb-1">
                {label}
            </div>
        )}
        <div className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {children}
        </div>
    </div>
);

const Tag = ({ children, colour = 'zinc' }) => {
    const colours = {
        green:  'bg-emerald-50  dark:bg-emerald-950/40  text-emerald-700 dark:text-emerald-300  border-emerald-200  dark:border-emerald-900/40',
        amber:  'bg-amber-50   dark:bg-amber-950/40   text-amber-700  dark:text-amber-300   border-amber-200   dark:border-amber-900/40',
        zinc:   'bg-zinc-100   dark:bg-zinc-800/60    text-zinc-600   dark:text-zinc-400    border-zinc-200   dark:border-zinc-700',
        blue:   'bg-blue-50    dark:bg-blue-950/40    text-blue-700   dark:text-blue-300    border-blue-200    dark:border-blue-900/40',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold tracking-wide ${colours[colour]}`}>
            {children}
        </span>
    );
};

const TableRow = ({ what, where, when, canDelete }) => (
    <div className="px-5 py-3.5 grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1.5fr_1.5fr_auto] gap-x-4 gap-y-1 items-start">
        <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 col-span-2 sm:col-span-1">{what}</div>
        <div className="hidden sm:flex flex-wrap gap-1">{where}</div>
        <div className="hidden sm:flex flex-wrap gap-1">{when}</div>
        <div className="flex gap-1 col-span-2 sm:col-span-1 flex-wrap">{canDelete}</div>
    </div>
);

const TableHeader = () => (
    <div className="px-5 py-2.5 hidden sm:grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-4 bg-zinc-50/80 dark:bg-white/[0.015] border-b border-zinc-900/[0.06] dark:border-white/[0.06]">
        {['What', 'Stored where', 'Kept for', 'Deletable?'].map(h => (
            <div key={h} className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">{h}</div>
        ))}
    </div>
);

const PrivacyView = ({ onBack, aiProviderName = 'an AI provider' }) => (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Back */}
        <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
            <ArrowLeft size={14} /> Back to Settings
        </button>

        {/* Hero */}
        <div className="space-y-1">
            <div className="flex items-center gap-2 text-accent mb-2">
                <Shield size={20} strokeWidth={1.6} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Privacy</h1>
            <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Synchron is a third-party app that connects to the SBHS student portal. This page explains exactly what data is used, where it lives, and how to delete it.
            </p>
        </div>

        {/* SBHS API data */}
        <Section icon={Server} title="SBHS API data — timetable, notices, awards &amp; attendance">
            <Item label="Who fetches it">
                Your browser fetches timetable, notice, award, and attendance data directly from{' '}
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">student.sbhs.net.au</strong>{' '}
                using your own access token. The Synchron server never sees or touches this data.
            </Item>
            <Item label="Where it's stored">
                Only on your device — in <strong className="font-medium text-zinc-800 dark:text-zinc-200">localStorage</strong> and
                the browser's Service Worker cache — so the app works offline and loads instantly. It is never sent to or
                stored on the Synchron server.
            </Item>
            <Item label="SBHS terms compliance">
                Storing SBHS API results on a central server is{' '}
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">prohibited by SBHS developer terms.</strong>{' '}
                Synchron complies: all SBHS data lives only in your browser.
            </Item>
            <Item label="When it's cleared">
                Signing out wipes localStorage and the Service Worker cache. Signing in as a different student also clears the previous student's data before anything new is loaded.
            </Item>
        </Section>

        {/* Auth tokens */}
        <Section icon={Lock} title="Authentication tokens">
            <Item label="Access token">
                Your SBHS access token is stored only in <strong className="font-medium text-zinc-800 dark:text-zinc-200">localStorage</strong>.
                It is sent to the Synchron server only to validate your identity on each API request — the server reads it,
                verifies it with SBHS, and immediately discards it. It is never written to any database.
            </Item>
            <Item label="Token exchange">
                SBHS uses an OAuth 2 flow. Your browser sends an authorisation code to the Synchron server, which adds the
                client secret and exchanges it for a token with SBHS. This keeps the client secret out of the browser.
                The resulting tokens are sent back to your device; the server holds nothing after the exchange.
            </Item>
            <Item label="Clearing tokens">
                Signing out removes all tokens from localStorage immediately. The server has nothing to clear.
            </Item>
        </Section>

        {/* What the server stores */}
        <Section icon={Database} title="What the Synchron server stores">
            <Item label="Your account record">
                When you first sign in, Synchron creates an account row containing your{' '}
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">student ID, name, email, and year group</strong> — sourced
                from the SBHS identity token (not from timetable or notice data). This is used to show your name in the admin panel,
                track your role, and sync preferences across devices.
            </Item>
            <Item label="Preferences">
                Theme, accent colour, ambient light, and similar UI settings are synced server-side so they carry across devices.
                Your AI opt-in choice is stored here too. These are your own choices, not SBHS API data.
            </Item>
            <Item label="Canvas links">
                Class-to-Canvas URL mappings you create are stored server-side so they sync across your devices and (optionally)
                contribute to community suggestions for your class. Only you can read or modify your own links.
            </Item>
            <Item label="Study notes &amp; assignments">
                Notes and assignments you create in the Study section are stored server-side under your student ID.
                Only you can access them.
            </Item>
            <Item label="Feedback tickets">
                Feedback you submit (category, severity, description) is stored so the dev team can review and respond.
                Archived tickets are automatically deleted after 90 days.
            </Item>
            <Item label="Activity logs">
                Server-side events (sign-ins, preference changes, Canvas link updates) are logged for security auditing.
                Logs older than 30 days are pruned on demand by administrators.
            </Item>
        </Section>

        {/* AI features */}
        <Section icon={Cpu} title="AI features (Sage) — opt-in only">
            <Item label="Opt-in">
                AI features are <strong className="font-medium text-zinc-800 dark:text-zinc-200">off by default.</strong>{' '}
                You must turn them on in Settings. You can disable them at any time and they stop immediately.
            </Item>
            <Item label="What is sent to the AI provider">
                When you ask Sage a question, your <strong className="font-medium text-zinc-800 dark:text-zinc-200">typed question</strong> and
                your <strong className="font-medium text-zinc-800 dark:text-zinc-200">timetable data</strong> (already on your device from SBHS)
                are included in the prompt sent to {aiProviderName}. This is necessary so Sage can answer questions about your schedule.
                The AI provider's own privacy policy applies to data it receives.
            </Item>
            <Item label="What is NOT sent to the AI provider">
                Award scheme data, attendance records, clipboard sessions, notes, assignments, and feedback are never sent to any AI provider.
            </Item>
            <Item label="What Synchron stores from AI interactions">
                <ul className="mt-1 space-y-1.5">
                    <li className="flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span>
                            <strong className="font-medium text-zinc-800 dark:text-zinc-200">Your typed question</strong> (capped at 500 characters)
                            and your student ID are logged for admin review and abuse monitoring.
                            Timetable context is not stored — only the raw text you typed.
                        </span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span>
                            <strong className="font-medium text-zinc-800 dark:text-zinc-200">AI answers are never stored</strong> on the Synchron server.
                        </span>
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                        <span>
                            For the daily notice ranking (Sage briefing), only an ordered list of notice
                            indices is cached — no notice text is ever stored server-side.
                        </span>
                    </li>
                </ul>
            </Item>
            <Item label="AI provider">
                The active AI provider is shown in Settings. Currently:{' '}
                <strong className="font-medium text-zinc-800 dark:text-zinc-200">{aiProviderName}</strong>.
                AI features are only available when you're signed in with a valid SBHS account.
            </Item>
        </Section>

        {/* Data-at-a-glance table */}
        <Section icon={Eye} title="Data at a glance">
            <TableHeader />
            <TableRow
                what="Timetable, notices, awards, attendance"
                where={<><Tag colour="blue">Your device only</Tag></>}
                when={<Tag colour="zinc">Session / offline cache</Tag>}
                canDelete={<Tag colour="green">Sign out</Tag>}
            />
            <TableRow
                what="SBHS access &amp; refresh tokens"
                where={<Tag colour="blue">localStorage</Tag>}
                when={<Tag colour="zinc">Until sign-out</Tag>}
                canDelete={<Tag colour="green">Sign out</Tag>}
            />
            <TableRow
                what="Account (ID, name, email, year)"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Until deleted</Tag>}
                canDelete={<Tag colour="green">Contact admin</Tag>}
            />
            <TableRow
                what="UI preferences &amp; AI opt-in"
                where={<><Tag colour="blue">localStorage</Tag><Tag colour="amber">Synchron server</Tag></>}
                when={<Tag colour="zinc">Until changed</Tag>}
                canDelete={<Tag colour="green">Sign out / contact admin</Tag>}
            />
            <TableRow
                what="Canvas links"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Until deleted</Tag>}
                canDelete={<Tag colour="green">From Canvas Links page</Tag>}
            />
            <TableRow
                what="Study notes &amp; assignments"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Until deleted</Tag>}
                canDelete={<Tag colour="green">From Study page</Tag>}
            />
            <TableRow
                what="Feedback submissions"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">90 days after archival</Tag>}
                canDelete={<Tag colour="zinc">Auto-purged</Tag>}
            />
            <TableRow
                what="Sage question text (AI log)"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Admin-prunable</Tag>}
                canDelete={<Tag colour="green">Contact admin</Tag>}
            />
            <TableRow
                what="AI answers"
                where={<Tag colour="green">Never stored</Tag>}
                when={<Tag>—</Tag>}
                canDelete={<Tag>—</Tag>}
            />
            <TableRow
                what="AI briefing notice priorities"
                where={<Tag colour="amber">Synchron server (index only)</Tag>}
                when={<Tag colour="zinc">1 day / clearable by admin</Tag>}
                canDelete={<Tag colour="green">Admin can clear cache</Tag>}
            />
        </Section>

        {/* Deleting your data */}
        <Section icon={Trash2} title="Deleting your data">
            <Item label="Signing out">
                Signs you out and immediately wipes your tokens, timetable cache, and all offline data from this device.
                Your account record, notes, and Canvas links remain on the server so they're ready when you sign back in.
            </Item>
            <Item label="Requesting full deletion">
                To have your account and all associated server-side data removed, contact the Synchron admin via the feedback form.
                Admin-level deletion removes your account row, notes, assignments, Canvas links, and AI log entries.
            </Item>
        </Section>

        {/* Offline / PWA */}
        <Section icon={Smartphone} title="Offline &amp; PWA usage">
            <Item>
                If you install Synchron as a PWA, your timetable and other SBHS data are cached on your device so the app
                works without a network. This cache is stored by your browser's Service Worker — it never leaves your device.
                Signing out clears it.
            </Item>
        </Section>

        {/* Footer */}
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">
            Synchron BETA · build {typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__.sha : 'latest'}
        </p>
    </div>
);

export default PrivacyView;
