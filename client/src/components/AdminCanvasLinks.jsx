import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ExternalLink, Pin, EyeOff, RotateCcw, Trash2, Search, Link as LinkIcon, Flag } from 'lucide-react';
import { fetchAdminCanvasLinks, setAdminCanvasLinkStatus, deleteAdminCanvasLink, resetAdminCanvasLinkReports } from '../services/adminApi';

const STATUS_STYLES = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
};

const STATUS_LABELS = { verified: 'In use', pending: 'Waiting for votes', rejected: 'Hidden' };

// Moderation for Canvas links students share with their classes.
const AdminCanvasLinks = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setData(await fetchAdminCanvasLinks());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const act = async (id, action) => {
        setBusyId(id);
        setError('');
        try {
            await action();
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusyId(null);
        }
    };

    const links = useMemo(() => {
        const term = query.trim().toLowerCase();
        const all = data?.links || [];
        if (!term) return all;
        return all.filter(l => [l.classKey, l.className, l.canvasUrl, l.submittedBy].some(v => String(v || '').toLowerCase().includes(term)));
    }, [data, query]);

    return (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div>
                    <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
                        <LinkIcon size={18} className="text-violet-600 dark:text-violet-400" /> Shared Canvas links
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                        {data
                            ? `${data.schoolYear}. A link is used for its class after ${data.thresholds.confirmations} students back it, and hidden after ${data.thresholds.rejections} report it. Pinning or hiding overrides the votes.`
                            : 'Links students share with their classes.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Class, link or student"
                            className="pl-8 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 dark:text-white w-56"
                        />
                    </div>
                    <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-white disabled:opacity-50" title="Refresh">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && <div className="px-4 py-3 text-sm text-red-600 dark:text-red-400 border-b border-zinc-200 dark:border-zinc-800">{error}</div>}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                        <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            <th className="px-4 py-3 font-semibold">Class</th>
                            <th className="px-4 py-3 font-semibold">Link</th>
                            <th className="px-4 py-3 font-semibold text-right">Backed</th>
                            <th className="px-4 py-3 font-semibold text-right">Reported</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                            <th className="px-4 py-3 font-semibold">Shared by</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {links.map(link => {
                            const busy = busyId === link.id;
                            // Extract year from classKey (first digits) for clarity
                            const yearMatch = link.classKey.match(/^(\d+)/);
                            const year = yearMatch ? yearMatch[1] : '';
                            return (
                                <tr key={link.id} className="border-b border-zinc-100 dark:border-zinc-800/60 dark:text-zinc-200">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {year && <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-bold">{year}</span>}
                                            <span className="font-medium">{link.classKey}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <a href={link.canvasUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:text-violet-600 dark:hover:text-violet-400">
                                            {link.canvasUrl.replace(/^https:\/\//, '')} <ExternalLink size={12} />
                                        </a>
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{link.confirmations}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{link.reports}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[link.status]}`}>
                                            {link.lockedStatus === 'verified' ? 'Pinned' : link.lockedStatus === 'rejected' ? 'Hidden by admin' : STATUS_LABELS[link.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{link.submittedBy}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {link.lockedStatus !== 'verified' && (
                                                <button disabled={busy} onClick={() => act(link.id, () => setAdminCanvasLinkStatus(link.id, 'verified'))} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Pin as the class's link">
                                                    <Pin size={14} />
                                                </button>
                                            )}
                                            {link.lockedStatus !== 'rejected' && (
                                                <button disabled={busy} onClick={() => act(link.id, () => setAdminCanvasLinkStatus(link.id, 'rejected'))} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Hide">
                                                    <EyeOff size={14} />
                                                </button>
                                            )}
                                            {link.lockedStatus && (
                                                <button disabled={busy} onClick={() => act(link.id, () => setAdminCanvasLinkStatus(link.id, null))} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Go back to students' votes">
                                                    <RotateCcw size={14} />
                                                </button>
                                            )}
                                            {link.reports > 0 && (
                                                <button
                                                    disabled={busy}
                                                    onClick={() => window.confirm(`Clear all ${link.reports} report${link.reports === 1 ? '' : 's'} on this link? Backers are kept.`) && act(link.id, () => resetAdminCanvasLinkReports(link.id))}
                                                    className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                                                    title="Reset report count"
                                                >
                                                    <Flag size={14} />
                                                </button>
                                            )}
                                            <button
                                                disabled={busy}
                                                onClick={() => window.confirm(`Delete this link and its votes for ${link.className}?`) && act(link.id, () => deleteAdminCanvasLink(link.id))}
                                                className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!loading && links.length === 0 && (
                    <div className="text-center py-10 text-sm text-zinc-500">
                        {query ? 'No links match.' : 'No one has shared a Canvas link this year yet.'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminCanvasLinks;
