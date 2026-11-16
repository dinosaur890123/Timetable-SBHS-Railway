import { useState, useEffect, useCallback } from 'react';

// Cache deferred prompt event across component lifecycles so it isn't lost if fired before mount
let globalDeferredPrompt = typeof window !== 'undefined' ? (window.__deferredPWAInstallPrompt || null) : null;
const promptListeners = new Set();

const updateGlobalPrompt = (prompt) => {
    globalDeferredPrompt = prompt;
    if (typeof window !== 'undefined') {
        window.__deferredPWAInstallPrompt = prompt;
    }
    promptListeners.forEach(listener => listener(prompt));
};

const DISMISS_KEY = 'pwa_install_dismissed';
const DISMISS_MONTHS = 2;

const readDismissed = () => {
    try {
        const saved = localStorage.getItem(DISMISS_KEY);
        if (!saved) return false;

        // Migrate the old permanent boolean dismissal into a two-month cooldown.
        const dismissedAt = saved === 'true' ? Date.now() : Number(saved);
        if (!Number.isFinite(dismissedAt)) {
            localStorage.removeItem(DISMISS_KEY);
            return false;
        }
        const expiresAt = new Date(dismissedAt);
        expiresAt.setMonth(expiresAt.getMonth() + DISMISS_MONTHS);
        if (Date.now() < expiresAt.getTime()) {
            if (saved === 'true') localStorage.setItem(DISMISS_KEY, String(dismissedAt));
            return true;
        }
        localStorage.removeItem(DISMISS_KEY);
        return false;
    } catch {
        return false;
    }
};

if (typeof window !== 'undefined') {
    // Listen to beforeinstallprompt event (Chromium browsers)
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default browser banner so the in-app prompt/button controls the install trigger
        e.preventDefault();
        updateGlobalPrompt(e);
    });

    window.addEventListener('appinstalled', () => {
        updateGlobalPrompt(null);
        console.log('PWA was installed successfully');
    });

    window.addEventListener('pwa-prompt-ready', () => {
        if (window.__deferredPWAInstallPrompt && !globalDeferredPrompt) {
            updateGlobalPrompt(window.__deferredPWAInstallPrompt);
        }
    });

    window.addEventListener('pwa-installed', () => {
        updateGlobalPrompt(null);
    });
}

export const usePWAInstall = () => {
    const [isInstalled, setIsInstalled] = useState(() => {
        if (typeof window === 'undefined') return false;
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true ||
            (document.referrer && document.referrer.includes('android-app://'))
        );
    });

    const [hasPrompt, setHasPrompt] = useState(() => Boolean(globalDeferredPrompt));
    const [platform, setPlatform] = useState('desktop');
    const [dismissed, setDismissed] = useState(() => {
        return readDismissed();
    });

    useEffect(() => {
        // Detect platform
        const userAgent = navigator.userAgent || navigator.vendor || window.opera || '';
        let detectedPlatform = 'desktop';

        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            detectedPlatform = 'ios';
        } else if (/Android/.test(userAgent)) {
            detectedPlatform = 'android';
        } else if (/Mac|Macintosh/.test(userAgent)) {
            detectedPlatform = 'mac';
        } else if (/Win/.test(userAgent)) {
            detectedPlatform = 'windows';
        }

        setPlatform(detectedPlatform);

        // Check if already installed using display-mode media query
        const checkInstalled = () => {
            const standalone = (
                window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true ||
                (document.referrer && document.referrer.includes('android-app://'))
            );
            setIsInstalled(standalone);
        };

        checkInstalled();

        const displayModeQuery = window.matchMedia('(display-mode: standalone)');
        displayModeQuery.addEventListener('change', checkInstalled);

        // Sync with global prompt changes
        const onPromptChange = (prompt) => {
            setHasPrompt(Boolean(prompt));
        };
        promptListeners.add(onPromptChange);

        // Catch prompt if it became available on window
        if (globalDeferredPrompt && !hasPrompt) {
            setHasPrompt(true);
        }

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setHasPrompt(false);
            console.log('PWA installed successfully');
        };

        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            promptListeners.delete(onPromptChange);
            displayModeQuery.removeEventListener('change', checkInstalled);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [hasPrompt]);

    const dismiss = useCallback(() => {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {}
        setDismissed(true);
    }, []);

    // Prompt user to install the PWA (opens native browser prompt)
    const promptToInstall = useCallback(async () => {
        if (globalDeferredPrompt) {
            try {
                // Show the browser's native install dialog
                globalDeferredPrompt.prompt();
                const choiceResult = await globalDeferredPrompt.userChoice;
                updateGlobalPrompt(null);
                setHasPrompt(false);

                if (choiceResult?.outcome === 'accepted') {
                    setIsInstalled(true);
                    return { outcome: 'accepted' };
                } else {
                    // User canceled the browser dialog - dismiss from topbar to move to settings
                    dismiss();
                    return { outcome: 'dismissed' };
                }
            } catch (err) {
                console.error('Error showing PWA install prompt:', err);
                return { outcome: 'error', error: err };
            }
        } else if (platform === 'ios') {
            return { outcome: 'ios' };
        }
        return { outcome: 'unavailable' };
    }, [platform, dismiss]);

    const isIOS = platform === 'ios';
    // App is installable if not currently running standalone and either has prompt or is iOS
    const canInstall = !isInstalled && (hasPrompt || isIOS);
    // Show in main UI (topbar) if installable and not dismissed
    const showPrompt = canInstall && !dismissed;
    // Show instructions in settings on iOS when not installed
    const showIOSInstructions = isIOS && !isInstalled;

    return {
        isInstalled,
        hasPrompt,
        canInstall,
        showPrompt,
        platform,
        isIOS,
        dismissed,
        dismiss,
        promptToInstall,
        showIOSInstructions
    };
};
