import React, { useState } from 'react';
import { Download, X, Smartphone, Share2, PlusCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton = ({ className = '' }) => {
    const { showPrompt, isIOS, promptToInstall, dismiss } = usePWAInstall();
    const [showIOSModal, setShowIOSModal] = useState(false);
    const [isPrompting, setIsPrompting] = useState(false);

    if (!showPrompt) return null;

    const handleInstallClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

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

    const handleDismissClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
    };

    return (
        <>
            <div
                className={`relative flex items-center h-8 rounded-lg border border-accent/30 bg-accent/10 dark:bg-accent/15 text-accent shadow-sm overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200 ${className}`}
            >
                <button
                    onClick={handleInstallClick}
                    disabled={isPrompting}
                    title="Installing Synchron takes up no extra storage and allows faster offline access."
                    aria-label="Install Synchron application"
                    className="flex items-center gap-1.5 h-full px-2.5 text-[12.5px] font-medium text-accent hover:bg-accent/15 transition-colors disabled:opacity-50"
                >
                    <Download size={14} className="shrink-0" />
                    <span className="hidden min-[380px]:inline">Install</span>
                </button>
                <div className="w-[1px] h-4 bg-accent/25" />
                <button
                    onClick={handleDismissClick}
                    title="Dismiss (moves to Settings)"
                    aria-label="Dismiss install button"
                    className="h-full px-1.5 grid place-items-center text-accent/70 hover:text-accent hover:bg-accent/15 transition-colors"
                >
                    <X size={13} />
                </button>
            </div>

            {/* iOS instructions sheet / modal */}
            {showIOSModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setShowIOSModal(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                                    <Smartphone size={18} />
                                </div>
                                <h3 className="font-semibold text-[15px] text-zinc-900 dark:text-white">
                                    Install on iPhone / iPad
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="w-7 h-7 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                aria-label="Close"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <ol className="space-y-3 text-[13px] text-zinc-600 dark:text-zinc-300">
                            <li className="flex items-start gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[11px] grid place-items-center font-medium mt-0.5">1</span>
                                <span>Tap the <strong className="text-zinc-900 dark:text-white inline-flex items-center gap-1 font-medium"><Share2 size={13} className="text-blue-500" /> Share</strong> button in Safari's bottom toolbar.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[11px] grid place-items-center font-medium mt-0.5">2</span>
                                <span>Scroll down and tap <strong className="text-zinc-900 dark:text-white inline-flex items-center gap-1 font-medium"><PlusCircle size={13} /> Add to Home Screen</strong>.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[11px] grid place-items-center font-medium mt-0.5">3</span>
                                <span>Tap <strong className="text-zinc-900 dark:text-white font-medium">Add</strong> in the top-right corner.</span>
                            </li>
                        </ol>

                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800/80">
                            <button
                                onClick={() => {
                                    dismiss();
                                    setShowIOSModal(false);
                                }}
                                className="text-[12px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                            >
                                Dismiss to Settings
                            </button>
                            <button
                                onClick={() => setShowIOSModal(false)}
                                className="h-8 px-3.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium text-[12px] hover:opacity-90 transition-opacity"
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
