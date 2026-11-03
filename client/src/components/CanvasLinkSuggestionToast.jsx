import React, { useState } from 'react';
import { ExternalLink, Check, X, Users } from 'lucide-react';
import { motion } from 'framer-motion';

// Asks whether a link a classmate shared is the right Canvas course.
const CanvasLinkSuggestionToast = ({ suggestion, onVote, onDismiss }) => {
    const [busy, setBusy] = useState(null); // 1 | -1 | null
    const [error, setError] = useState('');

    const send = async (value) => {
        setBusy(value);
        setError('');
        const result = await onVote(value);
        if (!result?.ok) {
            setError(result?.error || 'Something went wrong.');
            setBusy(null);
        }
    };

    const others = suggestion.confirmations;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            role="dialog"
            aria-label={`Canvas link for ${suggestion.className}`}
            className="pointer-events-auto flex flex-col gap-3 px-4 py-4 w-[min(20rem,calc(100vw-2rem))] shadow-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Users size={16} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-0.5 truncate">
                        {suggestion.className || suggestion.title}
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">
                        {others === 1 ? 'A classmate' : `${others} classmates`} shared this Canvas link. Is it the right course?
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    disabled={busy !== null}
                    aria-label="Not now"
                    title="Not now"
                    className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <a
                href={suggestion.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                title="Open to check"
            >
                <span className="flex-1 min-w-0 truncate">{suggestion.canvasUrl}</span>
                <ExternalLink size={14} className="shrink-0" />
            </a>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => send(1)}
                    disabled={busy !== null}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Check size={14} />
                    {busy === 1 ? 'Saving…' : 'Yes, use it'}
                </button>
                <button
                    type="button"
                    onClick={() => send(-1)}
                    disabled={busy !== null}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <X size={14} />
                    {busy === -1 ? 'Saving…' : 'Wrong link'}
                </button>
            </div>

            {error && <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        </motion.div>
    );
};

export default CanvasLinkSuggestionToast;
