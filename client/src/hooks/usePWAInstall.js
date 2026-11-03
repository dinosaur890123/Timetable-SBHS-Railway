import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [platform, setPlatform] = useState('unknown');

    useEffect(() => {
        // Detect platform
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
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

        // Check if already installed
        const checkInstalled = () => {
            // Check if running in standalone mode (PWA)
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                                window.navigator.standalone === true ||
                                document.referrer.includes('android-app://');
            
            setIsInstalled(isStandalone);
        };

        checkInstalled();

        // Listen for beforeinstallprompt event (Chrome/Edge desktop and Android)
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setIsInstallable(true);
        };

        // Listen for appinstalled event
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const install = async () => {
        if (!deferredPrompt) return false;

        try {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                setIsInstallable(false);
                setDeferredPrompt(null);
            }
            
            return outcome === 'accepted';
        } catch (error) {
            console.error('PWA install failed:', error);
            return false;
        }
    };

    // iOS doesn't support beforeinstallprompt, so we show instructions
    const showIOSInstructions = platform === 'ios' && !isInstalled;

    return {
        isInstallable,
        isInstalled,
        platform,
        install,
        showIOSInstructions,
        deferredPrompt
    };
};
