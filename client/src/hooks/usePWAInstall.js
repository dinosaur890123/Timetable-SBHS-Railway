import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [platform, setPlatform] = useState('unknown');
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Check if user has dismissed the install prompt
        try {
            const dismissedStored = localStorage.getItem('pwa_install_dismissed');
            if (dismissedStored === 'true') {
                setDismissed(true);
            }
        } catch (e) {
            // Storage unavailable
        }

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
            console.log('PWA install prompt available');
        };

        // Listen for appinstalled event
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setDeferredPrompt(null);
            console.log('PWA installed successfully');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const install = async () => {
        // If we have a deferred prompt from beforeinstallprompt, use it
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    setDeferredPrompt(null);
                }
                
                return outcome === 'accepted';
            } catch (error) {
                console.error('PWA install failed:', error);
                return false;
            }
        }

        // No deferred prompt available - browser may not be ready yet
        // Show helpful message
        if (platform === 'windows' || platform === 'mac') {
            const browserName = navigator.userAgent.includes('Edg') ? 'Edge' : 'Chrome';
            alert(`Install Synchron:\n\nLook for the install icon (⊕ or ⬇) in ${browserName}'s address bar, then click "Install".\n\nYou may need to visit the site a few times for the install option to appear.`);
        } else if (platform === 'android') {
            alert('Install Synchron:\n\nLook for "Add to Home Screen" in your browser menu (⋮).');
        } else {
            alert('Install Synchron:\n\nLook for the install icon in your browser\'s address bar.');
        }
        return false;
    };

    const dismiss = () => {
        try {
            localStorage.setItem('pwa_install_dismissed', 'true');
        } catch (e) {
            // Storage unavailable
        }
        setDismissed(true);
    };

    // iOS doesn't support beforeinstallprompt, so always show instructions if not installed
    const showIOSInstructions = platform === 'ios' && !isInstalled && !dismissed;

    // For Android, Windows, Mac: always show install button if not installed and not dismissed
    // (regardless of whether beforeinstallprompt has fired)
    const showInstallButton = !isInstalled && !dismissed && (platform === 'android' || platform === 'windows' || platform === 'mac');

    return {
        isInstalled,
        platform,
        install,
        dismiss,
        showIOSInstructions,
        showInstallButton,
        deferredPrompt
    };
};
