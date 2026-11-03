import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [platform, setPlatform] = useState('unknown');
    const [dismissed, setDismissed] = useState(false);
    const [checkedInstallability, setCheckedInstallability] = useState(false);

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
            setIsInstallable(true);
            console.log('PWA install prompt available');
        };

        // Listen for appinstalled event
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            setDeferredPrompt(null);
            console.log('PWA installed successfully');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        // For Chrome/Edge on desktop (Windows/Mac): check if PWA criteria are met
        // even if beforeinstallprompt hasn't fired yet
        if ((platform === 'windows' || platform === 'mac' || platform === 'android') && !isInstalled && !dismissed) {
            // Check if we meet PWA criteria
            const checkPWAEligibility = async () => {
                // HTTPS is required (except localhost)
                const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
                
                // Service worker is required
                const hasServiceWorker = 'serviceWorker' in navigator;
                
                // Manifest is required
                const hasManifest = !!document.querySelector('link[rel="manifest"]');
                
                if (isHTTPS && hasServiceWorker && hasManifest) {
                    // Wait a bit for service worker to register
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    try {
                        const registration = await navigator.serviceWorker.getRegistration();
                        if (registration) {
                            // Service worker is active, app is likely installable
                            // Show install button - if beforeinstallprompt fires, it will work
                            // If not, we'll show instructions
                            setIsInstallable(true);
                        }
                    } catch (e) {
                        console.log('Service worker check failed:', e);
                    }
                }
                
                setCheckedInstallability(true);
            };
            
            checkPWAEligibility();
        } else {
            setCheckedInstallability(true);
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, [platform, isInstalled, dismissed]);

    const install = async () => {
        // If we have a deferred prompt from beforeinstallprompt, use it
        if (deferredPrompt) {
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
        }

        // Fallback for Windows/Mac Chrome/Edge when we don't have a deferred prompt yet
        // The browser might show the install icon in the address bar
        if (platform === 'windows' || platform === 'mac') {
            const browserName = navigator.userAgent.includes('Edg') ? 'Edge' : 'Chrome';
            alert(`To install Synchron:\n\n1. Look for the install icon (⊕ or ⬇) in ${browserName}'s address bar\n2. Click it and select "Install"\n\nOr try visiting the site a few times - the install prompt may appear automatically.`);
        } else if (platform === 'android') {
            alert('To install: Look for the "Add to Home Screen" option in your browser menu (⋮).');
        } else {
            alert('To install: Look for the install icon in your browser\'s address bar.');
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

    // For desktop browsers (Windows/Mac), show instructions only if:
    // - Not installed
    // - We've checked installability
    // - No deferred prompt available
    // - Not dismissed
    const showDesktopInstructions = (platform === 'windows' || platform === 'mac') && !isInstalled && checkedInstallability && !deferredPrompt && !dismissed;

    // Show install button if:
    // - Installable (service worker active, HTTPS, etc.)
    // - Not dismissed
    // - For Android or Windows/Mac with Chrome/Edge
    const showInstallButton = isInstallable && !dismissed && (platform === 'android' || platform === 'windows' || platform === 'mac');

    return {
        isInstallable,
        isInstalled,
        platform,
        install,
        dismiss,
        showIOSInstructions,
        showDesktopInstructions,
        showInstallButton,
        deferredPrompt
    };
};
