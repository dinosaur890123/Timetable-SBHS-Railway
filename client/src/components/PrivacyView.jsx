import React, { useEffect, useState } from 'react';
import { ArrowLeft, Shield, Database, Cpu, Eye, Trash2, Lock, Server, Smartphone, LogOut } from 'lucide-react';
import { fetchDeletionRequest, requestDataDeletion } from '../services/api';

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

const GlanceRow = ({ what, where, when, canDelete }) => (
    <tr className="align-top">
        <td className="px-5 py-3.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{what}</td>
        <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{where}</div></td>
        <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{when}</div></td>
        <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{canDelete}</div></td>
    </tr>
);

const PrivacyView = ({ onBack, aiProviderName = 'an AI provider' }) => {
    const [deletionRequest, setDeletionRequest] = useState(null);
    const [requestState, setRequestState] = useState('idle'); // idle | sending | error
    const [requestError, setRequestError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchDeletionRequest()
            .then(data => { if (!cancelled) setDeletionRequest(data?.request || null); })
            .catch(() => { /* privacy page still works if the request can't be loaded */ });
        return () => { cancelled = true; };
    }, []);

    const handleRequestDeletion = async () => {
        if (!window.confirm('Request deletion of your account and all server-side data? An admin will review the request. Once completed, this cannot be undone.')) return;
        setRequestState('sending');
        setRequestError('');
        try {
            const data = await requestDataDeletion();
            setDeletionRequest(data.request || null);
            setRequestState('idle');
        } catch (e) {
            setRequestError(e.message || 'Failed to send the request. Please try again.');
            setRequestState('error');
        }
    };

    const pendingRequest = deletionRequest?.status === 'pending' ? deletionRequest : null;

    return (
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
                Award scheme data, attendance records, notes, assignments, and feedback are never sent to any AI provider.
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
            <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[620px]">
                    <thead>
                        <tr className="border-b border-zinc-900/[0.06] dark:border-white/[0.06]">
                            {['What', 'Stored where', 'Kept for', 'Deletable?'].map(h => (
                                <th key={h} className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 font-medium">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
            <GlanceRow
                what="Timetable, notices, awards, attendance"
                where={<><Tag colour="blue">Your device only</Tag></>}
                when={<Tag colour="zinc">Session / offline cache</Tag>}
                canDelete={<Tag colour="green">Sign out</Tag>}
            />
            <GlanceRow
                what="SBHS access &amp; refresh tokens"
                where={<Tag colour="blue">localStorage</Tag>}
                when={<Tag colour="zinc">Until sign-out</Tag>}
                canDelete={<Tag colour="green">Sign out</Tag>}
            />
            <GlanceRow
                what="Account (ID, name, email, year)"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Until deleted</Tag>}
                canDelete={<Tag colour="green">Request below</Tag>}
            />
            <GlanceRow
                what="UI preferences &amp; AI opt-in"
                where={<><Tag colour="blue">localStorage</Tag><Tag colour="amber">Synchron server</Tag></>}
                when={<Tag colour="zinc">Until changed</Tag>}
                canDelete={<Tag colour="green">Sign out / request below</Tag>}
            />
            <GlanceRow
                what="Canvas links"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Until deleted</Tag>}
                canDelete={<Tag colour="green">From Canvas Links page</Tag>}
            />
            <GlanceRow
                what="Feedback submissions"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">90 days after archival</Tag>}
                canDelete={<Tag colour="zinc">Auto-purged</Tag>}
            />
            <GlanceRow
                what="Sage question text (AI log)"
                where={<Tag colour="amber">Synchron server</Tag>}
                when={<Tag colour="zinc">Admin-prunable</Tag>}
                canDelete={<Tag colour="green">Request below</Tag>}
            />
            <GlanceRow
                what="AI answers"
                where={<Tag colour="green">Never stored</Tag>}
                when={<Tag>—</Tag>}
                canDelete={<Tag>—</Tag>}
            />
            <GlanceRow
                what="AI briefing notice priorities"
                where={<Tag colour="amber">Synchron server (index only)</Tag>}
                when={<Tag colour="zinc">1 day / clearable by admin</Tag>}
                canDelete={<Tag colour="green">Admin can clear cache</Tag>}
            />
                    </tbody>
                </table>
            </div>
        </Section>

        {/* Deleting your data */}
        <Section icon={Trash2} title="Deleting your data">
            <Item label="Signing out">
                Signs you out and immediately wipes your tokens, timetable cache, and all offline data from this device.
                Your account record and Canvas links remain on the server so they're ready when you sign back in.
            </Item>
            <Item label="Requesting full deletion">
                Use the button below to ask for your account and all associated server-side data to be removed.
                The request appears in the admin panel, where an admin reviews and processes it.
                Admin-level deletion removes your account row, Canvas links, feedback, and AI log entries.
            </Item>
        </Section>

        {/* Request deletion */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] dark:bg-red-500/[0.06] p-5 sm:p-6">
            <div className="flex items-start gap-3">
                <Trash2 size={18} className="shrink-0 text-red-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Request data deletion</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        Sends a request to the Synchron admins to permanently delete your account and everything stored
                        against it on our servers. SBHS data on your device is cleared separately by signing out.
                    </p>
                    {pendingRequest ? (
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 text-[13px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Deletion requested{pendingRequest.createdAt ? ` on ${new Date(pendingRequest.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''} — pending admin review
                        </div>
                    ) : deletionRequest?.status === 'completed' ? (
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[13px] font-medium">
                            Your server-side data has been deleted.
                        </div>
                    ) : (
                        <button
                            onClick={handleRequestDeletion}
                            disabled={requestState === 'sending'}
                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition-colors"
                        >
                            <Trash2 size={15} />
                            {requestState === 'sending' ? 'Sending request…' : 'Request data deletion'}
                        </button>
                    )}
                    {requestError && (
                        <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{requestError}</p>
                    )}
                </div>
            </div>
        </div>

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
};

export default PrivacyView;
