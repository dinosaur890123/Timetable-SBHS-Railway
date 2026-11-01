import React, { useState, useEffect } from 'react';
import { ArrowLeft, FileCode, RefreshCw, Calendar, User, Sparkles, CheckCircle2 } from 'lucide-react';
import { fetchBuildNotes } from '../services/api';

const BuildNotesView = ({ onBack }) => {
    // Initial state from localStorage cache for instant display
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

    // Sync from backend on page reload/mount or upon manual poll (no recurring background polling)
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
                    // Ignore quota errors
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

    // Sync once on reload / mount. Strictly no interval or constant polling.
    useEffect(() => {
        loadNotes(false);
    }, []);

    // Format content nicely (bullet points, bolding, headings)
    const renderContent = (content) => {
        if (!content) return null;

        const lines = content.split('\n');
        return (
            <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {lines.map((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={idx} className="h-1" />;

                    if (trimmed.startsWith('### ')) {
                        return (
                            <h4 key={idx} className="font-bold text-sm text-zinc-900 dark:text-white pt-2 first:pt-0">
                                {trimmed.replace(/^###\s+/, '')}
                            </h4>
                        );
                    }

                    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                        const itemText = trimmed.replace(/^[-*]\s+/, '');
                        return (
                            <div key={idx} className="flex items-start gap-2.5 pl-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0 mt-2" />
                                <div>{parseInlineFormatting(itemText)}</div>
                            </div>
                        );
                    }

                    return (
                        <p key={idx} className="text-zinc-600 dark:text-zinc-400">
                            {parseInlineFormatting(trimmed)}
                        </p>
                    );
                })}
            </div>
        );
    };

    // Helper for bold formatting (**text**)
    const parseInlineFormatting = (text) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return (
                    <strong key={i} className="font-semibold text-zinc-900 dark:text-white">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return part;
        });
    };

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={14} /> Back to Settings
            </button>

            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/80 pb-6">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-xs font-bold uppercase tracking-widest">
                            <FileCode size={14} /> Build Notes
                        </div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Build notes & changelog</h1>
                        <p className="max-w-2xl text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                            Stay up to date with the latest features, improvements, and fixes shipped directly by the dev team.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                        {lastSynced && (
                            <span className="text-[11px] font-mono text-zinc-400 hidden md:inline">
                                Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        <button
                            onClick={() => loadNotes(true)}
                            disabled={refreshing || loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors shrink-0 disabled:opacity-50"
                            title="Poll backend for latest build notes"
                        >
                            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Polling...' : 'Poll updates'}
                        </button>
                    </div>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="py-16 text-center space-y-3">
                        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs text-zinc-400 font-mono">Fetching latest build notes...</p>
                    </div>
                ) : error ? (
                    <div className="py-12 text-center text-red-500 text-sm">
                        {error}
                    </div>
                ) : notes.length === 0 ? (
                    <div className="py-16 text-center space-y-2 text-zinc-500">
                        <Sparkles size={28} className="mx-auto text-zinc-400" />
                        <p className="text-base font-semibold text-zinc-800 dark:text-zinc-200">No build notes published yet</p>
                        <p className="text-xs text-zinc-400">Check back soon for release notes and updates.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {notes.map((note, index) => (
                            <div
                                key={note.id || index}
                                className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 md:p-6 bg-zinc-50/60 dark:bg-zinc-950/40 space-y-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-900/40">
                                            {note.version}
                                        </span>
                                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                                            {note.title}
                                        </h2>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs text-zinc-400 font-medium">
                                        {note.author && (
                                            <span className="flex items-center gap-1">
                                                <User size={13} /> {note.author}
                                            </span>
                                        )}
                                        {note.createdAt && (
                                            <span className="flex items-center gap-1">
                                                <Calendar size={13} />
                                                {new Date(note.createdAt).toLocaleDateString('en-AU', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-1">
                                    {renderContent(note.content)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer build sha */}
                <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800/60 text-center">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-600">
                        Synchron ALPHA · build {typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__.sha : 'latest'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default BuildNotesView;
