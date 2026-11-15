import React, { useState } from 'react';
import { Download, X, Share2, PlusCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

// A minimal ghost install button that sits naturally alongside the other topbar
// action buttons. Follows the same protocol as timetabl-app: show when
// beforeinstallprompt is available, disappear once the user interacts.
// Clicking the X dismisses from the topbar and surfaces the install card in Settings.
export const PWAInstallButton = ({ className = '' }) => {
    const { showPrompt, isIOS, hasPrompt, promptToInstall, dismiss } = usePWAInstall();
    const [showIOSModal, setShowIOSModal] = useState(false);
    const [isPrompting, setIsPrompting] = useState(false);

    if (!showPrompt) return null;

    const handleInstall = async () => {
        if (isIOS) {
            setShowIOSModal(true);
            return;
        }
        try {
            setIsPrompting(true);
            await promptToInstall();
        } finally {
            setIsPrompting(false);
        }
    };

    return (
        <>
            {/* Topbar install button — neutral ghost style matching the other topbar controls */}
            <div className={`flex items-center rounded-lg overflow-hidden border border-m-line bg-m-card text-zinc-500 dark:text-zinc-400 ${className}`}>
                <button
                    onClick={handleInstall}
                    disabled={isPrompting}
                    title="Installing Synchron takes up no extra storage and allows faster offline access."
                    aria-label="Install Synchron app"
                    className="flex items-center gap-1.5 h-8 px-2.5 text-[13px] font-medium hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] transition-colors disabled:opacity-40"
                >
                    <Download size={14} className="shrink-0" />
                    <span>Install</span>
                </button>
                <div className="w-px h-4 bg-m-line shrink-0" />
                <button
                    onClick={dismiss}
                    title="Dismiss — also available in Settings"
                    aria-label="Dismiss install prompt"
                    className="h-8 w-7 grid place-items-center hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] transition-colors"
                >
                    <X size={12} />
                </button>
            </div>

            {/* iOS instructions modal */}
            {showIOSModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm"
                    onClick={() => setShowIOSModal(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-m-card border border-m-line shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-m-line">
                            <h3 className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                                Add to Home Screen
                            </h3>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="w-7 h-7 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
                                aria-label="Close"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Steps */}
                        <ol className="px-5 py-4 space-y-3.5">
                            <li className="flex items-start gap-3 text-[13px] text-zinc-600 dark:text-zinc-300">
                                <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.08] font-mono text-[11px] text-zinc-500 dark:text-zinc-400 grid place-items-center">1</span>
                                <span>Tap the <strong className="text-zinc-900 dark:text-white font-medium inline-flex items-center gap-1"><Share2 size={12} className="text-blue-500" /> Share</strong> button in Safari's toolbar.</span>
                            </li>
                            <li className="flex items-start gap-3 text-[13px] text-zinc-600 dark:text-zinc-300">
                                <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.08] font-mono text-[11px] text-zinc-500 dark:text-zinc-400 grid place-items-center">2</span>
                                <span>Scroll down and tap <strong className="text-zinc-900 dark:text-white font-medium inline-flex items-center gap-1"><PlusCircle size={12} /> Add to Home Screen</strong>.</span>
                            </li>
                            <li className="flex items-start gap-3 text-[13px] text-zinc-600 dark:text-zinc-300">
                                <span className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.08] font-mono text-[11px] text-zinc-500 dark:text-zinc-400 grid place-items-center">3</span>
                                <span>Tap <strong className="text-zinc-900 dark:text-white font-medium">Add</strong> in the top-right corner.</span>
                            </li>
                        </ol>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-m-line">
                            <button
                                onClick={() => { dismiss(); setShowIOSModal(false); }}
                                className="text-[12px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                            >
                                Don't show again
                            </button>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="h-8 px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium text-[13px] hover:opacity-90 transition-opacity"
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default PWAInstallButton;
