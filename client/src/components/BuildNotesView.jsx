import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileCode, RefreshCw, Calendar, User, Sparkles } from 'lucide-react';
import { fetchBuildNotes } from '../services/api';

const Section = ({ icon: Icon, title, children, action }) => (
    <section className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <Icon size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
                <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-white">{title}</h2>
            </div>
            {action}
        </div>
        <div className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06]">
            {children}
        </div>
    </section>
);

const NoteBody = ({ children }) => (
    <div className="px-5 py-4">
        {children}
    </div>
);

const BuildNotesView = ({ onBack }) => {
    const [notes, setNotes] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_build_notes');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });
    const [loading, setLoading] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_build_notes');
            return !cached || JSON.parse(cached).length === 0;
        } catch {
            return true;
        }
    });
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [lastSynced, setLastSynced] = useState(() => new Date());

    const loadNotes = async (isManualPoll = false) => {
        if (isManualPoll) {
            setRefreshing(true);
        } else if (notes.length === 0) {
            setLoading(true);
        }
        setError(null);

        try {
            const fetched = await fetchBuildNotes();
            if (Array.isArray(fetched)) {
                setNotes(fetched);
                setLastSynced(new Date());
                try {
                    localStorage.setItem('cached_build_notes', JSON.stringify(fetched));
                } catch {
                }
            }
        } catch (err) {
            console.error('Failed to load build notes:', err);
            if (notes.length === 0) {
                setError('Could not load build notes at this time.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadNotes(false);
    }, []);

    const renderContent = (content) => {
        if (!content) return null;

        const lines = content.split('\n');
        return (
            <div className="space-y-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                {lines.map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-1" />;

                    if (trimmed.startsWith('### ')) {
                        return (
                            <h4 key={idx} className="font-semibold text-[13px] text-zinc-900 dark:text-white pt-2 first:pt-0">
                                {trimmed.replace(/^###\s+/, '')}
                            </h4>
                        );
                    }

                    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                        const itemText = trimmed.replace(/^[-*]\s+/, '');
                        return (
                            <div key={idx} className="flex items-start gap-2.5 pl-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                                <div>{parseInlineFormatting(itemText)}</div>
                            </div>
                        );
                    }

                    return (
                        <p key={idx}>
                            {parseInlineFormatting(trimmed)}
                        </p>
                    );
                })}
            </div>
        );
    };

    const parseInlineFormatting = (text) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return part;
        });
    };

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            <button
                onClick={onBack}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={14} /> Back to Settings
            </button>

            <div className="space-y-1">
                <div className="flex items-center gap-2 text-accent mb-2">
                    <FileCode size={20} strokeWidth={1.6} />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Build notes</h1>
            </div>

            <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                    {lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Never synced'}
                </span>
                <button
                    onClick={() => loadNotes(true)}
                    disabled={refreshing || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                    title="Check for the latest build notes"
                >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Checking…' : 'Check for updates'}
                </button>
            </div>

            {loading ? (
                <Section icon={FileCode} title="Build notes">
                    <NoteBody>
                        <div className="py-8 text-center space-y-3">
                            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-zinc-400">Fetching latest build notes…</p>
                        </div>
                    </NoteBody>
                </Section>
            ) : error ? (
                <Section icon={FileCode} title="Build notes">
                    <NoteBody>
                        <p className="py-6 text-center text-[13px] text-red-500">{error}</p>
                    </NoteBody>
                </Section>
            ) : notes.length === 0 ? (
                <Section icon={Sparkles} title="Build notes">
                    <NoteBody>
                        <div className="py-10 text-center space-y-1">
                            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">No build notes published yet</p>
                            <p className="text-[12px] text-zinc-400">Check back soon for release notes and updates.</p>
                        </div>
                    </NoteBody>
                </Section>
            ) : (
                notes.map((note, index) => (
                    <Section
                        key={note.id || index}
                        icon={FileCode}
                        title={note.title || (note.version ? `Version ${note.version}` : 'Release')}
                        action={(
                            <span className="flex items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
                                {note.version && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold tracking-wide font-mono">
                                        {note.version}
                                    </span>
                                )}
                                {note.author && (
                                    <span className="hidden sm:flex items-center gap-1">
                                        <User size={11} /> {note.author}
                                    </span>
                                )}
                                {note.createdAt && (
                                    <span className="flex items-center gap-1">
                                        <Calendar size={11} />
                                        {new Date(note.createdAt).toLocaleDateString('en-AU', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric'
                                        })}
                                    </span>
                                )}
                            </span>
                        )}
                    >
                        <NoteBody>
                            {renderContent(note.content)}
                        </NoteBody>
                    </Section>
                ))
            )}

            <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">
                © Synchron {new Date().getFullYear()}
            </p>
        </div>
    );
};

export default BuildNotesView;
