import { useState, useEffect, useCallback } from 'react';

let globalDeferredPrompt = typeof window !== 'undefined' ? (window.__deferredPWAInstallPrompt || null) : null;
const promptListeners = new Set();

const updateGlobalPrompt = (prompt) => {
    globalDeferredPrompt = prompt;
    if (typeof window !== 'undefined') {
        window.__deferredPWAInstallPrompt = prompt;
    }
    promptListeners.forEach(listener => listener(prompt));
};

if (typeof window !== 'undefined') {
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
    useEffect(() => {
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

        const onPromptChange = (prompt) => {
            setHasPrompt(Boolean(prompt));
        };
        promptListeners.add(onPromptChange);

        if (globalDeferredPrompt) {
            setHasPrompt(true);
        }

        const handleAppInstalled = () => {
            setIsInstalled(true);
            setHasPrompt(false);
        };

        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            promptListeners.delete(onPromptChange);
            displayModeQuery.removeEventListener('change', checkInstalled);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const promptToInstall = useCallback(async () => {
        if (globalDeferredPrompt) {
            try {
                globalDeferredPrompt.prompt();
                const choiceResult = await globalDeferredPrompt.userChoice;
                updateGlobalPrompt(null);
                setHasPrompt(false);

                if (choiceResult?.outcome === 'accepted') {
                    setIsInstalled(true);
                    return { outcome: 'accepted' };
                } else {
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
    }, [platform]);

    const isIOS = platform === 'ios';
    const canInstall = !isInstalled && (hasPrompt || isIOS);

    return {
        isInstalled,
        hasPrompt,
        canInstall,
        platform,
        isIOS,
        promptToInstall
    };
};
