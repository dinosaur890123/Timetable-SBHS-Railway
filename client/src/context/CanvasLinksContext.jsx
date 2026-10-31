import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchCanvasLinks, saveCanvasLinks } from '../services/api';

const CanvasLinksContext = createContext(null);

export const CanvasLinksProvider = ({ children }) => {
    const [canvasLinks, setCanvasLinks] = useState({});
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);

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
        return typeof val === 'string' ? val : (val.url || null);
    }, [canvasLinks]);

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
        getLink
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
