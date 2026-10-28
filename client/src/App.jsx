import React, { useEffect, useState, useRef, lazy, Suspense, useMemo } from 'react';
import Home from './components/Home';
import { ModernSidebar, ModernTopbar, ModernDock, CommandPalette, buildCommands, useModernShellEffects } from './components/modern/ModernShell';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import AmbientLight from './components/modern/AmbientLight';

const Timetable = lazy(() => import('./components/Timetable'));
const CalendarView = lazy(() => import('./components/CalendarView'));
const DailyNotices = lazy(() => import('./components/DailyNotices'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const AwardSchemeView = lazy(() => import('./components/AwardSchemeView'));
const ClipboardView = lazy(() => import('./components/ClipboardView'));
const StudyView = lazy(() => import('./components/StudyView'));
const FeedbackView = lazy(() => import('./components/FeedbackView'));
const CanvasLinksView = lazy(() => import('./components/CanvasLinksView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const WelcomeModal = lazy(() => import('./components/WelcomeModal'));
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
    saveUserPreferences
} from './services/api';
import { registerUser } from './services/adminApi';
import { format, addDays, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Info, AlertTriangle, XCircle, AlertOctagon, Sparkles, X } from 'lucide-react';
import { CanvasLinksProvider } from './context/CanvasLinksContext';

function App() {
    // State
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const [currentView, setCurrentView] = useState('home');
    const [viewDate, setViewDate] = useState(new Date());
    const [defaultDate, setDefaultDate] = useState(null);
    const [timetableViewMode, setTimetableViewMode] = useState('daily');
    const lastViewRef = useRef('home');

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
    const [railTimetable, setRailTimetable] = useState(null);
    const [completeTimetable, setCompleteTimetable] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_complete_timetable');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('color_theme') || 'zinc');
    const [aiDisabled, setAiDisabled] = useState(() => localStorage.getItem('ai_disabled') === 'true');
    const [ambientLight, setAmbientLight] = useState(() => localStorage.getItem('ambient_light') !== 'off');
    const reduceMotion = useReducedMotion();

    const [paletteOpen, setPaletteOpen] = useState(false);
    useModernShellEffects(setPaletteOpen);

    // Drop settings left behind by the retired Classic interface
    useEffect(() => {
        try {
            ['ui_theme', 'ui_config', 'dark_style'].forEach(key => localStorage.removeItem(key));
        } catch { /* storage unavailable */ }
    }, []);
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


    // Welcome Modal State
    const [showWelcomeModal, setShowWelcomeModal] = useState(false);

    // Offline State
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [usingCachedData, setUsingCachedData] = useState(false);

    // Offline detection
    useEffect(() => {
        const handleOnline = () => {
            setIsOffline(false);
            setUsingCachedData(false);
        };

        const handleOffline = () => {
            setIsOffline(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Detect when using cached data (failed API calls)
    useEffect(() => {
        const originalFetch = window.fetch;

        const fetchWithOfflineDetection = async (...args) => {
            try {
                const response = await originalFetch(...args);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                setUsingCachedData(false);
                return response;
            } catch (error) {
                // If we're offline or the request failed, we might be using cached data
                if (isOffline || error.message.includes('Failed to fetch')) {
                    setUsingCachedData(true);
                }
                throw error;
            }
        };

        window.fetch = fetchWithOfflineDetection;

        return () => {
            window.fetch = originalFetch;
        };
    }, [isOffline]);

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
    const hasSyncedTimetable = useRef(false);
    const hasAutoAdvanced = useRef(false);

    // Timetable AI Modal States
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiQaLoading, setAiQaLoading] = useState(false);

    // Date Picker State
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [calendarPopupRef, setCalendarPopupRef] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date());

    // Close calendar popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (calendarPopupRef && !calendarPopupRef.contains(event.target)) {
                setShowDatePicker(false);
            }
        };

        if (showDatePicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDatePicker, calendarPopupRef]);

    // Generate calendar days for the popup
    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const days = [];
        
        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }
        
        // Add actual days
        for (let day = 1; day <= totalDays; day++) {
            days.push(new Date(year, month, day));
        }
        
        return days;
    }, [calendarMonth]);

    const handleDateSelect = (date) => {
        setViewDate(date);
        setShowDatePicker(false);
    };

    const navigateMonth = (direction) => {
        setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

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
                aiDisabled,
                ambientLight,
                dashboardLayoutMobile: JSON.parse(localStorage.getItem('dashboard_layout_mobile') || 'null'),
                dashboardLayoutDesktop: JSON.parse(localStorage.getItem('dashboard_layout_desktop') || 'null'),
                clockWidgetFormat: localStorage.getItem('clock_widget_format') || null,
                scratchpadContent: localStorage.getItem('scratchpad_content') || '',
                transitWidgetStop: localStorage.getItem('transit_widget_stop') || null
            };

            saveUserPreferences(user.studentId, preferences).catch(e => {
                console.log("Failed to save preferences to server:", e);
            });
        }, 1000); // Debounce for 1 second
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
                    setBroadcast(systemData.broadcast);

                    setMaintenance(systemData.maintenance);
                }
            } catch (e) {
                console.error("Failed to poll system status", e);
            }
        };

        // Poll every 30 seconds
        const interval = setInterval(pollStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const isSignedIn = !!user;

    // Theme Config
    useEffect(() => {
        localStorage.setItem('theme', theme);
        savePreferences();
    }, [theme]);

    // The signed-out landing page is always dark; the saved preference applies once signed in.
    useEffect(() => {
        document.documentElement.classList.toggle('dark', !isSignedIn || theme === 'dark');
    }, [theme, isSignedIn]);

    useEffect(() => {
        localStorage.setItem('ai_disabled', aiDisabled ? 'true' : 'false');
        savePreferences();
    }, [aiDisabled]);

    useEffect(() => {
        localStorage.setItem('ambient_light', ambientLight ? 'on' : 'off');
        savePreferences();
    }, [ambientLight]);

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

    // Match the browser/OS chrome to the themed page background
    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const styles = getComputedStyle(document.documentElement);
        const rgb = styles.getPropertyValue('--m-page').trim();
        if (rgb) meta.setAttribute('content', `rgb(${rgb.split(/\s+/).join(', ')})`);
    }, [colorTheme, theme, isSignedIn]);

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
                    // Check if this is first-time sign-in (no welcome_shown flag)
                    const hasSeenWelcome = localStorage.getItem('welcome_shown');
                    if (!hasSeenWelcome) {
                        setShowWelcomeModal(true);
                        localStorage.setItem('welcome_shown', 'true');
                    }
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
                        role: prev.role || userData.role || 'Student'
                    } : userData;
                    localStorage.setItem('cached_user', JSON.stringify(merged));
                    return merged;
                });

                localStorage.setItem('cached_notices', JSON.stringify(noticesData));

                if (systemData) {
                    localStorage.setItem('cached_system', JSON.stringify(systemData));

                    setBroadcast(systemData.broadcast);

                    setMaintenance(systemData.maintenance);
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
                            if (prefs.aiDisabled !== undefined) {
                                setAiDisabled(prefs.aiDisabled);
                                localStorage.setItem('ai_disabled', prefs.aiDisabled ? 'true' : 'false');
                            }
                            if (prefs.ambientLight !== undefined) {
                                setAmbientLight(prefs.ambientLight);
                                localStorage.setItem('ambient_light', prefs.ambientLight ? 'on' : 'off');
                            }
                            
                            // Keep legacy dashboard layouts round-tripping so saving preferences doesn't wipe them
                            if (prefs.dashboardLayoutMobile) {
                                localStorage.setItem('dashboard_layout_mobile', JSON.stringify(prefs.dashboardLayoutMobile));
                            }
                            if (prefs.dashboardLayoutDesktop) {
                                localStorage.setItem('dashboard_layout_desktop', JSON.stringify(prefs.dashboardLayoutDesktop));
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

    // Helper function to find the next/current school day
    const findNextSchoolDay = async (startDate = new Date()) => {
        // First check if the start date (today) is a valid school day
        try {
            const data = await fetchDayTimetable(startDate);
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

            // Check if this is today and school has ended
            const isToday = isSameDay(startDate, new Date());
            const schoolEnded = latestEnd === -1 || nowMinutes >= latestEnd;

            // If it's a valid school day and (not today or school hasn't ended), return it
            if (inner?.periods && Object.keys(inner.periods).length > 0 && inner.routine) {
                if (!isToday || !schoolEnded) {
                    return startDate;
                }
            }
        } catch (e) {
            console.error("Error checking school day", e);
        }

        // If today is not valid or school has ended, find the next school day
        let nextDay = addDays(startDate, 1);
        for (let i = 0; i < 42; i++) {
            try {
                const data = await fetchDayTimetable(nextDay);
                const inner = data?.timetable?.timetable || data?.timetable;
                if (inner?.periods && Object.keys(inner.periods).length > 0 && inner.routine) {
                    return nextDay;
                }
            } catch (e) {
                console.error("Error checking next school day", e);
            }
            nextDay = addDays(nextDay, 1);
        }
        // Fallback to next day if no school day found
        return addDays(startDate, 1);
    };

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

    // Initialize defaultDate to the next/current school day after authentication
    useEffect(() => {
        if (!user || !isAuthenticated()) return;

        const initializeDefaultDate = async () => {
            const schoolDay = await findNextSchoolDay();
            setDefaultDate(schoolDay);
            setViewDate(schoolDay);
        };

        initializeDefaultDate();
    }, [user]);

    // Fetch Timetable when date changes
    useEffect(() => {
        if (!isAuthenticated()) return;

        const loadTimetable = async () => {
            try {
                const data = await fetchDayTimetable(viewDate);
                setTimetable(data);

                if (isSameDay(viewDate, new Date())) {
                    localStorage.setItem('cached_timetable', JSON.stringify(data));
                }
            } catch (err) {
                console.error("Failed to fetch timetable", err);
            }
        };
        loadTimetable();
    }, [viewDate, user]);

    // Fetch rail timetable for RHS - always shows current school day (if before end) or next school day
    useEffect(() => {
        if (!isAuthenticated()) return;

        const loadRailTimetable = async () => {
            try {
                // Today until its last bell, then the next school day (skipping weekends)
                const railDate = await findNextSchoolDay();
                const data = await fetchDayTimetable(railDate);
                setRailTimetable(data);
            } catch (err) {
                console.error("Failed to fetch rail timetable", err);
            }
        };
        loadRailTimetable();
    }, [user]);

    // Fetch AI Briefing in background once notices are loaded
    useEffect(() => {
        if (aiDisabled || !user || !notices || !notices.notices || notices.notices.length === 0) return;

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
    const resetToday = async () => {
        const schoolDay = await findNextSchoolDay();
        setViewDate(schoolDay);
    };

    // Reset date when leaving the home timetable
    useEffect(() => {
        if (lastViewRef.current === 'home' && currentView !== 'home' && defaultDate) {
            setViewDate(defaultDate);
        }
        lastViewRef.current = currentView;
    }, [currentView, defaultDate]);

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
            <div className="transition-colors bg-m-page">
                <Suspense fallback={
                    <div className="min-h-screen flex items-center justify-center bg-m-page">
                        <div className="w-6 h-6 border-2 border-accent/25 border-t-accent rounded-full animate-spin"></div>
                    </div>
                }>
                    <LandingPage
                        authError={authError}
                        clearAuthError={() => setAuthError(null)}
                    />
                </Suspense>
            </div>
        );
    }

    return (
        <MotionConfig reducedMotion="user">
        <CanvasLinksProvider>
            <div className="relative isolate flex h-[100dvh] overflow-hidden bg-m-page m-ambient text-zinc-900 dark:text-zinc-100">
            {ambientLight && <AmbientLight variant="page" />}
            <ModernSidebar currentView={currentView} setView={setCurrentView} user={user} />

            <main className="relative isolate flex-1 min-w-0 overflow-x-hidden overflow-y-auto bg-m-panel md:my-2 md:mr-2 md:rounded-2xl md:border border-m-line md:shadow-[0_1px_3px_rgb(0_0_0/0.04)]">
                <ModernTopbar
                    currentView={currentView}
                    setView={setCurrentView}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    onOpenPalette={() => setPaletteOpen(true)}
                    isOffline={isOffline}
                    usingCachedData={usingCachedData}
                    timetableViewMode={timetableViewMode}
                    setTimetableViewMode={setTimetableViewMode}
                />
                {ambientLight && <AmbientLight variant="panel" />}
                <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-14 h-72 m-dots" />

                {broadcast && (
                    <div className={`mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium border
                ${broadcast.type === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' :
                            broadcast.type === 'warning' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' :
                                'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                        <Info size={18} className="shrink-0" />
                        <span className="flex-1">{broadcast.message}</span>
                    </div>
                )}

                <div className="relative p-4 md:p-8 pb-28 md:pb-12 max-w-7xl mx-auto">
                    <Suspense fallback={
                        <div className="flex flex-col items-center justify-center p-12 gap-4">
                            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <p className="text-zinc-400 text-xs">Loading view...</p>
                        </div>
                    }>

                        {/* Views cross-fade with a slight lift, so moving between pages feels continuous. */}
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={currentView}
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(6px)' }}
                                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={reduceMotion ? { opacity: 0, transition: { duration: 0.08 } } : { opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
                                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                            >
                            {/* HOME VIEW: greeting, the day's timetable and a side rail */}
                            {currentView === 'home' && (
                                <Home
                                    user={user}
                                    timetableData={timetable}
                                    railTimetable={railTimetable}
                                    viewDate={viewDate}
                                    isCycle={timetableViewMode === 'cycle'}
                                    dayNav={timetableViewMode === 'daily' && (
                                        <>
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={prevDay} aria-label="Previous day" className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors">
                                                    <ChevronLeft size={17} />
                                                </button>
                                                <button
                                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                                    aria-label="Choose date"
                                                    className="flex items-center justify-center gap-2 px-2 h-10 rounded-lg hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors w-[220px]"
                                                >
                                                    <span className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white hidden sm:inline">{format(viewDate, 'EEEE')}</span>
                                                    <span className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white sm:hidden">{format(viewDate, 'EEE')}</span>
                                                    <span className="text-[13px] text-zinc-500 whitespace-nowrap">{format(viewDate, 'd MMMM')}</span>
                                                </button>
                                                <button onClick={nextDay} aria-label="Next day" className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors">
                                                    <ChevronRight size={17} />
                                                </button>
                                            </div>
                        
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {!(defaultDate && isSameDay(viewDate, defaultDate)) && (
                                                    <button
                                                        onClick={resetToday}
                                                        className="h-8 px-2.5 rounded-lg text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
                                                    >
                                                        Today
                                                    </button>
                                                )}
                                                {!aiDisabled && (
                                                    <button
                                                        onClick={() => setShowAiModal(true)}
                                                        aria-label="Ask AI about your timetable"
                                                        className="h-8 px-2.5 rounded-lg border border-zinc-900/10 dark:border-white/10 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
                                                    >
                                                        <Sparkles size={14} className="text-accent" />
                                                        <span className="hidden min-[400px]:inline">Ask AI</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                        
                                    <AnimatePresence>
                                        {showDatePicker && (
                                            <div className="relative" ref={setCalendarPopupRef}>
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden"
                                                >
                                                    <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between gap-1">
                                                        <button
                                                            onClick={() => navigateMonth(-1)}
                                                            className="w-8 h-8 shrink-0 grid place-items-center hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                                                        >
                                                            <ChevronLeft size={14} className="text-zinc-500 dark:text-zinc-400" />
                                                        </button>
                                                        <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">
                                                            {format(calendarMonth, 'MMMM yyyy')}
                                                        </span>
                                                        <button
                                                            onClick={() => navigateMonth(1)}
                                                            className="w-8 h-8 shrink-0 grid place-items-center hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                                                        >
                                                            <ChevronRight size={14} className="text-zinc-500 dark:text-zinc-400" />
                                                        </button>
                                                    </div>
                                                
                                                    <div className="p-3">
                                                        <div className="grid grid-cols-7 gap-1 mb-2">
                                                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                                                <div key={day} className="text-[11px] font-extrabold uppercase text-zinc-400 dark:text-zinc-500 text-center">
                                                                    {day}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    
                                                        <div className="grid grid-cols-7 gap-1">
                                                            {calendarDays.map((date, idx) => {
                                                                if (!date) {
                                                                    return <div key={idx} className="aspect-square" />;
                                                                }
                                                            
                                                                const isSelected = isSameDay(date, viewDate);
                                                                const isToday = isSameDay(date, new Date());
                                                            
                                                                return (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => handleDateSelect(date)}
                                                                        className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                                                                            isSelected
                                                                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                                                                : isToday
                                                                                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                                                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                                        }`}
                                                                    >
                                                                        {format(date, 'd')}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                    </>
                                    )}
                                >
                                    <Timetable timetableData={timetable} completeTimetable={completeTimetable} viewMode={timetableViewMode} />
                                </Home>
                            )}

                            {/* CALENDAR VIEW */}
                            {currentView === 'calendar' && <CalendarView user={user} />}

                            {/* NOTICES VIEW */}
                            {currentView === 'notices' && (
                                <DailyNotices notices={notices} aiBriefing={aiBriefing} user={user} />
                            )}

                            {/* AWARD SCHEME VIEW */}
                            {currentView === 'awards' && <AwardSchemeView user={user} />}

                            {/* CLIPBOARD VIEW */}
                            {currentView === 'clipboard' && <ClipboardView user={user} />}

                            {/* NOTES VIEW */}
                            {currentView === 'notes' && <StudyView />}

                            {/* FEEDBACK VIEW */}
                            {currentView === 'feedback' && (
                                <FeedbackView user={user} onBack={() => setCurrentView('profile')} />
                            )}

                            {/* CANVAS LINKS VIEW */}
                            {currentView === 'canvas-links' && (
                                <CanvasLinksView onBack={() => setCurrentView('profile')} timetableData={timetable} completeTimetable={completeTimetable} />
                            )}

                            {/* ADMIN VIEW */}
                            {currentView === 'admin' && <AdminPanel user={user} />}

                            {/* PROFILE VIEW (Simple placeholder) */}
                            {currentView === 'profile' && (
                                <SettingsView
                                    user={user}
                                    theme={theme}
                                    setTheme={setTheme}
                                    colorTheme={colorTheme}
                                    setColorTheme={setColorTheme}
                                    aiDisabled={aiDisabled}
                                    setAiDisabled={setAiDisabled}
                                    ambientLight={ambientLight}
                                    setAmbientLight={setAmbientLight}
                                    onSignOut={logout}
                                    setView={setCurrentView}
                                />
                            )}
                            </motion.div>
                        </AnimatePresence>
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
                            </div>
                        </div>
                    </div>
                )}

                {/* Welcome Modal for First-Time Sign-In */}
                <Suspense fallback={null}>
                    <WelcomeModal
                        isOpen={showWelcomeModal}
                        onClose={() => setShowWelcomeModal(false)}
                    />
                </Suspense>
            </main>

            <ModernDock
                currentView={currentView}
                setView={setCurrentView}
                onOpenPalette={() => setPaletteOpen(true)}
            />
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                commands={buildCommands({
                    user,
                    setView: setCurrentView,
                    theme,
                    toggleTheme,
                    onAskAi: aiDisabled ? null : () => { setCurrentView('home'); setShowAiModal(true); },
                    onSignOut: logout
                })}
            />

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
        </CanvasLinksProvider>
        </MotionConfig>
    );
}

export default App;
