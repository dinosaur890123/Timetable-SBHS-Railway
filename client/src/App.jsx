import React, { useEffect, useState, useRef, Suspense, useMemo, useCallback } from 'react';
import Home from './components/Home';
import ErrorBoundary from './components/ErrorBoundary';
import { ModernSidebar, ModernTopbar, ModernDock, CommandPalette, buildCommands, useModernShellEffects } from './components/modern/ModernShell';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import AmbientLight from './components/modern/AmbientLight';
import CanvasLinkSuggestions from './components/CanvasLinkSuggestions';

const pageLoaders = {
    timetable: () => import('./components/Timetable'),
    calendar: () => import('./components/CalendarView'),
    notices: () => import('./components/DailyNotices'),
    awards: () => import('./components/AwardSchemeView'),
    clipboard: () => import('./components/ClipboardView'),
    feedback: () => import('./components/FeedbackView'),
    canvasLinks: () => import('./components/CanvasLinksView'),
    buildNotes: () => import('./components/BuildNotesView'),
    settings: () => import('./components/SettingsView'),
    privacy: () => import('./components/PrivacyView'),
    admin: () => import('./components/AdminPanel')
};

const lazyPage = (loader) => {
    const Lazy = React.lazy(async () => {
        for (let attempt = 0; ; attempt++) {
            try {
                const mod = await loader();
                if (mod) return mod;
                throw new Error('Chunk loaded empty');
            } catch (err) {
                if (attempt >= 2) throw err;
                await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
            }
        }
    });
    return Lazy;
};

const Timetable = lazyPage(pageLoaders.timetable);
const CalendarView = lazyPage(pageLoaders.calendar);
const DailyNotices = lazyPage(pageLoaders.notices);
const AdminPanel = lazyPage(pageLoaders.admin);
const LandingPage = lazyPage(() => import('./components/LandingPage'));
const AwardSchemeView = lazyPage(pageLoaders.awards);
const ClipboardView = lazyPage(pageLoaders.clipboard);
const FeedbackView = lazyPage(pageLoaders.feedback);
const CanvasLinksView = lazyPage(pageLoaders.canvasLinks);
const BuildNotesView = lazyPage(pageLoaders.buildNotes);
const PrivacyView = lazyPage(pageLoaders.privacy);
const SettingsView = lazyPage(pageLoaders.settings);

const ARCHIVED_NOTICE_LIMIT = 100;
const STAGING_ACCESS_RESTRICTED_MESSAGE = 'Access restricted to authorized staging testers.';

const SUBPAGE_VIEWS = ['feedback', 'canvas-links', 'build-notes', 'privacy'];

const warmPages = (isAdmin) => Object.entries(pageLoaders).forEach(([name, load]) => {
    if (name !== 'admin' || isAdmin) load().catch(() => {});
});

const authErrorMessage = (err) => {
    const base = err?.message || (typeof err === 'string' ? err : 'Failed to authenticate.');
    if (/failed to fetch|load failed|network|connection|timed out|abort|local network|permission|ERR_LOCAL_NETWORK|ERR_BLOCKED_BY|ERR_FAILED/i.test(base)) {
        return `${base} If this site has a Local network access permission, set it to Allow and try again.`;
    }
    return base;
};

const isStagingAccessDenied = (error) => error?.status === 403 && error?.message === STAGING_ACCESS_RESTRICTED_MESSAGE;
const VALID_UI_LOOKS = ['paper', 'synchron', 'ambient'];
const normalizeUiLook = (look) => VALID_UI_LOOKS.includes(look) ? look : 'paper';
const applyUiLook = (look) => {
    const root = document.documentElement;
    if (look !== 'paper') {
        root.removeAttribute('data-look');
        return;
    }

    root.dataset.look = 'paper';
    if (!document.getElementById('paper-fonts')) {
        const link = document.createElement('link');
        link.id = 'paper-fonts';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&display=swap';
        document.head.appendChild(link);
    }
};
const clearStagingAuthSession = () => {
    ['sbhs_access_token', 'sbhs_refresh_token', 'sbhs_token_expiry', 'sbhs_token_scope', 'cached_user']
        .forEach(key => localStorage.removeItem(key));
};

const weekendClipboardDay = (schoolDay, sessions = []) => {
    const schoolKey = format(schoolDay, 'yyyy-MM-dd');
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const now = Date.now();
    let best = null;
    for (const s of sessions) {
        if (s.cancelled || !s.start) continue;
        const start = new Date(s.start);
        if (new Date(s.end || s.start).getTime() <= now) continue;
        const dow = start.getDay();
        if (dow !== 0 && dow !== 6) continue;
        const key = format(start, 'yyyy-MM-dd');
        if (key >= todayKey && key < schoolKey && (!best || key < best)) best = key;
    }
    return best ? new Date(`${best}T00:00`) : schoolDay;
};

const cachedStudentId = () => {
    try {
        return JSON.parse(localStorage.getItem('cached_user') || 'null')?.studentId || null;
    } catch {
        return null;
    }
};

import {
    fetchDayTimetable,
    peekDayTimetable,
    fetchDailyNews,
    fetchUserInfo,
    isAuthenticated,
    exchangeToken,
    validateServerSession,
    checkAuthState,
    logout,
    performLogin,
    fetchSystemStatus,
    fetchCompleteTimetable,
    fetchUserPreferences,
    saveUserPreferences,
    fetchBuildNotes,
    fetchBroadcastNotifications,
    dismissBroadcastNotification,
    isScopeOutdated,
    fetchNextSchoolDay,
    peekNextSchoolDay,
    refreshAccessToken,
    onCachedDataChange,
    fetchCalendarEvents
} from './services/api';
import { prefetchPages, calendarPage, termsPage, closureLabel, loadClipboardSessions as loadCachedClipboardSessions, peekClipboardSessions } from './services/pageData';
import { useCachedLoad } from './utils/pageCache';
import { registerUser, fetchDeletionRequests, fetchAdminCanvasLinks, fetchAdminFeedback } from './services/adminApi';
import { format, addDays, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Info, AlertTriangle, XCircle, AlertOctagon, AlertCircle } from 'lucide-react';
import { CanvasLinksProvider } from './context/CanvasLinksContext';
import { NotificationsContext } from './context/NotificationsContext';
import { fetchFeedbackStatusNotifications } from './services/feedbackApi';

function App() {
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [uiLook, setUiLook] = useState(() => {
        const look = normalizeUiLook(localStorage.getItem('look'));
        applyUiLook(look);
        return look;
    });
    const [currentView, setCurrentView] = useState('home');
    const [startDay] = useState(() => peekNextSchoolDay());
    const [schoolDayResolved, setSchoolDayResolved] = useState(() => !!startDay);
    const [initialClipboardSessions] = useState(() => peekClipboardSessions(cachedStudentId()) || []);
    const [initialDay] = useState(() => weekendClipboardDay(startDay || new Date(), initialClipboardSessions));
    const [viewDate, setViewDate] = useState(initialDay);
    const userSelectedViewDate = useRef(false);
    const setViewDateFromUser = (nextDate) => {
        userSelectedViewDate.current = true;
        setViewDate(nextDate);
    };
    const [defaultDate, setDefaultDate] = useState(initialDay);
    const [timetableViewMode, setTimetableViewMode] = useState('daily');
    const disableTransitions = () => {
        document.documentElement.classList.add('disable-transitions');
        setTimeout(() => document.documentElement.classList.remove('disable-transitions'), 50);
    };

    useEffect(() => {
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
    const [railTimetable, setRailTimetable] = useState(() => (startDay ? peekDayTimetable(startDay) : null));
    const [timetableKey, setTimetableKey] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const viewedDayKey = useRef(null);
    const [completeTimetable, setCompleteTimetable] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_complete_timetable');
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('color_theme') || 'navy');
    const [ambientLight, setAmbientLight] = useState(() => localStorage.getItem('ambient_light') !== 'off');
    const [showClipboardEvents, setShowClipboardEvents] = useState(() => localStorage.getItem('show_clipboard_events') !== 'false');
    const [canvasLinksEnabled, setCanvasLinksEnabled] = useState(() => localStorage.getItem('canvas_links_enabled') !== 'false');
    const [buildNotes, setBuildNotes] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_build_notes');
            const parsed = cached ? JSON.parse(cached) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [calendarEvents, setCalendarEvents] = useState([]);
    const reduceMotion = useReducedMotion();

    const [paletteOpen, setPaletteOpen] = useState(false);
    const [paletteFocusOnOpen, setPaletteFocusOnOpen] = useState(false);
    useModernShellEffects(setPaletteOpen, setPaletteFocusOnOpen);

    useEffect(() => {
        try {
            ['ui_theme', 'ui_config', 'dark_style'].forEach(key => localStorage.removeItem(key));
        } catch {}
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
    const [authInProgress, setAuthInProgress] = useState(false);
    const [tokenScopeOutdated, setTokenScopeOutdated] = useState(false);
    const [reauthRequired, setReauthRequired] = useState(false);
    const [clipboardSessions, setClipboardSessions] = useState(() => peekClipboardSessions(user?.studentId) || []);

    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [usingCachedData, setUsingCachedData] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);

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

    useEffect(() => onCachedDataChange(setUsingCachedData), []);

    useEffect(() => {
        const handleReauthRequired = () => setReauthRequired(true);
        window.addEventListener('synchron:reauth-required', handleReauthRequired);
        return () => window.removeEventListener('synchron:reauth-required', handleReauthRequired);
    }, []);

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
    const [festiveAmbient, setFestiveAmbient] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_system');
            return cached ? !!JSON.parse(cached).festiveAmbient : false;
        } catch {
            return false;
        }
    });
    const [hiddenPages, setHiddenPages] = useState(() => {
        try {
            const cachedSystem = localStorage.getItem('cached_system');
            if (cachedSystem) {
                const parsed = JSON.parse(cachedSystem);
                if (Array.isArray(parsed.hiddenPages)) return parsed.hiddenPages;
            }
            const stored = localStorage.getItem('hidden_pages');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });
    const calPage = user?.studentId && !hiddenPages.includes('calendar')
        ? calendarPage(user.studentId, viewDate)
        : null;
    const { data: calMonth } = useCachedLoad(calPage?.key ?? null, calPage?.load);
    const weekLabel = useMemo(() => {
        if (!calMonth) return null;
        const dow = viewDate.getDay();
        const weekStart = format(addDays(viewDate, -dow), 'yyyy-MM-dd');
        const weekEnd = format(addDays(viewDate, 6 - dow), 'yyyy-MM-dd');
        const groups = calMonth.filter(g => {
            const d = g.info?.date;
            return d >= weekStart && d <= weekEnd && g.info?.week;
        });
        const week = groups[0]?.info.week;
        if (!week) return null;
        const weekType = groups.map(g => g.info.weekType).find(Boolean) || '';
        return `${week}${weekType}`;
    }, [calMonth, viewDate]);

    const currentWeekLetter = useMemo(() => {
        const weekLetter = (name) => (name || '').trim().match(/([A-Z])$/)?.[1] || null;

        const railName = railTimetable?.timetable?.timetable?.dayname || railTimetable?.timetable?.dayname;
        const railLetter = weekLetter(railName);
        if (railLetter) return railLetter;

        const todayData = peekDayTimetable(new Date());
        const todayName = todayData?.timetable?.timetable?.dayname || todayData?.timetable?.dayname;
        const todayLetter = weekLetter(todayName);
        if (todayLetter) return todayLetter;

        if (calMonth) {
            const now = new Date();
            const dow = now.getDay();
            const weekStart = format(addDays(now, -dow), 'yyyy-MM-dd');
            const weekEnd = format(addDays(now, 6 - dow), 'yyyy-MM-dd');
            const groups = calMonth.filter(g => {
                const d = g.info?.date;
                return d >= weekStart && d <= weekEnd && g.info?.weekType;
            });
            const calType = groups.map(g => g.info.weekType).find(Boolean);
            if (calType) return calType;
        }

        try {
            const cached = JSON.parse(localStorage.getItem('cached_timetable') || '{}');
            const cachedName = cached?.timetable?.timetable?.dayname || cached?.timetable?.dayname;
            const cachedLetter = weekLetter(cachedName);
            if (cachedLetter) return cachedLetter;
        } catch {}

        return null;
    }, [railTimetable, calMonth]);

    const hasSyncedTimetable = useRef(false);
    const hasAutoAdvanced = useRef(false);

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'hidden_pages') {
                try {
                    const stored = e.newValue;
                    setHiddenPages(stored ? JSON.parse(stored) : []);
                } catch {
                    setHiddenPages([]);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [calendarPopupRef, setCalendarPopupRef] = useState(null);
    const [calendarMonth, setCalendarMonth] = useState(new Date());

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

    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const days = [];

        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }

        for (let day = 1; day <= totalDays; day++) {
            days.push(new Date(year, month, day));
        }

        return days;
    }, [calendarMonth]);

    const { data: pickerTerms } = useCachedLoad(user ? termsPage().key : null, termsPage().load);
    const [pickerCalendarEvents, setPickerCalendarEvents] = useState([]);

    useEffect(() => {
        if (!user || !showDatePicker) return;

        const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
        const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);

        fetchCalendarEvents(monthStart, monthEnd)
            .then(data => setPickerCalendarEvents(data || []))
            .catch(err => console.error("Failed to fetch calendar events for picker", err));
    }, [calendarMonth, showDatePicker, user]);

    const handleDateSelect = (date) => {
        setViewDateFromUser(date);
        setShowDatePicker(false);
    };

    const navigateMonth = (direction) => {
        setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    const [archivedNotices, setArchivedNotices] = useState([]);
    const [adminNotices, setAdminNotices] = useState([]);
    const [adminTabRequest, setAdminTabRequest] = useState(null);

    const archiveNotice = useCallback((notice) => {
        setArchivedNotices(prev => [notice, ...prev.slice(0, ARCHIVED_NOTICE_LIMIT - 1)]);
    }, []);

    const queueFeedbackStatusNotices = useCallback((updates = []) => {
        updates.forEach(fb => {
            const isImplemented = ['implemented', 'resolved'].includes(fb.status);
            const statusLabel = ({
                considering: 'under consideration',
                implemented: 'implemented',
                resolved: 'implemented',
                rejected: 'rejected'
            })[fb.status] || fb.status;
            archiveNotice({
                id: `feedback-status-${fb.id}-${fb.status}`,
                title: 'Feedback status updated',
                message: isImplemented
                    ? `Your feedback ticket (${fb.ticketNumber}) has been resolved and will be implemented in the next release of Synchron.`
                    : `Your feedback ticket (${fb.ticketNumber}) is now ${statusLabel}.`,
                type: isImplemented ? 'resolved' : 'feedback-status',
                at: Date.now()
            });
        });
    }, [archiveNotice]);

    useEffect(() => {
        if (!user?.studentId) return;
        let active = true;
        const pollFeedbackStatus = async () => {
            try {
                const updates = await fetchFeedbackStatusNotifications();
                if (active && updates.length) queueFeedbackStatusNotices(updates);
            } catch {}
        };
        const initialTimer = setTimeout(pollFeedbackStatus, 15000);
        const interval = setInterval(pollFeedbackStatus, 60000);
        const onFocus = () => { if (!document.hidden) pollFeedbackStatus(); };
        window.addEventListener('focus', onFocus);
        return () => {
            active = false;
            clearTimeout(initialTimer);
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, [user?.studentId, queueFeedbackStatusNotices]);

    const removeNotice = useCallback((id) => {
        setArchivedNotices(prev => prev.filter(n => n.id !== id));
        const notice = archivedNotices.find(n => n.id === id);
        if (notice?.broadcastId) {
            dismissBroadcastNotification(notice.broadcastId)
                .catch(() => archiveNotice(notice));
        }
    }, [archivedNotices, archiveNotice]);

    const clearNotices = useCallback(() => {
        archivedNotices.forEach(n => {
            if (n.broadcastId) dismissBroadcastNotification(n.broadcastId).catch(() => {});
        });
        setArchivedNotices([]);
    }, [archivedNotices]);

    const notificationsValue = useMemo(() => ({
        items: archivedNotices,
        archive: archiveNotice,
        remove: removeNotice,
        clear: clearNotices
    }), [archivedNotices, archiveNotice, removeNotice, clearNotices]);

    const [broadcastNotices, setBroadcastNotices] = useState([]);

    useEffect(() => {
        if (!user?.studentId) {
            setBroadcastNotices([]);
            return undefined;
        }
        let cancelled = false;
        const load = async () => {
            const list = await fetchBroadcastNotifications();
            if (!cancelled) setBroadcastNotices(list);
        };
        load();
        const interval = setInterval(() => {
            if (!document.hidden) load();
        }, 60 * 1000);
        const handleVisibilityChange = () => {
            if (!document.hidden) load();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user?.studentId]);

    useEffect(() => {
        if (broadcastNotices.length === 0) return;
        setArchivedNotices(prev => {
            const serverIds = new Set(broadcastNotices.map(n => n.id));
            const kept = prev.filter(n => !n.broadcastId || serverIds.has(n.id));
            const existing = new Set(kept.map(n => n.id));
            const fresh = broadcastNotices
                .filter(n => !existing.has(n.id))
                .map(n => ({
                    id: n.id,
                    broadcastId: n.id,
                    type: 'broadcast',
                    title: 'Announcement',
                    message: n.message,
                    at: n.createdAt
                }));
            return [...fresh, ...kept].slice(0, ARCHIVED_NOTICE_LIMIT);
        });
    }, [broadcastNotices]);

    useEffect(() => {
        if (user?.role !== 'Admin') {
            setAdminNotices([]);
            return undefined;
        }

        let cancelled = false;
        const loadAdminNotices = async () => {
            const [requestsResult, linksResult, feedbackResult] = await Promise.allSettled([
                fetchDeletionRequests(),
                fetchAdminCanvasLinks(),
                fetchAdminFeedback()
            ]);
            if (cancelled) return;

            setAdminNotices(prev => {
                const canvasNotices = linksResult.status === 'fulfilled'
                    ? (linksResult.value?.links || [])
                        .map(link => ({ ...link, pendingReports: link.reports - (link.reportsAcknowledged || 0) }))
                        .filter(link => link.pendingReports > 0)
                        .sort((a, b) => b.pendingReports - a.pendingReports)
                        .map(link => ({
                            id: `admin-canvas-report-${link.id}-${link.pendingReports}`,
                            source: 'admin-canvas',
                            type: 'admin_canvas_report',
                            title: `Reported Canvas link · ${link.pendingReports} report${link.pendingReports === 1 ? '' : 's'}`,
                            message: `${link.className} — ${link.canvasUrl}`,
                            actionTab: 'notifications'
                        }))
                    : prev.filter(item => item.source !== 'admin-canvas');

                const feedbackNotices = feedbackResult.status === 'fulfilled'
                    ? (feedbackResult.value || [])
                        .filter(entry => entry.status === 'open')
                        .map(entry => {
                            const details = String(entry.details || '').replace(/\s+/g, ' ').trim();
                            const preview = details.length > 140 ? `${details.slice(0, 137)}…` : details;
                            const category = entry.category === 'error' ? 'Error' : 'Suggestion';
                            return {
                                id: `admin-feedback-${entry.id}`,
                                source: 'admin-feedback',
                                type: 'admin_feedback',
                                title: `Feedback ${entry.ticketNumber || 'submission'}`,
                                message: `${category} from ${entry.name || entry.studentId} · Severity ${entry.severity}${preview ? ` — ${preview}` : ''}`,
                                at: entry.createdAt,
                                actionTab: 'feedback'
                            };
                        })
                    : prev.filter(item => item.source !== 'admin-feedback');

                const deletionNotices = requestsResult.status === 'fulfilled'
                    ? (requestsResult.value || [])
                        .filter(request => request.status === 'pending')
                        .map(request => ({
                            id: `admin-deletion-${request.id}`,
                            source: 'admin-deletion',
                            type: 'admin_deletion_request',
                            title: 'Data deletion request',
                            message: `${request.name || request.studentId} (${request.studentId}) asked for their server-side data to be deleted.`,
                            at: request.createdAt,
                            actionTab: 'notifications'
                        }))
                    : prev.filter(item => item.source !== 'admin-deletion');

                return [...feedbackNotices, ...canvasNotices, ...deletionNotices];
            });
        };

        loadAdminNotices();
        const interval = setInterval(() => {
            if (!document.hidden) loadAdminNotices();
        }, 60 * 1000);
        const handleVisibilityChange = () => {
            if (!document.hidden) loadAdminNotices();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user?.role]);

    useEffect(() => {
        if (currentView !== 'admin') setAdminTabRequest(null);
    }, [currentView]);

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
                ambientLight,
                showClipboardEvents,
                canvasLinksEnabled,
                uiLook,
                dashboardLayoutMobile: JSON.parse(localStorage.getItem('dashboard_layout_mobile') || 'null'),
                dashboardLayoutDesktop: JSON.parse(localStorage.getItem('dashboard_layout_desktop') || 'null'),
                clockWidgetFormat: localStorage.getItem('clock_widget_format') || null,
                scratchpadContent: localStorage.getItem('scratchpad_content') || '',
                transitWidgetStop: localStorage.getItem('transit_widget_stop') || null
            };

            saveUserPreferences(user.studentId, preferences).catch(e => {
                console.log("Failed to save preferences to server:", e);
            });
        }, 1000);
    };

    useEffect(() => {
        let lastFetched = 0;

        const pollStatus = async () => {
            if (document.hidden && lastFetched !== 0) return;

            try {
                const systemData = await fetchSystemStatus();
                lastFetched = Date.now();
                if (systemData) {
                    setBroadcast(systemData.broadcast);
                    setMaintenance(systemData.maintenance);
                    setFestiveAmbient(!!systemData.festiveAmbient);
                    if (Array.isArray(systemData.hiddenPages)) {
                        setHiddenPages(systemData.hiddenPages);
                        localStorage.setItem('hidden_pages', JSON.stringify(systemData.hiddenPages));
                    }
                }
            } catch (e) {
                console.error("Failed to poll system status", e);
            }
        };

        pollStatus();

        const interval = setInterval(pollStatus, 5 * 60 * 1000);

        const handleVisibilityChange = () => {
            if (!document.hidden && Date.now() - lastFetched > 2 * 60 * 1000) {
                pollStatus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const isSignedIn = !!user;
    useEffect(() => {
        localStorage.setItem('theme', theme);
        savePreferences();
    }, [theme]);

    useEffect(() => {
        disableTransitions();
        applyUiLook(uiLook);
        localStorage.setItem('look', uiLook);
        savePreferences();
    }, [uiLook]);

    useEffect(() => {
        disableTransitions();
        document.documentElement.classList.toggle('dark', !isSignedIn || theme === 'dark');
    }, [theme, isSignedIn]);

    useEffect(() => {
        localStorage.setItem('ambient_light', ambientLight ? 'on' : 'off');
        savePreferences();
    }, [ambientLight]);

    useEffect(() => {
        localStorage.setItem('show_clipboard_events', showClipboardEvents ? 'true' : 'false');
        savePreferences();
    }, [showClipboardEvents]);

    useEffect(() => {
        localStorage.setItem('canvas_links_enabled', canvasLinksEnabled ? 'true' : 'false');
        savePreferences();
    }, [canvasLinksEnabled]);

    useEffect(() => {
        disableTransitions();
        const root = window.document.documentElement;
        root.classList.remove(
            'theme-zinc',
            'theme-mint',
            'theme-amber',
            'theme-blue',
            'theme-navy',
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

    useEffect(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        const styles = getComputedStyle(document.documentElement);
        const rgb = styles.getPropertyValue('--m-page').trim();
        if (rgb) meta.setAttribute('content', `rgb(${rgb.split(/\s+/).join(', ')})`);
    }, [colorTheme, theme, isSignedIn]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

    useEffect(() => {
        setTokenScopeOutdated(isScopeOutdated());

        const handleStorageChange = (e) => {
            if (e.key === 'sbhs_token_scope' || e.key === 'sbhs_access_token') {
                setTokenScopeOutdated(isScopeOutdated());
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const oauthError = params.get('error');
            const isAuthCallback = Boolean(code || oauthError);

            if (isAuthCallback) {
                window.history.replaceState({}, document.title, "/");
                if (!checkAuthState(params.get('state'))) {
                    setAuthError('That sign-in link didn’t come from this app. Please sign in again.');
                    setLoading(false);
                    return;
                }
                if (oauthError) {
                    const description = params.get('error_description');
                    setAuthError(`SBHS sign-in was declined${description ? `: ${description}` : ` (${oauthError})`}. Please try again.`);
                    setLoading(false);
                    return;
                }
                setAuthInProgress(true);
                try {
                    await exchangeToken(code);
                    setTokenScopeOutdated(false);
                    setReauthRequired(false);
                } catch (err) {
                    console.error(err);
                    if (isStagingAccessDenied(err)) {
                        clearStagingAuthSession();
                        setUser(null);
                    }
                    setAuthError(authErrorMessage(err));
                    setAuthInProgress(false);
                    setLoading(false);
                    return;
                }
            }

            fetchBuildNotes().then(notes => {
                if (Array.isArray(notes)) {
                    setBuildNotes(notes);
                    localStorage.setItem('cached_build_notes', JSON.stringify(notes));
                }
            }).catch(() => {});

            if (!isAuthenticated()) {
                localStorage.removeItem('cached_user');
                setUser(null);
                setAuthInProgress(false);
                setLoading(false);
                return;
            }

            try {
                await validateServerSession();
                fetchNextSchoolDay().catch(() => {});
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
                    setFestiveAmbient(!!systemData.festiveAmbient);

                    if (Array.isArray(systemData.hiddenPages)) {
                        setHiddenPages(systemData.hiddenPages);
                        localStorage.setItem('hidden_pages', JSON.stringify(systemData.hiddenPages));
                    }
                }

                if (userData && userData.studentId) {
                    registerUser({
                        id: userData.studentId,
                        name: `${userData.givenName} ${userData.surname}`,
                        email: userData.email,
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
                            const feedbackUpdates = dbSync.feedbackStatusUpdates || dbSync.resolvedFeedbacks || [];
                            if (feedbackUpdates.length) queueFeedbackStatusNotices(feedbackUpdates);
                        }
                    }).catch(e => console.log("Init sync failed silently", e));

                    fetchUserPreferences(userData.studentId).then(prefData => {
                        const prefs = (prefData && prefData.preferences) || {};

                        if (prefs.theme) {
                            setTheme(prefs.theme);
                            localStorage.setItem('theme', prefs.theme);
                        }
                        if (prefs.colorTheme) {
                            setColorTheme(prefs.colorTheme);
                            localStorage.setItem('color_theme', prefs.colorTheme);
                        }
                        if (prefs.ambientLight !== undefined) {
                            setAmbientLight(prefs.ambientLight);
                            localStorage.setItem('ambient_light', prefs.ambientLight ? 'on' : 'off');
                        }
                        if (prefs.showClipboardEvents !== undefined) {
                            setShowClipboardEvents(prefs.showClipboardEvents);
                            localStorage.setItem('show_clipboard_events', prefs.showClipboardEvents ? 'true' : 'false');
                        }
                        if (prefs.canvasLinksEnabled !== undefined) {
                            setCanvasLinksEnabled(prefs.canvasLinksEnabled);
                            localStorage.setItem('canvas_links_enabled', prefs.canvasLinksEnabled ? 'true' : 'false');
                        }
                        const look = normalizeUiLook(prefs.uiLook);
                        applyUiLook(look);
                        setUiLook(look);
                        localStorage.setItem('look', look);
                        if (prefs.dashboardLayoutMobile) {
                            localStorage.setItem('dashboard_layout_mobile', JSON.stringify(prefs.dashboardLayoutMobile));
                        }
                        if (prefs.dashboardLayoutDesktop) {
                            localStorage.setItem('dashboard_layout_desktop', JSON.stringify(prefs.dashboardLayoutDesktop));
                        }

                        if (prefs.clockWidgetFormat) {
                            localStorage.setItem('clock_widget_format', prefs.clockWidgetFormat);
                        }
                        if (prefs.scratchpadContent !== undefined) {
                            localStorage.setItem('scratchpad_content', prefs.scratchpadContent);
                        }
                        if (prefs.transitWidgetStop) {
                            localStorage.setItem('transit_widget_stop', prefs.transitWidgetStop);
                        }
                        syncPreferencesToServer.current = true;
                    }).catch(e => {
                        console.log("Failed to load user preferences", e);
                        syncPreferencesToServer.current = true;
                    });
                }

            } catch (error) {
                console.error(error);
                if (isStagingAccessDenied(error)) {
                    clearStagingAuthSession();
                    setUser(null);
                    setAuthError(authErrorMessage(error));
                } else if (isAuthCallback || !user) {
                    setAuthError(authErrorMessage(error));
                }
            } finally {
                setAuthInProgress(false);
                setLoading(false);
            }
        };
        init();
    }, [queueFeedbackStatusNotices]);

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

    useEffect(() => {
        if (!user || !isAuthenticated()) return;

        const provisionalDay = startDay || new Date();
        (async () => {
            try {
                const sessionsPromise = showClipboardEvents && user.studentId
                    ? loadClipboardSessions()
                    : Promise.resolve(initialClipboardSessions);
                const { date } = await fetchNextSchoolDay();
                const openDay = weekendClipboardDay(date, initialClipboardSessions);
                setDefaultDate(openDay);
                setViewDate(current => (
                    !userSelectedViewDate.current && isSameDay(current, provisionalDay)
                        ? openDay
                        : current
                ));
                setSchoolDayResolved(true);

                const sessions = await sessionsPromise;
                const updatedOpenDay = weekendClipboardDay(date, sessions);
                if (isSameDay(updatedOpenDay, openDay)) return;
                setDefaultDate(updatedOpenDay);
                setViewDate(current => (
                    !userSelectedViewDate.current && isSameDay(current, openDay)
                        ? updatedOpenDay
                        : current
                ));
            } catch (err) {
                console.warn('Could not work out the next school day', err);
                setSchoolDayResolved(true);
            }
        })();
    }, [user]);

    useEffect(() => {
        if (!user) return;

        const refreshWhenNeeded = () => {
            const expiry = Number(localStorage.getItem('sbhs_token_expiry'));
            if (!Number.isFinite(expiry) || expiry <= Date.now() + 15 * 60 * 1000) {
                refreshAccessToken({ forced: true }).catch(err => {
                    console.warn('Could not refresh the session in the background', err);
                });
            }
        };

        refreshWhenNeeded();
        const timer = setInterval(refreshWhenNeeded, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', refreshWhenNeeded);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshWhenNeeded);
        };
    }, [user]);

    useEffect(() => {
        if (!isAuthenticated()) return;

        const dateKey = format(viewDate, 'yyyy-MM-dd');
        viewedDayKey.current = dateKey;

        const cachedData = peekDayTimetable(viewDate);
        if (cachedData) {
            setTimetable(cachedData);
            setTimetableKey(dateKey);
        }

        fetchDayTimetable(viewDate)
            .then(data => {
                if (viewedDayKey.current !== dateKey) return;
                setTimetable(data);
                setTimetableKey(dateKey);
                if (isSameDay(viewDate, new Date())) {
                    localStorage.setItem('cached_timetable', JSON.stringify(data));
                }
            })
            .catch(err => console.error("Failed to fetch timetable", err));
    }, [viewDate, user]);

    useEffect(() => {
        if (!isAuthenticated()) return;
        const timer = setTimeout(() => {
            [1, -1, 2, -2, 3].forEach(offset => {
                fetchDayTimetable(addDays(viewDate, offset)).catch(() => {});
            });
        }, 200);
        return () => clearTimeout(timer);
    }, [viewDate, user]);

    useEffect(() => {
        if (!isAuthenticated()) return;

        fetchNextSchoolDay()
            .then(({ date, data }) => data || fetchDayTimetable(date))
            .then(setRailTimetable)
            .catch(err => console.error("Failed to fetch rail timetable", err));
    }, [user]);

    const viewMonthKey = format(viewDate, 'yyyy-MM');
    const [loadedMonthKey, setLoadedMonthKey] = useState(null);

    useEffect(() => {
        if (!isAuthenticated()) return;
        if (loadedMonthKey === viewMonthKey) return;

        const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
        const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);

        setLoadedMonthKey(viewMonthKey);
        fetchCalendarEvents(monthStart, monthEnd)
            .then(data => setCalendarEvents(data || []))
            .catch(err => console.error("Failed to fetch calendar events", err));
    }, [viewMonthKey, viewDate, user, loadedMonthKey]);

    useEffect(() => {
        if (!user) return;
        const warm = () => warmPages(user.role === 'Admin');
        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(warm, { timeout: 3000 });
            return () => window.cancelIdleCallback(id);
        }
        const id = setTimeout(warm, 1500);
        return () => clearTimeout(id);
    }, [user?.role, !!user]);

    const clipboardSessionsRequest = useRef({ id: null, promise: null });
    const loadClipboardSessions = () => {
        const id = user?.studentId;
        if (!id) return Promise.resolve(clipboardSessions);
        if (clipboardSessionsRequest.current.id !== id) {
            clipboardSessionsRequest.current = {
                id,
                promise: loadCachedClipboardSessions(id)
                    .then(sessions => {
                        setClipboardSessions(sessions || []);
                        return sessions || [];
                    })
                    .catch(err => {
                        console.error("Failed to load Clipboard sessions:", err);
                        clipboardSessionsRequest.current = { id: null, promise: null };
                        return clipboardSessions;
                    })
            };
        }
        return clipboardSessionsRequest.current.promise;
    };
    useEffect(() => {
        if (!user?.studentId || !showClipboardEvents) return;
        const cached = peekClipboardSessions(user.studentId);
        if (cached) setClipboardSessions(cached);
        loadClipboardSessions();
    }, [user?.studentId, showClipboardEvents]);

    useEffect(() => {
        if (!user?.studentId || !showClipboardEvents) return;
        const now = new Date();
        const dow = now.getDay();
        if ((dow !== 0 && dow !== 6) || !isSameDay(viewDate, now)) return;
        const todays = clipboardSessions.filter(s => !s.cancelled && s.start && isSameDay(new Date(s.start), now));
        if (todays.length === 0) return;

        const advance = () => {
            const at = new Date();
            const stillToday = clipboardSessions.filter(s => !s.cancelled && s.start && isSameDay(new Date(s.start), at));
            if (stillToday.length === 0 || !stillToday.every(s => new Date(s.end || s.start) < at)) return;
            const nextSessionDay = clipboardSessions
                .filter(s => !s.cancelled && s.start && new Date(s.start) > at)
                .map(s => format(new Date(s.start), 'yyyy-MM-dd'))[0];
            fetchNextSchoolDay()
                .then(({ date }) => {
                    const schoolKey = format(date, 'yyyy-MM-dd');
                    const targetKey = nextSessionDay && nextSessionDay < schoolKey ? nextSessionDay : schoolKey;
                    setViewDate(current => (isSameDay(current, at) ? new Date(`${targetKey}T00:00`) : current));
                })
                .catch(() => {});
        };

        const lastEnd = Math.max(...todays.map(s => new Date(s.end || s.start).getTime()));
        if (lastEnd <= now.getTime()) return;
        const timer = setTimeout(advance, lastEnd - now.getTime() + 1000);
        return () => clearTimeout(timer);
    }, [user?.studentId, showClipboardEvents, clipboardSessions, viewDate]);

    const viewKey = format(viewDate, 'yyyy-MM-dd');
    const dayTimetable = schoolDayResolved
        ? (peekDayTimetable(viewDate) || (timetableKey === viewKey ? timetable : null))
        : null;

    const nextDay = () => setViewDateFromUser(d => addDays(d, 1));
    const prevDay = () => setViewDateFromUser(d => addDays(d, -1));

    const layersOpen = paletteOpen || showDatePicker;
    useEffect(() => {
        const onKeyDown = (e) => {
            if (currentView !== 'home' || timetableViewMode !== 'daily' || layersOpen) return;
            const el = e.target;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            setViewDateFromUser(d => addDays(d, e.key === 'ArrowRight' ? 1 : -1));
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [currentView, timetableViewMode, layersOpen]);

    const daySwipe = useRef(null);
    const onDayTouchStart = (e) => {
        const t = e.touches[0];
        daySwipe.current = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const onDayTouchEnd = (e) => {
        const start = daySwipe.current;
        daySwipe.current = null;
        const t = e.changedTouches[0];
        if (!start || !t || currentView !== 'home' || timetableViewMode !== 'daily' || layersOpen) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        setViewDateFromUser(d => addDays(d, dx < 0 ? 1 : -1));
    };
    const resetToday = async () => {
        try {
            const { date } = await fetchNextSchoolDay();
            const sessions = showClipboardEvents && user?.studentId ? await loadClipboardSessions() : [];
            setViewDateFromUser(weekendClipboardDay(date, sessions));
        } catch {
            setViewDateFromUser(defaultDate || new Date());
        }
    };

    const prefetchStarted = useRef(false);
    useEffect(() => {
        if (!user?.studentId || !dayTimetable || prefetchStarted.current) return;
        prefetchStarted.current = true;
        const start = () => prefetchPages({ studentId: user.studentId, hiddenPages });
        setTimeout(() => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
            else start();
        }, 1500);
    }, [user?.studentId, !!dayTimetable]);

    const currentViewRef = useRef(currentView);
    currentViewRef.current = currentView;
    const prevViewRef = useRef(currentView);
    const subpageReturnRef = useRef(null);
    const subpageMarkerRef = useRef(false);

    useEffect(() => {
        const prev = prevViewRef.current;
        prevViewRef.current = currentView;

        if (SUBPAGE_VIEWS.includes(currentView)) {
            if (!SUBPAGE_VIEWS.includes(prev)) {
                subpageReturnRef.current = prev;
                subpageMarkerRef.current = true;
                window.history.pushState({ synchronSubpage: true }, '');
            }
            return;
        }

        if (subpageMarkerRef.current) {
            subpageMarkerRef.current = false;
            subpageReturnRef.current = null;
            window.history.back();
        }
    }, [currentView]);

    useEffect(() => {
        const onPopState = () => {
            if (!subpageMarkerRef.current || !SUBPAGE_VIEWS.includes(currentViewRef.current)) return;
            subpageMarkerRef.current = false;
            const target = subpageReturnRef.current || 'profile';
            subpageReturnRef.current = null;
            setCurrentView(target);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    if ((maintenance || user?.blacklisted) && currentView !== 'admin' && user?.role !== 'Admin') {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-red-900/20 p-6 rounded-full border border-red-500/20 mb-6 animate-pulse">
                    <AlertOctagon size={64} className="text-red-500" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">System Maintenance</h1>
                <p className="text-zinc-400 max-w-md">Synchron is currently undergoing scheduled maintenance. Please check back later.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center transition-colors">
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                    <div className="w-10 h-10 border-4 border-accent/25 border-t-accent rounded-full animate-spin"></div>
                    <p className="text-zinc-600 dark:text-zinc-300 text-sm">Loading Synchron...</p>
                    {authInProgress && (
                        <p className="max-w-sm text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                            If your browser asks for local network access, choose <span className="font-medium text-zinc-800 dark:text-zinc-200">Allow</span> so Synchron can finish signing you in.
                        </p>
                    )}
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
        <CanvasLinksProvider completeTimetable={completeTimetable} timetableData={timetable} linksEnabled={canvasLinksEnabled}>
        <NotificationsContext.Provider value={notificationsValue}>
            <div className="relative isolate flex h-[100dvh] overflow-hidden bg-m-page m-ambient text-zinc-900 dark:text-zinc-100">
            {ambientLight && <AmbientLight variant="page" festive={festiveAmbient} />}
            <ModernSidebar currentView={currentView} setView={setCurrentView} user={user} hiddenPages={hiddenPages} />

            <main className="relative isolate flex-1 min-w-0 flex flex-col overflow-hidden bg-m-panel md:my-2 md:mr-2 md:rounded-2xl md:border border-m-line md:shadow-[0_1px_3px_rgb(0_0_0/0.04)]">
                <ModernTopbar
                    currentView={currentView}
                    setView={setCurrentView}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    onOpenPalette={() => setPaletteOpen(true)}
                    onOpenPaletteFocus={() => {
                        setPaletteFocusOnOpen(true);
                        setPaletteOpen(true);
                    }}
                    isOffline={isOffline}
                    usingCachedData={usingCachedData}
                    reauthRequired={reauthRequired}
                    onLogin={() => performLogin()}
                    buildNotes={hiddenPages.includes('build-notes') ? [] : buildNotes}
                    adminNotices={adminNotices}
                    onOpenBuildNotes={() => setCurrentView('build-notes')}
                    onOpenCanvasLinks={hiddenPages.includes('canvas-links') ? null : () => setCurrentView('canvas-links')}
                    onOpenAdmin={(tab = 'notifications') => {
                        setAdminTabRequest({ tab });
                        setCurrentView('admin');
                    }}
                />
                {ambientLight && <AmbientLight variant="panel" festive={festiveAmbient} />}
                <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-14 h-72 m-dots" />

                <div className="relative flex-1 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto">
                {maintenance && user?.role === 'Admin' && (
                    <div className="mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 shrink-0 rounded-xl flex items-center gap-3 text-sm font-medium bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 border">
                        <AlertTriangle size={18} className="shrink-0" />
                        <span className="flex-1">Maintenance Mode Active - Admin Access Only</span>
                    </div>
                )}

                {broadcast && broadcast.type !== 'notification' && (
                    <div className={`mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 shrink-0 rounded-xl flex items-center gap-3 text-sm font-medium border
                ${broadcast.type === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' :
                            broadcast.type === 'warning' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400' :
                                'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'}`}>
                        <Info size={18} className="shrink-0" />
                        <span className="flex-1">{broadcast.message}</span>
                    </div>
                )}

                {tokenScopeOutdated && (
                    <div className="mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 shrink-0 rounded-xl flex flex-wrap items-center gap-3 text-sm font-medium bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                        <AlertCircle size={18} className="shrink-0" />
                        <span className="flex-1">Your SBHS sign-in needs to be updated to access new features. Sign in again to continue.</span>
                        <button
                            onClick={() => performLogin()}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            Sign in again
                        </button>
                    </div>
                )}

                {reauthRequired && (
                    <div className="mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 shrink-0 rounded-xl flex flex-wrap items-center gap-3 text-sm font-medium bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                        <AlertCircle size={18} className="shrink-0" />
                        <span className="flex-1">Your session has expired. Log in for latest data.</span>
                        <button
                            onClick={() => performLogin()}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            Sign in again
                        </button>
                    </div>
                )}

                <div
                    className="relative flex-1 p-4 md:p-8 pb-28 md:pb-12 max-w-7xl mx-auto w-full"
                    onTouchStart={onDayTouchStart}
                    onTouchEnd={onDayTouchEnd}
                >
                        <ErrorBoundary resetKey={`${currentView}-${viewKey}`}>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={currentView}
                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                exit={{ opacity: 0, transition: { duration: 0.07, ease: [0.4, 0, 1, 1] } }}
                                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                            >
                            <Suspense fallback={
                                <div className="flex flex-col items-center justify-center p-12 gap-4">
                                    <div className="w-8 h-8 border-4 border-accent/25 border-t-accent rounded-full animate-spin"></div>
                                    <p className="text-zinc-400 text-xs">Loading view...</p>
                                </div>
                            }>
                            {currentView === 'home' && (
                                <Home
                                    user={user}
                                    timetableData={dayTimetable}
                                    railTimetable={railTimetable}
                                    viewDate={viewDate}
                                    isCycle={timetableViewMode === 'cycle'}
                                    viewMode={timetableViewMode}
                                    onViewModeChange={setTimetableViewMode}
                                    clipboardSessions={showClipboardEvents ? clipboardSessions : []}
                                    currentWeek={currentWeekLetter}
                                    dayNav={timetableViewMode === 'daily' && (
                                        <>
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={prevDay} aria-label="Previous day" className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors">
                                                    <ChevronLeft size={15} sm:size={17} />
                                                </button>
                                                <button
                                                    onClick={() => setShowDatePicker(!showDatePicker)}
                                                    aria-label="Choose date"
                                                    className="flex items-center justify-center gap-1 sm:gap-2 px-2 h-8 sm:h-10 rounded-lg hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors w-[176px] sm:w-[226px]"
                                                >
                                                    <span className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white hidden sm:inline leading-none">{format(viewDate, 'EEEE')}</span>
                                                    <span className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white sm:hidden leading-none">{format(viewDate, 'EEE')}</span>
                                                    <span className="text-[12px] sm:text-[13px] text-zinc-500 whitespace-nowrap leading-none">{format(viewDate, 'd MMMM')}{weekLabel ? `, Wk ${weekLabel}` : ''}</span>
                                                </button>
                                                <button onClick={nextDay} aria-label="Next day" className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors">
                                                    <ChevronRight size={15} sm:size={17} />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {!(defaultDate && isSameDay(viewDate, defaultDate)) && (
                                                    <button
                                                        onClick={resetToday}
                                                        className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg text-[12px] sm:text-[13px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-900/[0.03] dark:bg-white/[0.05] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.07] dark:hover:bg-white/[0.09] transition-colors"
                                                    >
                                                        Today
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
                                                                const closure = closureLabel(date, pickerTerms, pickerCalendarEvents);

                                                                return (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => handleDateSelect(date)}
                                                                        title={closure || undefined}
                                                                        className={`relative aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                                                                            isSelected
                                                                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                                                                : isToday
                                                                                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                                                                                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                                        }`}
                                                                    >
                                                                        {format(date, 'd')}
                                                                        {closure && (
                                                                            <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />
                                                                        )}
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
                                    <Timetable
                                        timetableData={dayTimetable}
                                        completeTimetable={completeTimetable}
                                        railTimetable={railTimetable}
                                        viewMode={timetableViewMode}
                                        clipboardSessions={showClipboardEvents ? clipboardSessions : []}
                                        date={viewDate}
                                        calendarEvents={calendarEvents}
                                        currentWeek={currentWeekLetter}
                                    />
                                </Home>
                            )}

                            {currentView === 'calendar' && <CalendarView user={user} />}

                            {currentView === 'notices' && (
                                <DailyNotices notices={notices} user={user} />
                            )}

                            {currentView === 'awards' && <AwardSchemeView user={user} theme={theme} />}

                            {currentView === 'clipboard' && <ClipboardView user={user} />}


                            {currentView === 'feedback' && (
                                <FeedbackView user={user} onBack={() => setCurrentView('profile')} />
                            )}

                            {currentView === 'canvas-links' && (
                                <CanvasLinksView onBack={() => setCurrentView('profile')} timetableData={timetable} completeTimetable={completeTimetable} />
                            )}

                            {currentView === 'build-notes' && (
                                <BuildNotesView onBack={() => setCurrentView('profile')} />
                            )}

                            {currentView === 'privacy' && (
                                <PrivacyView onBack={() => setCurrentView('profile')} isAdmin={user?.role === 'Admin'} />
                            )}

                            {currentView === 'admin' && <AdminPanel user={user} setView={setCurrentView} hiddenPages={hiddenPages} setHiddenPages={setHiddenPages} initialTab={adminTabRequest} />}

                            {currentView === 'profile' && (
                                <SettingsView
                                    user={user}
                                    theme={theme}
                                    setTheme={setTheme}
                                    colorTheme={colorTheme}
                                    setColorTheme={setColorTheme}
                                    showClipboardEvents={showClipboardEvents}
                                    setShowClipboardEvents={setShowClipboardEvents}
                                    canvasLinksEnabled={canvasLinksEnabled}
                                    setCanvasLinksEnabled={setCanvasLinksEnabled}
                                    uiLook={uiLook}
                                    setUiLook={setUiLook}
                                    onSignOut={logout}
                                    setView={setCurrentView}
                                />
                            )}
                            </Suspense>
                            </motion.div>
                        </AnimatePresence>
                        </ErrorBoundary>
                </div>

                </div>
            </main>

            <ModernDock
                currentView={currentView}
                setView={setCurrentView}
                onOpenPalette={() => setPaletteOpen(true)}
                hiddenPages={hiddenPages}
            />
            <CommandPalette
                open={paletteOpen}
                onClose={() => setPaletteOpen(false)}
                focusOnOpen={paletteFocusOnOpen}
                onFocusHandled={() => setPaletteFocusOnOpen(false)}
                {...buildCommands({
                    user,
                    setView: setCurrentView,
                    theme,
                    toggleTheme,
                    onSignOut: logout,
                    hiddenPages
                })}
            />

            <CanvasLinkSuggestions disabled={hiddenPages.includes('canvas-links') || currentView === 'canvas-links'} />
        </div>
        </NotificationsContext.Provider>
        </CanvasLinksProvider>
        </MotionConfig>
    );
}

export default App;
