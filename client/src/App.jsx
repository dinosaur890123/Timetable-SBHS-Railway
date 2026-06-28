import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import Navigation from './components/Navigation';
import ThemeToggle from './components/ThemeToggle';
import Home from './components/Home';

const Timetable = lazy(() => import('./components/Timetable'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const DailyNotices = lazy(() => import('./components/DailyNotices'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const AwardSchemeView = lazy(() => import('./components/AwardSchemeView'));
const ClipboardView = lazy(() => import('./components/ClipboardView'));
const NotesView = lazy(() => import('./components/NotesView'));
const FeedbackView = lazy(() => import('./components/FeedbackView'));
const CanvasLinksView = lazy(() => import('./components/CanvasLinksView'));
import {
    fetchDayTimetable,
    fetchDailyNews,
    fetchUserInfo,
    isAuthenticated,
    exchangeToken,
    logout,
    fetchSystemStatus,
    fetchCompleteTimetable,
    fetchAiBriefing,
    fetchTimetableQa,
    fetchUserPreferences,
    saveUserPreferences,
    fetchCanvasLinks,
    saveCanvasLinks as saveCanvasLinksApi,
    fetchSharedCanvasLink
} from './services/api';
import { registerUser } from './services/adminApi';
import { createCheckoutSession, createPortalSession, updateProfileSettings } from './services/billingApi';
import { format, addDays, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, AlertTriangle, XCircle, AlertOctagon, Settings, Sparkles, CreditCard, ShieldCheck, Heart, Mail, X } from 'lucide-react';

function App() {
    // State
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [currentView, setCurrentView] = useState('home');
    const [viewDate, setViewDate] = useState(new Date());
    const [defaultDate, setDefaultDate] = useState(new Date());
    const [timetableViewMode, setTimetableViewMode] = useState('daily');

    useEffect(() => {
        // Check if user is navigating exactly to /admin
        if (window.location.pathname === '/admin') {
            setCurrentView('admin');
        }
    }, []);

    const [timetable, setTimetable] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_timetable');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [completeTimetable, setCompleteTimetable] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_complete_timetable');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('color_theme') || 'zinc');
    const [darkStyle, setDarkStyle] = useState(() => localStorage.getItem('dark_style') || 'true-black');
    const [aiDisabled, setAiDisabled] = useState(() => localStorage.getItem('ai_disabled') === 'true');
    const [notices, setNotices] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_notices');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [user, setUser] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_user');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(() => {
        try {
            if (isAuthenticated() && localStorage.getItem('cached_user')) {
                return false;
            }
        } catch { }
        return true;
    });
    const [authError, setAuthError] = useState(null);
    const [aiBriefing, setAiBriefing] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

    // Billing State
    const [billingMessage, setBillingMessage] = useState(null);
    const [billingLoading, setBillingLoading] = useState(false);

    // Canvas Links State (for timetable clickable links)
    const [canvasLinks, setCanvasLinks] = useState({});
    const [sharedLinks, setSharedLinks] = useState({});

    // Load canvas links on mount
    useEffect(() => {
        if (!user?.studentId) return;

        const loadCanvasLinks = async () => {
            const data = await fetchCanvasLinks();
            if (data && data.links) {
                const linksMap = {};
                data.links.forEach(link => {
                    linksMap[link.className] = link.canvasUrl;
                });
                setCanvasLinks(linksMap);
            }
        };

        loadCanvasLinks();
    }, [user?.studentId]);

    // Fetch shared canvas links for classes that don't have user's link
    useEffect(() => {
        if (!completeTimetable?.timetable?.[0]?.periods) return;

        const fetchSharedLinks = async () => {
            const shared = {};
            const periods = completeTimetable.timetable[0].periods;

            for (const [bellId, period] of Object.entries(periods)) {
                if (!period.title || period.title === 'Free Period' || period.title.toLowerCase().includes('roll call')) continue;
                if (canvasLinks[period.title]) continue;

                const data = await fetchSharedCanvasLink(period.title);
                if (data && data.link && data.link.canvasUrl) {
                    shared[period.title] = data.link.canvasUrl;
                }
            }

            setSharedLinks(shared);
        };

        fetchSharedLinks();
    }, [completeTimetable, canvasLinks]);

    // System State
    const [broadcast, setBroadcast] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_system');
            return cached ? JSON.parse(cached).broadcast : null;
        } catch {
            return null;
        }
    });
    const [maintenance, setMaintenance] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_system');
            return cached ? JSON.parse(cached).maintenance : false;
        } catch {
            return false;
        }
    });
    const [supporters, setSupporters] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_system');
            return cached ? (JSON.parse(cached).supporters || []) : [];
        } catch {
            return [];
        }
    });
    const [currentVersion, setCurrentVersion] = useState(() => {
        try {
            return localStorage.getItem('app_version') || '1.0.0';
        } catch {
            return '1.0.0';
        }
    });

    // Helper function to compare semantic versions
    const compareVersions = (v1, v2) => {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    };
    const hasSyncedTimetable = useRef(false);
    const hasAutoAdvanced = useRef(false);

    // Timetable AI Modal States
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiQaLoading, setAiQaLoading] = useState(false);

    // Date Picker State
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Toast Notification States
    const [toasts, setToasts] = useState([]);

    // Debounced preference save
    const savePreferencesTimeout = useRef(null);
    const syncPreferencesToServer = useRef(false);

    const savePreferences = () => {
        if (!user?.studentId || !syncPreferencesToServer.current) return;

        if (savePreferencesTimeout.current) {
            clearTimeout(savePreferencesTimeout.current);
        }

        savePreferencesTimeout.current = setTimeout(() => {
            const preferences = {
                theme,
                colorTheme,
                darkStyle,
                aiDisabled,
                dashboardLayout: JSON.parse(localStorage.getItem('dashboard_layout') || 'null'),
                clockWidgetFormat: localStorage.getItem('clock_widget_format') || null,
                scratchpadContent: localStorage.getItem('scratchpad_content') || '',
                transitWidgetStop: localStorage.getItem('transit_widget_stop') || null
            };

            saveUserPreferences(user.studentId, preferences).catch(e => {
                console.log("Failed to save preferences to server:", e);
            });
        }, 1000); // Debounce for 1 second
    };

    const handleLayoutChange = (layout) => {
        if (!user?.studentId || !syncPreferencesToServer.current) return;

        if (savePreferencesTimeout.current) {
            clearTimeout(savePreferencesTimeout.current);
        }

        savePreferencesTimeout.current = setTimeout(() => {
            const preferences = {
                theme,
                colorTheme,
                darkStyle,
                aiDisabled,
                dashboardLayout: layout,
                clockWidgetFormat: localStorage.getItem('clock_widget_format') || null,
                scratchpadContent: localStorage.getItem('scratchpad_content') || '',
                transitWidgetStop: localStorage.getItem('transit_widget_stop') || null
            };

            saveUserPreferences(user.studentId, preferences).catch(e => {
                console.log("Failed to save preferences to server:", e);
            });
        }, 1000);
    };

    const addToast = (title, message, type = 'success', persistent = false) => {
        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, title, message, type }]);

        if (!persistent) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, 8000);
        }
    };

    const handleAskAiQuestion = async (e) => {
        e.preventDefault();
        if (!aiQuestion.trim() || aiQaLoading) return;

        setAiQaLoading(true);
        setAiAnswer('');
        try {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const data = await fetchTimetableQa(aiQuestion, timetable, currentMinutes, completeTimetable);
            setAiAnswer(data.answer || "I couldn't generate an answer. Please try again.");
        } catch (err) {
            console.error("AI Q&A failed:", err);
            setAiAnswer("Failed to connect to the AI assistant. Please check your network and try again.");
        } finally {
            setAiQaLoading(false);
        }
    };

    // Poll System Status
    useEffect(() => {
        const pollStatus = async () => {
            try {
                const systemData = await fetchSystemStatus();
                if (systemData) {
                    // Version-based update check
                    if (systemData.version && systemData.version !== currentVersion) {
                        localStorage.setItem('app_version', systemData.version);
                        setCurrentVersion(systemData.version);
                    }

                    // Show broadcast if it's an update and version is newer
                    if (systemData.broadcast?.type === 'update') {
                        const serverVersion = systemData.broadcast.version || systemData.version;
                        if (serverVersion && compareVersions(serverVersion, currentVersion) > 0) {
                            setBroadcast(systemData.broadcast);
                        } else {
                            setBroadcast(null);
                        }
                    } else {
                        setBroadcast(systemData.broadcast);
                    }

                    setMaintenance(systemData.maintenance);
                    setSupporters(systemData.supporters || []);
                }
            } catch (e) {
                console.error("Failed to poll system status", e);
            }
        };

        // Poll every 30 seconds
        const interval = setInterval(pollStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    // Handle billing query parameters and notifications
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const billingStatus = params.get('billing');

        if (billingStatus) {
            // Clean URL params without page reload
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);

            if (billingStatus === 'success') {
                setBillingMessage({
                    type: 'success',
                    text: 'Upgrade Successful! Thank you for subscribing to Synchron Pro. Your account features have been unlocked!'
                });

                // Re-trigger user sync/fetch user info to get the updated status from backend
                if (user && user.studentId) {
                    registerUser({
                        id: user.studentId,
                        name: `${user.givenName} ${user.surname}`,
                        email: user.email,
                        year: user.yearGroup
                    }).then(dbSync => {
                        if (dbSync) {
                            if (dbSync.user) {
                                setUser(prev => {
                                    const merged = prev ? {
                                        ...prev,
                                        role: dbSync.user.role || prev.role,
                                        subscriptionStatus: dbSync.user.subscriptionStatus || null,
                                        stripeCustomerId: dbSync.user.stripeCustomerId || null,
                                        showSupporter: dbSync.user.showSupporter !== false,
                                        blacklisted: dbSync.user.blacklisted || false
                                    } : null;
                                    if (merged) {
                                        localStorage.setItem('cached_user', JSON.stringify(merged));
                                    }
                                    return merged;
                                });
                            }
                            if (dbSync.resolvedFeedbacks && dbSync.resolvedFeedbacks.length > 0) {
                                dbSync.resolvedFeedbacks.forEach(fb => {
                                    addToast(
                                        "Feedback Resolved",
                                        `Your feedback ticket (${fb.ticketNumber}) has been marked as resolved by an admin. Thank you!`,
                                        'resolved',
                                        true
                                    );
                                });
                            }
                        }
                    }).catch(e => console.error("Billing sync failed", e));
                }
            } else if (billingStatus === 'donation-success') {
                setBillingMessage({
                    type: 'success',
                    text: 'Thank you! Your donation was processed successfully. We appreciate your support for Synchron!'
                });
            } else if (billingStatus === 'cancel') {
                setBillingMessage({
                    type: 'info',
                    text: 'Checkout process cancelled. If you have any questions, feel free to contact support!'
                });
            }
        }
    }, [user?.studentId, completeTimetable]);

    // Theme Config
    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
        savePreferences();
    }, [theme]);

    // Dark Style Config
    useEffect(() => {
        const root = window.document.documentElement;
        root.setAttribute('data-dark-style', darkStyle);
        localStorage.setItem('dark_style', darkStyle);
        savePreferences();
    }, [darkStyle]);

    useEffect(() => {
        localStorage.setItem('ai_disabled', aiDisabled ? 'true' : 'false');
        savePreferences();
    }, [aiDisabled]);

    // Color Theme Config
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(
            'theme-zinc',
            'theme-mint',
            'theme-amber',
            'theme-blue',
            'theme-violet',
            'theme-rose',
            'theme-teal',
            'theme-orange',
            'theme-sky'
        );
        if (colorTheme !== 'zinc') {
            root.classList.add(`theme-${colorTheme}`);
        }
        localStorage.setItem('color_theme', colorTheme);
        savePreferences();
    }, [colorTheme]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

    // Auth & Initial Data
    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (code) {
                window.history.replaceState({}, document.title, "/");
                try {
                    await exchangeToken(code);
                } catch (err) {
                    console.error(err);
                    setAuthError(err.message || "Failed to authenticate.");
                    setLoading(false);
                    return;
                }
            }

            if (!isAuthenticated()) {
                setLoading(false);
                return;
            }

            try {
                const [noticesData, userData, systemData] = await Promise.all([
                    fetchDailyNews(),
                    fetchUserInfo(),
                    fetchSystemStatus()
                ]);
                setNotices(noticesData);
                setUser(prev => {
                    const merged = prev ? {
                        ...userData,
                        role: prev.role || userData.role || 'Student',
                        subscriptionStatus: prev.subscriptionStatus || userData.subscriptionStatus || null,
                        stripeCustomerId: prev.stripeCustomerId || userData.stripeCustomerId || null,
                        showSupporter: prev.showSupporter !== undefined ? prev.showSupporter : (userData.showSupporter !== false)
                    } : userData;
                    localStorage.setItem('cached_user', JSON.stringify(merged));
                    return merged;
                });

                localStorage.setItem('cached_notices', JSON.stringify(noticesData));

                if (systemData) {
                    localStorage.setItem('cached_system', JSON.stringify(systemData));

                    // Version-based update check
                    if (systemData.version && systemData.version !== currentVersion) {
                        localStorage.setItem('app_version', systemData.version);
                        setCurrentVersion(systemData.version);
                    }

                    // Show broadcast if it's an update and version is newer
                    if (systemData.broadcast?.type === 'update') {
                        const serverVersion = systemData.broadcast.version || systemData.version;
                        if (serverVersion && compareVersions(serverVersion, currentVersion) > 0) {
                            setBroadcast(systemData.broadcast);
                        } else {
                            setBroadcast(null);
                        }
                    } else {
                        setBroadcast(systemData.broadcast);
                    }

                    setMaintenance(systemData.maintenance);
                    setSupporters(systemData.supporters || []);
                }

                // Attempt to register/update user in Admin Panel in background
                if (userData && userData.studentId) {
                    registerUser({
                        id: userData.studentId,
                        name: `${userData.givenName} ${userData.surname}`,
                        email: userData.email, // SBHS API usually provides this in ID token, checking availability helps
                        year: userData.yearGroup
                    }).then(dbSync => {
                        if (dbSync) {
                            if (dbSync.user) {
                                setUser(prev => {
                                    const updated = prev ? {
                                        ...prev,
                                        role: dbSync.user.role || prev.role,
                                        subscriptionStatus: dbSync.user.subscriptionStatus || null,
                                        stripeCustomerId: dbSync.user.stripeCustomerId || null,
                                        showSupporter: dbSync.user.showSupporter !== false,
                                        blacklisted: dbSync.user.blacklisted || false
                                    } : null;
                                    if (updated) {
                                        localStorage.setItem('cached_user', JSON.stringify(updated));
                                    }
                                    return updated;
                                });
                            }
                            if (dbSync.resolvedFeedbacks && dbSync.resolvedFeedbacks.length > 0) {
                                dbSync.resolvedFeedbacks.forEach(fb => {
                                    addToast(
                                        "Feedback Resolved",
                                        `Your feedback ticket (${fb.ticketNumber}) has been marked as resolved by an admin. Thank you!`,
                                        'resolved',
                                        true
                                    );
                                });
                            }
                        }
                    }).catch(e => console.log("Init sync failed silently", e));

                    // Load user preferences from server
                    fetchUserPreferences(userData.studentId).then(prefData => {
                        if (prefData && prefData.preferences) {
                            const prefs = prefData.preferences;
                            
                            // Apply theme preferences
                            if (prefs.theme) {
                                setTheme(prefs.theme);
                                localStorage.setItem('theme', prefs.theme);
                            }
                            if (prefs.colorTheme) {
                                setColorTheme(prefs.colorTheme);
                                localStorage.setItem('color_theme', prefs.colorTheme);
                            }
                            if (prefs.darkStyle) {
                                setDarkStyle(prefs.darkStyle);
                                localStorage.setItem('dark_style', prefs.darkStyle);
                            }
                            if (prefs.aiDisabled !== undefined) {
                                setAiDisabled(prefs.aiDisabled);
                                localStorage.setItem('ai_disabled', prefs.aiDisabled ? 'true' : 'false');
                            }
                            
                            // Apply dashboard layout
                            if (prefs.dashboardLayout) {
                                localStorage.setItem('dashboard_layout', JSON.stringify(prefs.dashboardLayout));
                            }
                            
                            // Apply other widget-specific preferences
                            if (prefs.clockWidgetFormat) {
                                localStorage.setItem('clock_widget_format', prefs.clockWidgetFormat);
                            }
                            if (prefs.scratchpadContent !== undefined) {
                                localStorage.setItem('scratchpad_content', prefs.scratchpadContent);
                            }
                            if (prefs.transitWidgetStop) {
                                localStorage.setItem('transit_widget_stop', prefs.transitWidgetStop);
                            }
                        }
                        // Enable server sync after initial load
                        syncPreferencesToServer.current = true;
                    }).catch(e => {
                        console.log("Failed to load user preferences", e);
                        // Still enable sync even if load failed
                        syncPreferencesToServer.current = true;
                    });
                }

            } catch (error) {
                console.error(error);
                if (error.message?.includes("401")) logout();
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    // Fetch complete timetable in the background once authenticated
    useEffect(() => {
        if (!user) return;

        const loadCompleteTimetable = async () => {
            try {
                const completeTimetableData = await fetchCompleteTimetable();
                setCompleteTimetable(completeTimetableData);
                localStorage.setItem('cached_complete_timetable', JSON.stringify(completeTimetableData));
            } catch (err) {
                console.warn("Failed to fetch complete timetable in background", err);
            }
        };
        loadCompleteTimetable();
    }, [user]);

    // Fetch Timetable when date changes
    useEffect(() => {
        if (!isAuthenticated()) return;

        const advanceToNextSchoolDay = async () => {
            let nextDay = addDays(new Date(), 1);
            for (let i = 0; i < 42; i++) {
                try {
                    const data = await fetchDayTimetable(nextDay);
                    const inner = data?.timetable?.timetable || data?.timetable;
                    if (inner?.periods && Object.keys(inner.periods).length > 0 && inner.routine) {
                        setViewDate(nextDay);
                        return;
                    }
                } catch (e) {
                    console.error("Error checking next school day", e);
                }
                nextDay = addDays(nextDay, 1);
            }
            setViewDate(addDays(new Date(), 1));
        };

        const loadTimetable = async () => {
            try {
                const data = await fetchDayTimetable(viewDate);
                setTimetable(data);

                if (isSameDay(viewDate, new Date())) {
                    localStorage.setItem('cached_timetable', JSON.stringify(data));

                    if (!hasAutoAdvanced.current) {
                        hasAutoAdvanced.current = true;

                        const inner = data?.timetable?.timetable || data?.timetable;
                        const bells = data?.bells || [];
                        const routine = inner?.routine ? inner.routine.split(',') : [];

                        const toMinutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                        const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

                        // Find the latest end time across all bells in the routine
                        const latestEnd = routine.reduce((max, bellId) => {
                            const bell = bells.find(b => b.bell === bellId);
                            if (!bell) return max;
                            const end = bell.endTime ? toMinutes(bell.endTime) : null;
                            return end !== null ? Math.max(max, end) : max;
                        }, -1);

                        // School ended = all scheduled classes are past; no classes → treat as ended
                        const schoolEnded = latestEnd === -1 || nowMinutes >= latestEnd;

                        if (schoolEnded) await advanceToNextSchoolDay();
                    }
                }
            } catch (err) {
                console.error("Failed to fetch timetable", err);
            }
        };
        loadTimetable();
    }, [viewDate, user]);

    // Fetch AI Briefing in background once notices are loaded
    useEffect(() => {
        if (aiDisabled || !user || !notices || !notices.notices || notices.notices.length === 0) return;

        const isPro = user.role === 'Admin' || user.subscriptionStatus === 'active' || user.subscriptionStatus === 'pro';
        if (!isPro) return;

        const getAiData = async () => {
            setAiLoading(true);
            try {
                const data = await fetchAiBriefing(notices.notices);
                setAiBriefing(data);
            } catch (err) {
                console.error("Failed to load AI briefing:", err);
            } finally {
                setAiLoading(false);
            }
        };
        getAiData();
    }, [notices, user, aiDisabled]);

    // Date Navigation Helpers
    const nextDay = () => setViewDate(d => addDays(d, 1));
    const prevDay = () => setViewDate(d => addDays(d, -1));
    const resetToday = () => setViewDate(defaultDate);

    const handleToggleSupporter = async (checked) => {
        try {
            const updated = await updateProfileSettings(checked);
            const updatedUser = updated.user || updated;
            setUser(prev => {
                const merged = prev ? {
                    ...prev,
                    showSupporter: updatedUser.showSupporter !== false
                } : null;
                if (merged) {
                    localStorage.setItem('cached_user', JSON.stringify(merged));
                }
                return merged;
            });

            // Refresh system status to get updated supporters list
            const status = await fetchSystemStatus();
            if (status && status.supporters) {
                setSupporters(status.supporters);
            }
        } catch (e) {
            console.error("Failed to update supporter setting:", e);
            alert("Failed to update settings. Please try again.");
        }
    };


    if ((maintenance || user?.blacklisted) && currentView !== 'admin') {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-red-900/20 p-6 rounded-full border border-red-500/20 mb-6 animate-pulse">
                    <AlertOctagon size={64} className="text-red-500" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">System Maintenance</h1>
                <p className="text-zinc-400 max-w-md">Synchron is currently undergoing scheduled maintenance. Please check back later.</p>
                {user?.role === 'Admin' && (
                    <button onClick={() => setCurrentView('admin')} className="mt-8 text-xs text-zinc-600 hover:text-white underline">
                        Admin Bypass
                    </button>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center transition-colors">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    <p className="text-zinc-400 text-sm">Loading Synchron...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="transition-colors bg-white dark:bg-zinc-950">
                <Suspense fallback={
                    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-zinc-950">
                        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    </div>
                }>
                    <LandingPage authError={authError} clearAuthError={() => setAuthError(null)} supporters={supporters} />
                </Suspense>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
            <Navigation currentView={currentView} setView={setCurrentView} user={user} />

            <main className="flex-1 overflow-x-hidden overflow-y-auto">
                {/* Top Header */}
                <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-900">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white capitalize">
                            {currentView}
                        </h1>
                        {currentView === 'timetable' && (
                            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg">
                                <button
                                    onClick={() => setTimetableViewMode('daily')}
                                    className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                                        timetableViewMode === 'daily'
                                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    Daily
                                </button>
                                <button
                                    onClick={() => setTimetableViewMode('cycle')}
                                    className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${
                                        timetableViewMode === 'cycle'
                                            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    Cycle
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex flex-col items-end">
                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{user?.givenName} {user?.surname}</span>
                                <span className="text-xs text-zinc-500">{user?.studentId || 'Staff'}</span>
                            </div>
                            <ThemeToggle isDark={theme === 'dark'} toggleTheme={toggleTheme} />
                        </div>

                        <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800"></div>

                        <button
                            onClick={() => setCurrentView('profile')}
                            className={`p-2 rounded-xl transition-colors ${currentView === 'profile' ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white'}`}
                            title="Settings"
                        >
                            <Settings size={20} />
                        </button>
                    </div>
                </header>

                {broadcast && (
                    <div className={`mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium border
                ${broadcast.type === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' :
                            broadcast.type === 'warning' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' :
                                broadcast.type === 'update' ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400' :
                                    'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                        <Info size={18} className="shrink-0" />
                        <span className="flex-1">{broadcast.message}</span>

                        {broadcast.type === 'update' && (
                            <button
                                onClick={() => {
                                    const newVersion = broadcast.version || currentVersion;
                                    localStorage.setItem('app_version', newVersion);
                                    setCurrentVersion(newVersion);
                                    setBroadcast(null);
                                    logout(true);
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ml-auto shrink-0"
                            >
                                Update
                            </button>
                        )}
                    </div>
                )}

                <div className="p-4 md:p-8 max-w-7xl mx-auto">
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center p-12 gap-4">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-zinc-400 text-xs">Loading view...</p>
                        </div>
                    }>

                        {/* HOME VIEW */}
                        {currentView === 'home' && (
                            <Home
                                user={user}
                                timetableData={timetable}
                                notices={notices}
                                setView={setCurrentView}
                                aiBriefing={aiBriefing}
                                aiLoading={aiLoading}
                                theme={theme}
                                toggleTheme={toggleTheme}
                                aiDisabled={aiDisabled}
                                onLayoutChange={handleLayoutChange}
                            />
                        )}

                        {/* TIMETABLE VIEW */}
                        {currentView === 'timetable' && (
                            <div className="space-y-3">
                                {/* Date Controls & AI Button Row - only show in daily view */}
                                {timetableViewMode === 'daily' && (
                                    <>
                                    <div className="flex items-center justify-between gap-2 w-full bg-white dark:bg-zinc-900 py-1.5 px-3 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                                    <div className="flex items-center gap-1">
                                        <button onClick={prevDay} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 shrink-0">
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            onClick={() => setShowDatePicker(!showDatePicker)}
                                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer min-w-[120px] justify-center"
                                        >
                                            <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                                {format(viewDate, 'EEEE')}
                                            </span>
                                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                                                {format(viewDate, 'd MMM')}
                                            </span>
                                        </button>
                                        <button onClick={nextDay} className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-600 dark:text-zinc-400 shrink-0">
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={resetToday}
                                            disabled={isSameDay(viewDate, defaultDate)}
                                            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg transition-all ${
                                                isSameDay(viewDate, defaultDate)
                                                    ? 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed'
                                                    : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                            }`}
                                        >
                                            <CalendarIcon size={11} />
                                            Today
                                        </button>
                                        {!aiDisabled && (
                                            <button
                                                onClick={() => setShowAiModal(true)}
                                                className="h-7 px-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-sm transition active:scale-95 flex items-center gap-1"
                                            >
                                                <Sparkles size={12} className="animate-pulse" />
                                                Ask AI
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {showDatePicker && (
                                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowDatePicker(false)}>
                                        <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="date"
                                                value={format(viewDate, 'yyyy-MM-dd')}
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        setViewDate(new Date(e.target.value));
                                                        setShowDatePicker(false);
                                                    }
                                                }}
                                                className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                                            />
                                        </div>
                                    </div>
                                )}
                                </>
                                )}

                                <Timetable timetableData={timetable} completeTimetable={completeTimetable} viewMode={timetableViewMode} canvasLinks={canvasLinks} sharedLinks={sharedLinks} />
                            </div>
                        )}

                        {/* CALENDAR VIEW */}
                        {currentView === 'calendar' && <CalendarView user={user} />}

                        {/* NOTICES VIEW */}
                        {currentView === 'notices' && (
                            <div className="max-w-3xl mx-auto">
                                <DailyNotices notices={notices} aiBriefing={aiBriefing} />
                            </div>
                        )}

                        {/* AWARD SCHEME VIEW */}
                        {currentView === 'awards' && <AwardSchemeView user={user} />}

                        {/* CLIPBOARD VIEW */}
                        {currentView === 'clipboard' && <ClipboardView user={user} />}

                        {/* NOTES VIEW */}
                        {currentView === 'notes' && <NotesView user={user} timetableData={timetable} setView={setCurrentView} />}

                        {/* FEEDBACK VIEW */}
                        {currentView === 'feedback' && (
                            <FeedbackView user={user} onBack={() => setCurrentView('profile')} />
                        )}

                        {/* CANVAS LINKS VIEW */}
                        {currentView === 'canvas-links' && (
                            <CanvasLinksView onBack={() => setCurrentView('profile')} timetableData={timetable} />
                        )}

                        {/* ADMIN VIEW */}
                        {currentView === 'admin' && <AdminPanel user={user} />}

                        {/* PROFILE VIEW (Simple placeholder) */}
                        {currentView === 'profile' && (() => {
                            const isProUser = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';
                            return (
                                <div className="max-w-5xl mx-auto w-full px-4 flex flex-col md:flex-row gap-6 mt-6 pb-12">

                                    {/* Left Third (Sticky Sidebar) */}
                                    <div className="w-full md:w-1/3 flex flex-col gap-6 shrink-0 md:sticky md:top-[88px] self-start">
                                        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-center space-y-6 shadow-sm flex flex-col">
                                            <div>
                                                <div className="relative w-24 h-24 mx-auto">
                                                    <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-blue-500/20">
                                                        {user?.givenName?.[0]}{user?.surname?.[0]}
                                                    </div>
                                                    {isProUser && (
                                                        <span className="absolute -bottom-1 -right-1 bg-violet-600 text-white p-1.5 rounded-xl border-4 border-white dark:border-zinc-900 shadow-md animate-bounce" title="Synchron Pro Active">
                                                            <Sparkles size={14} />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-6 flex flex-col items-center w-full">
                                                    <h2 className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white flex flex-wrap items-center justify-center gap-2 text-center w-full break-words leading-tight">
                                                        <span>{user?.givenName} {user?.surname}</span>
                                                        {isProUser && (
                                                            <span className="text-[10px] tracking-wider uppercase font-black px-2 py-0.5 bg-gradient-to-r from-violet-600 to-indigo-650 text-white rounded-full animate-pulse shrink-0">Pro</span>
                                                        )}
                                                    </h2>
                                                    <p className="text-[11px] text-zinc-500 mt-1 text-center w-full break-all px-2">{user?.email}</p>
                                                </div>
                                            </div>
                                            <div className="pt-2">
                                                <button
                                                    onClick={logout}
                                                    className="w-full py-3 font-medium text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-colors font-semibold"
                                                >
                                                    Sign Out
                                                </button>
                                            </div>
                                        </div>

                                        {/* Feedback Card */}
                                        <div className="border border-zinc-200 dark:border-zinc-800 p-5 text-left rounded-2xl bg-white dark:bg-zinc-900 select-none space-y-3 shadow-sm">
                                            <div className="flex items-center gap-2">
                                                <Mail size={16} className="text-blue-500 shrink-0" />
                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Feedback</h3>
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                                Report an error or suggest an improvement. Please include as much detail as possible so it can be investigated quickly.
                                            </p>
                                            <button
                                                onClick={() => setCurrentView('feedback')}
                                                className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-black text-white dark:bg-white dark:text-black rounded-xl transition hover:opacity-90 shadow-sm"
                                            >
                                                Open Feedback Form
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right Two-Thirds (Scrolls with page) */}
                                    <div className="w-full md:w-2/3 flex flex-col gap-6">
                                        {/* Billing Message Alert */}
                                        {billingMessage && (
                                            <div className={`p-4 rounded-2xl border flex items-start gap-3 text-sm select-none shadow-sm ${billingMessage.type === 'success'
                                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400'
                                                : 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'
                                                }`}>
                                                <Info size={18} className="shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="font-semibold">{billingMessage.type === 'success' ? 'Subscription Updated' : 'Notice'}</p>
                                                    <p className="text-xs opacity-90 mt-0.5">{billingMessage.text}</p>
                                                </div>
                                                <button onClick={() => setBillingMessage(null)} className="text-xs opacity-50 hover:opacity-100 font-bold">Dismiss</button>
                                            </div>
                                        )}

                                        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 text-center space-y-6 shadow-sm">

                                            {/* Synchron Pro Premium Billing Section */}
                                            <div className="border border-zinc-200 dark:border-zinc-800 p-6 text-left rounded-2xl bg-zinc-50 dark:bg-zinc-950/20 select-none relative overflow-hidden space-y-4">
                                                {isProUser ? (
                                                    <>
                                                        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl -z-10" />
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2.5 bg-violet-100 dark:bg-violet-900/30 rounded-xl text-violet-600 dark:text-violet-400">
                                                                <ShieldCheck size={22} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Synchron Pro Subscriber</h3>
                                                                <p className="text-[11px] text-zinc-500 mt-0.5">Subscription active</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-zinc-650 dark:text-zinc-400 leading-relaxed">
                                                            Thank you for subscribing! Your premium account is fully unlocked. You have access to AI assistants, custom themes, and early updates.
                                                        </p>
                                                        {user?.stripeCustomerId && (
                                                            <button
                                                                disabled={billingLoading}
                                                                onClick={async () => {
                                                                    setBillingLoading(true);
                                                                    try {
                                                                        const session = await createPortalSession();
                                                                        if (session.url) {
                                                                            window.location.href = session.url;
                                                                        }
                                                                    } catch (e) {
                                                                        alert(e.message || "Failed to load billing portal");
                                                                    } finally {
                                                                        setBillingLoading(false);
                                                                    }
                                                                }}
                                                                className="w-full py-2.5 text-xs font-bold text-zinc-900 dark:text-white bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl transition flex items-center justify-center gap-2"
                                                            >
                                                                {billingLoading ? (
                                                                    <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-zinc-900 dark:border-zinc-650 dark:border-t-white rounded-full animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <CreditCard size={14} />
                                                                        Manage Subscription
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -z-10 animate-pulse" />
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
                                                                <Sparkles size={20} />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Upgrade to Synchron Pro</h3>
                                                                <p className="text-[11px] text-zinc-500 mt-0.5">$4.99 annually</p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5 pt-1">
                                                            <div className="flex items-center gap-2 text-xs text-zinc-650 dark:text-zinc-400">
                                                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 animate-pulse" />
                                                                <span>AI-Powered daily briefings & schedule Q&A</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-zinc-650 dark:text-zinc-400">
                                                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                                                                <span>Unlimited access to custom theme colors</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-zinc-650 dark:text-zinc-400">
                                                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
                                                                <span>Priority backend updates & fast load times</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            disabled={billingLoading}
                                                            onClick={async () => {
                                                                setBillingLoading(true);
                                                                try {
                                                                    const session = await createCheckoutSession();
                                                                    if (session.url) {
                                                                        window.location.href = session.url;
                                                                    }
                                                                } catch (e) {
                                                                    alert(e.message || "Failed to start checkout");
                                                                } finally {
                                                                    setBillingLoading(false);
                                                                }
                                                            }}
                                                            className="w-full py-2.5 text-xs font-bold text-white bg-black hover:bg-zinc-900 dark:bg-white dark:text-black dark:hover:bg-zinc-100 rounded-xl transition flex items-center justify-center gap-2 shadow-sm font-space"
                                                        >
                                                            {billingLoading ? (
                                                                <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-white dark:border-zinc-650 dark:border-t-black rounded-full animate-spin" />
                                                            ) : (
                                                                <>
                                                                    <CreditCard size={14} />
                                                                    Upgrade to Pro
                                                                </>
                                                            )}
                                                        </button>
                                                    </>
                                                )}
                                            </div>

                                            {/* One-off Donations Section */}
                                            <div className="border border-zinc-200 dark:border-zinc-800 p-5 text-left rounded-2xl bg-zinc-50 dark:bg-zinc-950/20 select-none space-y-3">
                                                <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                                    <Sparkles size={16} className="text-amber-500 shrink-0" />
                                                    Support Synchron
                                                </h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                                    Synchron is free to use but costs to host. If it helps you get through the school day, consider supporting with a one-off donation!
                                                </p>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { amount: '$1', priceId: import.meta.env.VITE_STRIPE_PRICE_DONATION_1 },
                                                        { amount: '$2', priceId: import.meta.env.VITE_STRIPE_PRICE_DONATION_2 },
                                                        { amount: '$3', priceId: import.meta.env.VITE_STRIPE_PRICE_DONATION_3 }
                                                    ].map((d, index) => (
                                                        <button
                                                            key={index}
                                                            disabled={billingLoading}
                                                            onClick={async () => {
                                                                setBillingLoading(true);
                                                                try {
                                                                    const session = await createCheckoutSession(d.priceId || null, 'payment');
                                                                    if (session.url) {
                                                                        window.location.href = session.url;
                                                                    }
                                                                } catch (e) {
                                                                    alert(e.message || "Failed to start donation checkout");
                                                                } finally {
                                                                    setBillingLoading(false);
                                                                }
                                                            }}
                                                            className="py-2 px-3 text-xs font-bold bg-white hover:bg-zinc-100 dark:bg-zinc-850 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-xl transition flex items-center justify-center gap-1 shadow-sm"
                                                        >
                                                            Donate {d.amount}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* AI Toggle Option */}
                                            <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-2 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-bold text-zinc-900 dark:text-white">AI Features</span>
                                                    <button
                                                        onClick={() => setAiDisabled(prev => !prev)}
                                                        className={`px-3 py-1.5 text-xs font-extrabold uppercase border transition rounded-lg ${aiDisabled
                                                            ? 'bg-zinc-200 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400'
                                                            : 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                                            }`}
                                                    >
                                                        {aiDisabled ? 'Disabled' : 'Enabled'}
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-zinc-500">Enable or disable daily briefings and AI Q&A assistants across your schedule.</p>
                                            </div>

                                            {/* Supporter Toggle Option */}
                                            {isProUser && (
                                                <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-2 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-bold text-zinc-900 dark:text-white">Show Name as Supporter</span>
                                                        <button
                                                            onClick={() => handleToggleSupporter(user.showSupporter === false)}
                                                            className={`px-3 py-1.5 text-xs font-extrabold uppercase border transition rounded-lg ${user.showSupporter === false
                                                                ? 'bg-zinc-200 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400'
                                                                : 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                                                }`}
                                                        >
                                                            {user.showSupporter === false ? 'Hidden' : 'Shown'}
                                                        </button>
                                                    </div>
                                                    <p className="text-[11px] text-zinc-500">Display your name publicly in Settings under the supporter list (Shown by default).</p>
                                                </div>
                                            )}

                                            {/* Color Themes Section */}
                                            <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-3 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl">
                                                <span className="text-sm font-bold text-zinc-900 dark:text-white font-space">Color Themes</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { id: 'zinc', name: 'Default', color: 'bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100' },
                                                        { id: 'mint', name: 'Mint', color: 'bg-emerald-600 border-emerald-600' },
                                                        { id: 'amber', name: 'Amber', color: 'bg-amber-500 border-amber-500' },
                                                        { id: 'blue', name: 'Blue', color: 'bg-blue-600 border-blue-600' },
                                                        { id: 'violet', name: 'Violet', color: 'bg-violet-500 border-violet-500' },
                                                        { id: 'rose', name: 'Rose', color: 'bg-rose-500 border-rose-500' },
                                                        { id: 'teal', name: 'Teal', color: 'bg-teal-600 border-teal-600' },
                                                        { id: 'orange', name: 'Orange', color: 'bg-orange-500 border-orange-500' },
                                                        { id: 'sky', name: 'Sky', color: 'bg-sky-500 border-sky-500' }
                                                    ].map(t => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => setColorTheme(t.id)}
                                                            className={`px-3 py-1.5 text-xs font-black uppercase border transition-all flex items-center gap-1.5 rounded-lg ${colorTheme === t.id
                                                                ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white'
                                                                : 'bg-white hover:bg-zinc-50 text-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                                                                }`}
                                                            title={t.name}
                                                        >
                                                            <span className={`w-3.5 h-3.5 border rounded-sm ${t.color}`} />
                                                            {t.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Dark Mode Style Section */}
                                            <div className={`border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-3 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl transition ${theme !== 'dark' ? 'opacity-50 pointer-events-none grayscale-[0.5]' : ''}`}>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-zinc-900 dark:text-white font-space">Dark Theme Style</span>
                                                    {theme !== 'dark' && <span className="text-[11px] text-zinc-500 mt-0.5">Switch to Dark Mode to use</span>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* True Black Option */}
                                                    <button
                                                        onClick={() => setDarkStyle('true-black')}
                                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col gap-2 ${darkStyle === 'true-black'
                                                            ? 'border-blue-500 bg-blue-500/5'
                                                            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-[#000000]'
                                                            }`}
                                                    >
                                                        <div className="w-full h-16 rounded-md bg-[#000000] border border-zinc-800 flex flex-col p-2 gap-1.5 overflow-hidden">
                                                            <div className="w-full flex items-center justify-between">
                                                                <div className="w-1/3 h-2 bg-zinc-800 rounded-sm"></div>
                                                                <div className="w-4 h-4 bg-zinc-800 rounded-full"></div>
                                                            </div>
                                                            <div className="w-2/3 h-2 bg-zinc-800 rounded-sm mt-1"></div>
                                                            <div className="w-full h-10 bg-zinc-900 rounded-md border border-zinc-800 mt-0.5"></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-center w-full mt-1">True Black</span>
                                                    </button>

                                                    {/* Black Option */}
                                                    <button
                                                        onClick={() => setDarkStyle('black')}
                                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col gap-2 ${darkStyle === 'black'
                                                            ? 'border-blue-500 bg-blue-500/5'
                                                            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-[#1C1C1C]'
                                                            }`}
                                                    >
                                                        <div className="w-full h-16 rounded-md bg-[#1C1C1C] border border-zinc-800 flex flex-col p-2 gap-1.5 overflow-hidden">
                                                            <div className="w-full flex items-center justify-between">
                                                                <div className="w-1/3 h-2 bg-zinc-800 rounded-sm"></div>
                                                                <div className="w-4 h-4 bg-zinc-800 rounded-full"></div>
                                                            </div>
                                                            <div className="w-2/3 h-2 bg-zinc-800 rounded-sm mt-1"></div>
                                                            <div className="w-full h-10 bg-zinc-900 rounded-md border border-zinc-800 mt-0.5"></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-center w-full mt-1">Black</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Canvas Links Section */}
                                            <div className="border border-zinc-200 dark:border-zinc-800 p-5 text-left rounded-2xl bg-zinc-50 dark:bg-zinc-950/20 select-none space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Canvas Links</h3>
                                                </div>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                                    Add Canvas links for your classes. Click on any class in your timetable to open its Canvas page. Links are shared with classmates who have the same class.
                                                </p>
                                                <button
                                                    onClick={() => setCurrentView('canvas-links')}
                                                    className="w-full py-2.5 text-xs font-bold uppercase tracking-wider bg-black text-white dark:bg-white dark:text-black rounded-xl transition hover:opacity-90 shadow-sm"
                                                >
                                                    Manage Canvas Links
                                                </button>
                                            </div>

                                            {/* Public Supporters Section */}
                                            {supporters && supporters.length > 0 && (
                                                <div className="border border-zinc-200 dark:border-zinc-800 p-5 text-left rounded-2xl bg-zinc-50 dark:bg-zinc-950/20 select-none space-y-3">
                                                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                                        <Heart size={16} className="text-rose-500 fill-rose-500 shrink-0 animate-pulse" />
                                                        Synchron Supporters
                                                    </h3>
                                                    <p className="text-xs text-zinc-555 dark:text-zinc-455 leading-relaxed">
                                                        Special thanks to our amazing Pro supporters:
                                                    </p>
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {supporters.map((supporter, idx) => (
                                                            <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-100 dark:border-violet-900/30">
                                                                {supporter}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="text-center pt-4">
                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-600">
                                                    Synchron v{currentVersion}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                    </Suspense>
                </div>

                {/* AI Assistant Popout Modal */}
                {showAiModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 shadow-2xl max-w-md w-full relative overflow-hidden rounded-2xl animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-zinc-150 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/20">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={14} className="text-violet-600 dark:text-violet-400 animate-pulse" />
                                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">
                                        Timetable AI Assistant
                                    </h3>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowAiModal(false);
                                        setAiQuestion('');
                                        setAiAnswer('');
                                    }}
                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Body / Form */}
                            <div className="p-5 space-y-4">
                                {!(user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro') ? (
                                    <div className="space-y-4 py-2 text-center">
                                        <div className="w-12 h-12 bg-violet-100 dark:bg-violet-955/40 text-violet-600 dark:text-violet-400 flex items-center justify-center rounded-full mx-auto animate-pulse">
                                            <Sparkles size={24} />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Unlock AI Schedule Assistant</h4>
                                            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                                                Ask questions about your timetable, class timings, and room changes. Upgrade to Pro for $4.99 annually.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setShowAiModal(false);
                                                setCurrentView('profile');
                                            }}
                                            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-650 text-white text-xs font-bold uppercase tracking-wider hover:from-violet-700 hover:to-indigo-750 transition active:scale-95 rounded-xl font-semibold"
                                        >
                                            Upgrade to Pro ($4.99)
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="text-xs text-zinc-500 font-semibold mb-1">
                                            Ask questions about classes, rooms, teachers, or times
                                        </div>
                                        <form onSubmit={handleAskAiQuestion} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={aiQuestion}
                                                onChange={(e) => setAiQuestion(e.target.value)}
                                                disabled={aiQaLoading}
                                                placeholder={aiQaLoading ? "AI is typing..." : "e.g. What room is my next class? or Who teaches Period 2?"}
                                                className="flex-1 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-all font-medium disabled:opacity-50"
                                            />
                                            <button
                                                type="submit"
                                                disabled={aiQaLoading || !aiQuestion.trim()}
                                                className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {aiQaLoading ? "Asking..." : "Ask"}
                                            </button>
                                        </form>
                                        {aiAnswer && (
                                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <p className="text-xs font-semibold text-zinc-850 dark:text-zinc-200 leading-relaxed">
                                                    💡 {aiAnswer}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Toast Notifications */}
            {toasts.length > 0 && (
                <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
                    {toasts.map(toast => {
                        const isResolved = toast.type === 'resolved';
                        const styles = isResolved
                            ? { wrap: 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700', icon: 'text-green-600 dark:text-green-400', text: 'text-green-800 dark:text-green-200', btn: 'text-green-500 hover:text-green-900 dark:hover:text-green-100' }
                            : { wrap: 'bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-700', icon: 'text-zinc-500 dark:text-zinc-400', text: 'text-zinc-800 dark:text-zinc-200', btn: 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white' };
                        return (
                            <div key={toast.id} className={`pointer-events-auto flex items-start gap-3 px-4 py-3 w-72 shadow-lg text-sm border ${styles.wrap}`}>
                                <Info size={15} className={`shrink-0 mt-0.5 ${styles.icon}`} />
                                <span className={`flex-1 leading-snug ${styles.text}`}>
                                    <span className="font-bold">{toast.title}:</span>{' '}
                                    <span className="font-medium">{toast.message}</span>
                                </span>
                                <button
                                    onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                    className={`shrink-0 transition-colors mt-0.5 ${styles.btn}`}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default App;
