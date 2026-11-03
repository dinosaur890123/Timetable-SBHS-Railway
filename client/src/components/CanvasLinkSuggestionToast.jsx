import React, { useState } from 'react';
import { ExternalLink, Check, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CanvasLinkSuggestionToast = ({ suggestion, onConfirm, onReject, onDismiss }) => {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        await onConfirm(suggestion.id);
        setLoading(false);
    };

    const handleReject = async () => {
        setLoading(true);
        await onReject(suggestion.id);
        setLoading(false);
    };

    const handleOpenLink = (e) => {
        e.stopPropagation();
        window.open(suggestion.canvasUrl, '_blank', 'noopener,noreferrer');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="pointer-events-auto flex flex-col gap-3 px-4 py-4 w-80 shadow-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl"
        >
            <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Info size={16} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
                        Link suggestion
                    </h4>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">
                        <span className="font-medium text-zinc-900 dark:text-zinc-200">{suggestion.className}</span>
                        <br />
                        Is this the correct Canvas link?
                    </p>
                </div>
                <button
                    onClick={onDismiss}
                    className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    disabled={loading}
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate">
                        {suggestion.canvasUrl}
                    </p>
                </div>
                <button
                    onClick={handleOpenLink}
                    className="shrink-0 p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    title="Open link in new tab"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Check size={14} />
                    {loading ? 'Verifying...' : 'Yes, correct'}
                </button>
                <button
                    onClick={handleReject}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <X size={14} />
                    {loading ? 'Rejecting...' : 'No'}
                </button>
            </div>

            {suggestion.verifiedCount > 0 && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 text-center">
                    {suggestion.verifiedCount} {suggestion.verifiedCount === 1 ? 'student has' : 'students have'} verified this link
                </p>
            )}
        </motion.div>
    );
};

export default CanvasLinkSuggestionToast;
