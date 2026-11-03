import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstalled, setIsInstalled] = useState(false);
    const [platform, setPlatform] = useState('unknown');
    const [dismissed, setDismissed] = useState(false);
    const [isChromeOrEdge, setIsChromeOrEdge] = useState(false);

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

        // Detect platform and browser
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

        // Check if using Chrome or Edge (these support installing any site as an app on desktop)
        const isChrome = /Chrome/.test(userAgent) && !/Edge|OPR/.test(userAgent);
        const isEdge = /Edg/.test(userAgent);
        setIsChromeOrEdge(isChrome || isEdge);

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

        // Listen for beforeinstallprompt event (Chrome/Edge desktop and Android)
        // This event only fires when the app passes PWA installation criteria
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
            displayModeQuery.removeEventListener('change', checkInstalled);
        };
    }, []);

    const install = async () => {
        // If we have a deferred prompt from beforeinstallprompt, use it
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                // The deferredPrompt can only be used once
                setDeferredPrompt(null);
                
                if (outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                } else {
                    console.log('User dismissed the install prompt');
                }
                
                return outcome === 'accepted';
            } catch (error) {
                console.error('PWA install failed:', error);
                setDeferredPrompt(null);
                return false;
            }
        }

        // For Windows/Mac Chrome/Edge without deferred prompt:
        // These browsers can install any site as an app, so guide user to browser UI
        if ((platform === 'windows' || platform === 'mac') && isChromeOrEdge) {
            const browserName = isChromeOrEdge && navigator.userAgent.includes('Edg') ? 'Edge' : 'Chrome';
            alert(`To install Synchron:\n\nLook for the install icon (⊕ or ⬇) in ${browserName}'s address bar, then click "Install Synchron".\n\nYou can also visit the site a few times - the install option may appear automatically.`);
        } else if (platform === 'android') {
            alert('To install Synchron:\n\nLook for "Add to Home Screen" in your browser menu (⋮).');
        } else {
            alert('To install Synchron:\n\nLook for the install icon in your browser\'s address bar.');
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

    // Show install button if:
    // - Not installed
    // - Not dismissed
    // - AND one of:
    //   * Android with beforeinstallprompt (creates WebAPK)
    //   * Windows/Mac with Chrome/Edge (can install any site as app)
    const showInstallButton = !isInstalled && 
                              !dismissed && 
                              (
                                (platform === 'android' && !!deferredPrompt) ||
                                ((platform === 'windows' || platform === 'mac') && isChromeOrEdge)
                              );

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
