import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchCanvasLinks, saveCanvasLinks, fetchCanvasLinkSuggestions, verifyCanvasLinkSuggestion, rejectCanvasLinkSuggestion, fetchVerifiedCanvasLinks } from '../services/api';

const CanvasLinksContext = createContext(null);

const ensureAbsoluteUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    if (/^(courses\/\d+|\d+$)/i.test(trimmed)) {
        const id = trimmed.replace(/\D/g, '');
        return `https://canvas.instructure.com/courses/${id}`;
    }
    return `https://${trimmed.replace(/^\/+/, '')}`;
};

export const CanvasLinksProvider = ({ children }) => {
    const [canvasLinks, setCanvasLinks] = useState({});
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

    // Load canvas links from localStorage as fallback
    const loadFromLocalStorage = useCallback(() => {
        try {
            const stored = localStorage.getItem('canvas_links');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object') {
                    const normalized = {};
                    Object.entries(parsed).forEach(([k, v]) => {
                        normalized[k] = typeof v === 'string' ? { url: v } : (v?.url ? { url: v.url } : v);
                    });
                    return normalized;
                }
            }
        } catch (e) {
            console.warn('Failed to load canvas links from localStorage:', e);
        }
        return {};
    }, []);

    // Fetch canvas links from backend
    const fetchLinks = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchCanvasLinks();
            if (data?.success && data?.links) {
                const linksMap = {};
                data.links.forEach(link => {
                    linksMap[link.className] = { url: link.canvasUrl };
                });
                setCanvasLinks(linksMap);
                setInitialized(true);
                return linksMap;
            }
        } catch (error) {
            console.warn('Failed to fetch canvas links from backend, using localStorage fallback:', error);
            const localLinks = loadFromLocalStorage();
            setCanvasLinks(localLinks);
            setInitialized(true);
            return localLinks;
        } finally {
            setLoading(false);
        }
    }, [loadFromLocalStorage]);

    // Save canvas links to backend
    const saveLinks = useCallback(async (links) => {
        try {
            const data = await saveCanvasLinks(links);
            if (data?.success) {
                setCanvasLinks(links);
                // Clear localStorage after successful backend save
                localStorage.removeItem('canvas_links');
                return true;
            }
        } catch (error) {
            console.error('Failed to save canvas links to backend:', error);
            // Fallback to localStorage if backend fails
            localStorage.setItem('canvas_links', JSON.stringify(links));
            setCanvasLinks(links);
            return false;
        }
    }, []);

    // Get canvas link for a specific class
    const getLink = useCallback((className) => {
        const val = canvasLinks[className];
        if (!val) return null;
        const raw = typeof val === 'string' ? val : (val.url || null);
        return ensureAbsoluteUrl(raw);
    }, [canvasLinks]);

    // Fetch crowdsourced link suggestions for user's classes
    const fetchSuggestions = useCallback(async (userClasses) => {
        if (!userClasses || userClasses.length === 0) return;

        try {
            const data = await fetchCanvasLinkSuggestions(userClasses);
            if (data?.success && data?.suggestions) {
                // Filter out dismissed suggestions
                const activeSuggestions = data.suggestions.filter(s => !dismissedSuggestions.has(s.id));
                setSuggestions(activeSuggestions);
            }
        } catch (error) {
            console.warn('Failed to fetch canvas link suggestions:', error);
        }
    }, [dismissedSuggestions]);

    // Verify a suggestion
    const verifySuggestion = useCallback(async (suggestionId) => {
        try {
            const data = await verifyCanvasLinkSuggestion(suggestionId);
            if (data?.success) {
                // Remove from suggestions
                setSuggestions(prev => prev.filter(s => s.id !== suggestionId));

                // If auto-adopted, refresh links
                if (data.autoAdopted) {
                    await fetchLinks();
                }

                return { success: true, autoAdopted: data.autoAdopted };
            }
        } catch (error) {
            console.error('Failed to verify suggestion:', error);
            return { success: false, error: error.message };
        }
    }, [fetchLinks]);

    // Reject a suggestion
    const rejectSuggestion = useCallback(async (suggestionId) => {
        try {
            const data = await rejectCanvasLinkSuggestion(suggestionId);
            if (data?.success) {
                // Remove from suggestions
                setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
                return { success: true };
            }
        } catch (error) {
            console.error('Failed to reject suggestion:', error);
            return { success: false, error: error.message };
        }
    }, []);

    // Dismiss a suggestion (temporarily hide)
    const dismissSuggestion = useCallback((suggestionId) => {
        setDismissedSuggestions(prev => new Set([...prev, suggestionId]));
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
    }, []);

    // Merge verified links into user's canvas links
    const mergeVerifiedLinks = useCallback(async (classNames) => {
        try {
            const data = await fetchVerifiedCanvasLinks(classNames);
            if (data?.success && data?.links) {
                const newLinks = { ...canvasLinks };
                Object.entries(data.links).forEach(([className, url]) => {
                    // Only add if user doesn't already have a link for this class
                    if (!newLinks[className]) {
                        newLinks[className] = { url, verified: true };
                    }
                });

                if (Object.keys(newLinks).length > Object.keys(canvasLinks).length) {
                    await saveLinks(newLinks);
                }
            }
        } catch (error) {
            console.warn('Failed to merge verified links:', error);
        }
    }, [canvasLinks, saveLinks]);

    // Initialize: migrate localStorage to backend on first load
    useEffect(() => {
        const initializeLinks = async () => {
            const localLinks = loadFromLocalStorage();
            const hasLocalData = Object.keys(localLinks).length > 0;

            if (hasLocalData) {
                // Migrate local data to backend
                try {
                    await saveLinks(localLinks);
                    console.log('Migrated canvas links from localStorage to backend');
                } catch (error) {
                    console.error('Failed to migrate canvas links:', error);
                    setCanvasLinks(localLinks);
                }
            } else {
                // No local data, fetch from backend
                await fetchLinks();
            }
        };

        initializeLinks();
    }, [loadFromLocalStorage, fetchLinks, saveLinks]);

    const value = {
        canvasLinks,
        loading,
        initialized,
        fetchLinks,
        saveLinks,
        getLink,
        suggestions,
        fetchSuggestions,
        verifySuggestion,
        rejectSuggestion,
        dismissSuggestion,
        mergeVerifiedLinks
    };

    return (
        <CanvasLinksContext.Provider value={value}>
            {children}
        </CanvasLinksContext.Provider>
    );
};

export const useCanvasLinks = () => {
    const context = useContext(CanvasLinksContext);
    if (!context) {
        throw new Error('useCanvasLinks must be used within CanvasLinksProvider');
    }
    return context;
};
