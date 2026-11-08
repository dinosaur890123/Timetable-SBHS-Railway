import { useState, useEffect } from 'react';

// Like timetabl-app, there is deliberately no beforeinstallprompt handling:
// once the manifest + service worker make the app installable, the browser
// shows its own install UI (Android mini-infobar, desktop address-bar icon).
export const usePWAInstall = () => {
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

        // Check if already installed using display-mode media query
        const checkInstalled = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                                window.navigator.standalone === true ||
                                document.referrer.includes('android-app://');
            
            setIsInstalled(isStandalone);
        };

        checkInstalled();

        // Listen for display-mode changes (in case user installs while app is open)
        const displayModeQuery = window.matchMedia('(display-mode: standalone)');
        displayModeQuery.addEventListener('change', checkInstalled);

        // Listen for appinstalled event
        const handleAppInstalled = () => {
            setIsInstalled(true);
            console.log('PWA installed successfully');
        };

        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('appinstalled', handleAppInstalled);
            displayModeQuery.removeEventListener('change', checkInstalled);
        };
    }, []);

    const dismiss = () => {
        try {
            localStorage.setItem('pwa_install_dismissed', 'true');
        } catch (e) {
            // Storage unavailable
        }
        setDismissed(true);
    };

    // iOS doesn't support beforeinstallprompt or any native install UI,
    // so instructions are the only way to install there.
    const showIOSInstructions = platform === 'ios' && !isInstalled && !dismissed;

    return {
        isInstalled,
        platform,
        dismiss,
        showIOSInstructions
    };
};
