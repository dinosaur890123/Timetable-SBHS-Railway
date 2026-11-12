import React, { useEffect, useState, useRef, Suspense, useMemo, useCallback } from 'react';
import Home from './components/Home';
import ErrorBoundary from './components/ErrorBoundary';
import { ModernSidebar, ModernTopbar, ModernDock, CommandPalette, buildCommands, useModernShellEffects } from './components/modern/ModernShell';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import AmbientLight from './components/modern/AmbientLight';
import CanvasLinkSuggestions from './components/CanvasLinkSuggestions';

// Each page's code loads on its first visit, and is also fetched quietly once a signed-in app is idle
// (see warmPages below) so switching pages never stops on "Loading view".
const pageLoaders = {
    timetable: () => import('./components/Timetable'),
    calendar: () => import('./components/CalendarView'),
    notices: () => import('./components/DailyNotices'),
    awards: () => import('./components/AwardSchemeView'),
    clipboard: () => import('./components/ClipboardView'),
    study: () => import('./components/StudyView'),
    feedback: () => import('./components/FeedbackView'),
    canvasLinks: () => import('./components/CanvasLinksView'),
    buildNotes: () => import('./components/BuildNotesView'),
    settings: () => import('./components/SettingsView'),
    privacy: () => import('./components/PrivacyView'),
    admin: () => import('./components/AdminPanel')
};

// React.lazy caches a failed chunk forever, so a lazy page gets a few retries before
// it gives up and the error boundary shows its retry card.
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
const StudyView = lazyPage(pageLoaders.study);
const FeedbackView = lazyPage(pageLoaders.feedback);
const CanvasLinksView = lazyPage(pageLoaders.canvasLinks);
const BuildNotesView = lazyPage(pageLoaders.buildNotes);
const PrivacyView = lazyPage(pageLoaders.privacy);
const SettingsView = lazyPage(pageLoaders.settings);

// Tiny markdown for Sage's replies: **bold**, *italic*, `code`, lists, paragraphs.
// Everything is HTML-escaped first, so the model's text can't inject markup.
const sageInline = (s) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

const sageMarkdown = (md) => {
    if (!md.trim()) return '';
    return md.split(/\n{2,}/).map((block) => {
        const lines = block.split('\n').filter(l => l.trim());
        if (lines.length && lines.every(l => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l))) {
            const tag = /^\s*\d/.test(lines[0]) ? 'ol' : 'ul';
            return `<${tag}>${lines.map(l => `<li>${sageInline(l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${tag}>`;
        }
        return `<p>${lines.map(sageInline).join('<br>')}</p>`;
    }).join('');
};

const ARCHIVED_NOTICE_LIMIT = 100;

const warmPages = (isAdmin) => Object.entries(pageLoaders).forEach(([name, load]) => {
    if (name !== 'admin' || isAdmin) load().catch(() => {});
});

// The day the app opens on: the next school day, unless a Clipboard session falls on a
// weekend day before it (Saturday sport, Sunday rowing) — the earliest such day wins.
// Sessions already over don't count: a finished Saturday morning shouldn't reopen Saturday.
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

import {
    fetchDayTimetable,
    peekDayTimetable,
    fetchDailyNews,
    fetchUserInfo,
    isAuthenticated,
    exchangeToken,
    checkAuthState,
    logout,
    performLogin,
    fetchSystemStatus,
    fetchCompleteTimetable,
    fetchAiBriefing,
    fetchTimetableQa,
    fetchUserPreferences,
    saveUserPreferences,
    fetchBuildNotes,
    isScopeOutdated,
    fetchStudentClipboardSessions,
    fetchNextSchoolDay,
    peekNextSchoolDay,
    onCachedDataChange
} from './services/api';
import { prefetchPages, calendarPage, termsPage, closureLabel } from './services/pageData';
import { useCachedLoad } from './utils/pageCache';
import { registerUser, fetchDeletionRequests, fetchAdminCanvasLinks, fetchAdminFeedback } from './services/adminApi';
import { format, addDays, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Info, AlertTriangle, XCircle, AlertOctagon, Sparkles, X, AlertCircle } from 'lucide-react';
import { CanvasLinksProvider } from './context/CanvasLinksContext';
import { NotificationsContext } from './context/NotificationsContext';
import { Hl, useNoteFlowFonts } from './components/study/noteflow';
import './components/sage.css';

function App() {
    // State
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [currentView, setCurrentView] = useState('home');
    // Open on the school day worked out from the timetable saved on this device (today until its
    // last bell, then the next school day), so the right day shows before the network answers.
    const [startDay] = useState(() => peekNextSchoolDay());
    const [viewDate, setViewDate] = useState(() => startDay || new Date());
    const [defaultDate, setDefaultDate] = useState(startDay);
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
    const [railTimetable, setRailTimetable] = useState(() => (startDay ? peekDayTimetable(startDay) : null));
    // Which day `timetable` holds (the cached copy at start-up is today's), and the day on screen,
    // so a reply for a day already left behind is dropped instead of shown.
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
    const [colorTheme, setColorTheme] = useState(() => localStorage.getItem('color_theme') || 'zinc');
    const [aiDisabled, setAiDisabled] = useState(() => localStorage.getItem('ai_opt_in') !== 'true');
    const [aiGloballyDisabled, setAiGloballyDisabled] = useState(false);
    const [aiBannerDismissed, setAiBannerDismissed] = useState(false);
    const [aiProviderName, setAiProviderName] = useState('an AI provider');
    const [ambientLight, setAmbientLight] = useState(() => localStorage.getItem('ambient_light') !== 'off');
    const [showClipboardEvents, setShowClipboardEvents] = useState(() => localStorage.getItem('show_clipboard_events') !== 'false');
    const [buildNotes, setBuildNotes] = useState(() => {
        try {
            const cached = localStorage.getItem('cached_build_notes');
            const parsed = cached ? JSON.parse(cached) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
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
    const [tokenScopeOutdated, setTokenScopeOutdated] = useState(false);
    const [clipboardSessions, setClipboardSessions] = useState([]);

    // Offline State
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [usingCachedData, setUsingCachedData] = useState(false);

    // Offline detection
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

    // "Cached" in the topbar: the service worker answered from the offline copy.
    useEffect(() => onCachedDataChange(setUsingCachedData), []);

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
    // Week and week-type ("5A") for the day on screen, from the same calendar data the
    // Calendar page shows (its day groups carry info.week / info.weekType).
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

    const hasSyncedTimetable = useRef(false);
    const hasAutoAdvanced = useRef(false);

    // Listen for localStorage changes to hidden_pages
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

    // Timetable AI Modal States
    const [showAiModal, setShowAiModal] = useState(false);
    // Sage's serif face loads only when the modal or the palette can show its name.
    useNoteFlowFonts(showAiModal || paletteOpen || !aiDisabled);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiShown, setAiShown] = useState('');
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

    // School closures: a blue dot marks holidays, staff development days and days
    // outside every term, with the name as a tooltip.
    const { data: pickerTerms } = useCachedLoad(user ? termsPage().key : null, termsPage().load);

    const handleDateSelect = (date) => {
        setViewDate(date);
        setShowDatePicker(false);
    };

    const navigateMonth = (direction) => {
        setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + direction, 1));
    };

    // Archived app notices for the top-bar bell's one-stop shop.
    const [archivedNotices, setArchivedNotices] = useState([]);
    // Admin-panel alerts mirrored into the top-bar notification popout.
    const [adminNotices, setAdminNotices] = useState([]);
    const [adminTabRequest, setAdminTabRequest] = useState(null);

    const archiveNotice = useCallback((notice) => {
        setArchivedNotices(prev => [notice, ...prev.slice(0, ARCHIVED_NOTICE_LIMIT - 1)]);
    }, []);

    const removeNotice = useCallback((id) => {
        setArchivedNotices(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearNotices = useCallback(() => setArchivedNotices([]), []);

    const notificationsValue = useMemo(() => ({
        items: archivedNotices,
        archive: archiveNotice,
        remove: removeNotice,
        clear: clearNotices
    }), [archivedNotices, archiveNotice, removeNotice, clearNotices]);

    // Keep the same actionable items admins can review in the admin panel
    // available in the top-bar popout, even while they are elsewhere.
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
                        .filter(link => link.reports > 0)
                        .sort((a, b) => b.reports - a.reports)
                        .map(link => ({
                            id: `admin-canvas-report-${link.id}-${link.reports}`,
                            source: 'admin-canvas',
                            type: 'admin_canvas_report',
                            title: `Reported Canvas link · ${link.reports} report${link.reports === 1 ? '' : 's'}`,
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

    // A tab request only applies to the visit it was made for.
    useEffect(() => {
        if (currentView !== 'admin') setAdminTabRequest(null);
    }, [currentView]);

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
                aiOptIn: !aiDisabled,
                ambientLight,
                showClipboardEvents,
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


    const handleAskAiQuestion = async (e) => {
        e.preventDefault();
        if (aiBlocked) {
            setAiAnswer('Sage is under maintenance. Please check back later.');
            return;
        }
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
            setAiAnswer("Couldn't reach Sage. Please check your network and try again.");
        } finally {
            setAiQaLoading(false);
        }
    };

    // Once the answer lands, type it out like a chat reply. Reduced motion gets it whole.
    useEffect(() => {
        if (!aiAnswer) { setAiShown(''); return; }
        if (reduceMotion) { setAiShown(aiAnswer); return; }
        let i = 0;
        const id = setInterval(() => {
            i += 2;
            setAiShown(aiAnswer.slice(0, i));
            if (i >= aiAnswer.length) clearInterval(id);
        }, 24);
        return () => clearInterval(id);
    }, [aiAnswer, reduceMotion]);

    // Poll System Status (low frequency to minimize performance cost)
    useEffect(() => {
        let lastFetched = 0;

        const pollStatus = async () => {
            // Avoid polling if tab is backgrounded
            if (document.hidden && lastFetched !== 0) return;

            try {
                const systemData = await fetchSystemStatus();
                lastFetched = Date.now();
                if (systemData) {
                    setBroadcast(systemData.broadcast);
                    setMaintenance(systemData.maintenance);
                    setAiGloballyDisabled(!!systemData.aiDisabled);
                    if (systemData.aiProvider) {
                        setAiProviderName(systemData.aiProvider === 'gemini' ? 'Google Gemini' : systemData.aiProvider === 'hackclub' ? 'Hack Club AI' : systemData.aiProvider);
                    }
                    if (Array.isArray(systemData.hiddenPages)) {
                        setHiddenPages(systemData.hiddenPages);
                        localStorage.setItem('hidden_pages', JSON.stringify(systemData.hiddenPages));
                    }
                }
            } catch (e) {
                console.error("Failed to poll system status", e);
            }
        };

        // Poll once on mount for all visitors
        pollStatus();

        // Poll infrequently (every 5 minutes) when tab is active
        const interval = setInterval(pollStatus, 5 * 60 * 1000);

        // When user returns to tab after a while, refresh if older than 2 minutes
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
    // Admins can disable AI app-wide; it then shows maintenance to everyone in
    // the normal UI. Admins still reach Sage through the admin panel's tester.
    const aiBlocked = aiGloballyDisabled;

    // Drop any briefing already loaded so notices revert to their raw order
    // the moment AI is switched off.
    useEffect(() => {
        if (aiBlocked) setAiBriefing(null);
    }, [aiBlocked]);

    // Sage is a timetable companion — on mobile, dismiss it when navigating
    // to any page other than the timetable.
    useEffect(() => {
        if (showAiModal && currentView !== 'home' && window.matchMedia('(max-width: 767px)').matches) {
            setShowAiModal(false);
        }
    }, [currentView, showAiModal]);

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
        if (aiDisabled) {
            localStorage.removeItem('ai_opt_in');
        } else {
            localStorage.setItem('ai_opt_in', 'true');
        }
        savePreferences();
    }, [aiDisabled]);

    useEffect(() => {
        localStorage.setItem('ambient_light', ambientLight ? 'on' : 'off');
        savePreferences();
    }, [ambientLight]);

    useEffect(() => {
        localStorage.setItem('show_clipboard_events', showClipboardEvents ? 'true' : 'false');
        savePreferences();
    }, [showClipboardEvents]);

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

    // Check if token scope is outdated (needs relogin to get new scopes)
    useEffect(() => {
        setTokenScopeOutdated(isScopeOutdated());

        // Listen for storage changes (e.g., when another tab updates the token)
        const handleStorageChange = (e) => {
            if (e.key === 'sbhs_token_scope' || e.key === 'sbhs_access_token') {
                setTokenScopeOutdated(isScopeOutdated());
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Auth & Initial Data
    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (code) {
                window.history.replaceState({}, document.title, "/");
                if (!checkAuthState(params.get('state'))) {
                    setAuthError('That sign-in link didn’t come from this app. Please sign in again.');
                    setLoading(false);
                    return;
                }
                try {
                    await exchangeToken(code);
                    setTokenScopeOutdated(false);
                } catch (err) {
                    console.error(err);
                    setAuthError(err.message || "Failed to authenticate.");
                    setLoading(false);
                    return;
                }
            }

            // Sync build notes on reload of the page (single fetch on load, no constant polling)
            fetchBuildNotes().then(notes => {
                if (Array.isArray(notes)) {
                    setBuildNotes(notes);
                    localStorage.setItem('cached_build_notes', JSON.stringify(notes));
                }
            }).catch(() => {});

            if (!isAuthenticated()) {
                // Drop the cached user so the sign-in screen shows instead of a session with no tokens.
                localStorage.removeItem('cached_user');
                setUser(null);
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

                    if (Array.isArray(systemData.hiddenPages)) {
                        setHiddenPages(systemData.hiddenPages);
                        localStorage.setItem('hidden_pages', JSON.stringify(systemData.hiddenPages));
                    }
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
                                    archiveNotice({
                                        id: `feedback-resolved-${fb.id}`,
                                        title: "Feedback Resolved",
                                        message: `Your feedback ticket (${fb.ticketNumber}) has been marked as resolved by an admin. Thank you!`,
                                        type: 'resolved',
                                        at: Date.now()
                                    });
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
                            if (prefs.aiOptIn !== undefined) {
                                setAiDisabled(!prefs.aiOptIn);
                                if (prefs.aiOptIn) {
                                    localStorage.setItem('ai_opt_in', 'true');
                                } else {
                                    localStorage.removeItem('ai_opt_in');
                                }
                            }
                            if (prefs.ambientLight !== undefined) {
                                setAmbientLight(prefs.ambientLight);
                                localStorage.setItem('ambient_light', prefs.ambientLight ? 'on' : 'off');
                            }
                            if (prefs.showClipboardEvents !== undefined) {
                                setShowClipboardEvents(prefs.showClipboardEvents);
                                localStorage.setItem('show_clipboard_events', prefs.showClipboardEvents ? 'true' : 'false');
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
    }, [archiveNotice]);

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

        // Today until its last bell, then the next school day — or the next weekend day
        // with a Clipboard session when there is one before it. If that can't be worked
        // out (offline with nothing saved), the app stays on today.
        (async () => {
            try {
                const { date } = await fetchNextSchoolDay();
                const sessions = showClipboardEvents && user.studentId ? await loadClipboardSessions() : [];
                const openDay = weekendClipboardDay(date, sessions);
                setDefaultDate(openDay);
                setViewDate(openDay);
            } catch (err) {
                console.warn('Could not work out the next school day', err);
            }
        })();
    }, [user]);

    // Show the chosen day at once: from the session's cache when it's there (refreshed quietly once it's
    // five minutes old), otherwise an empty skeleton rather than the previous day's classes under the new date.
    useEffect(() => {
        if (!isAuthenticated()) return;

        const dateKey = format(viewDate, 'yyyy-MM-dd');
        viewedDayKey.current = dateKey;

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

    // Warm the week around the day on screen, so the arrows rarely have to wait. Days already
    // fetched (or on their way) aren't asked for again.
    useEffect(() => {
        if (!isAuthenticated()) return;
        const timer = setTimeout(() => {
            [1, -1, 2, -2, 3, 4, 5, 6, 7].forEach(offset => {
                fetchDayTimetable(addDays(viewDate, offset)).catch(() => {});
            });
        }, 120);
        return () => clearTimeout(timer);
    }, [viewDate, user]);

    // Fetch rail timetable for RHS - always shows current school day (if before end) or next school day
    useEffect(() => {
        if (!isAuthenticated()) return;

        // Today until its last bell, then the next school day: the same answer the timetable
        // opens on, from the same request.
        fetchNextSchoolDay()
            .then(({ date, data }) => data || fetchDayTimetable(date))
            .then(setRailTimetable)
            .catch(err => console.error("Failed to fetch rail timetable", err));
    }, [user]);

    // Fetch AI Briefing in background once notices are loaded
    useEffect(() => {
        if (aiDisabled || aiBlocked || !user || !notices || !notices.notices || notices.notices.length === 0) return;

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
    }, [notices, user, aiDisabled, aiBlocked]);

    // Once signed in and idle, fetch every page's code so the first visit to each is instant.
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

    // Clipboard sessions for the timetable's one-line markers, fetched quietly in the background.
    // One request shared by the markers, the weekend open-day exception and "Today".
    const clipboardSessionsRequest = useRef({ id: null, promise: null });
    const loadClipboardSessions = () => {
        const id = user?.studentId;
        if (!id) return Promise.resolve(clipboardSessions);
        if (clipboardSessionsRequest.current.id !== id) {
            clipboardSessionsRequest.current = {
                id,
                promise: fetchStudentClipboardSessions(id)
                    .then(sessions => {
                        setClipboardSessions(sessions || []);
                        return sessions || [];
                    })
                    .catch(err => {
                        console.error("Failed to load Clipboard sessions:", err);
                        return clipboardSessions;
                    })
            };
        }
        return clipboardSessionsRequest.current.promise;
    };
    useEffect(() => {
        if (!user?.studentId || !showClipboardEvents) return;
        loadClipboardSessions();
    }, [user?.studentId, showClipboardEvents]);

    // Weekend Clipboard exception, part two: once the sessions on the weekend day it
    // opened on have all ended, move on to the next day that has something on — a
    // Clipboard session if one comes before the next school day, else that school day.
    // No polling: a single timeout is set for the moment the last session ends.
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
            // Sessions are sorted by start, so the first future one names the next
            // Clipboard day.
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

        // Only a session still running earns the auto-advance. A day whose sessions
        // are already over is somewhere the student can visit freely — going back to
        // it must not throw them forward again.
        const lastEnd = Math.max(...todays.map(s => new Date(s.end || s.start).getTime()));
        if (lastEnd <= now.getTime()) return;
        const timer = setTimeout(advance, lastEnd - now.getTime() + 1000);
        return () => clearTimeout(timer);
    }, [user?.studentId, showClipboardEvents, clipboardSessions, viewDate]);

    // Date Navigation Helpers
    // The day on screen, read from the cache during render so the date and its classes always change
    // together. Null while a day nobody has fetched yet is on its way.
    const viewKey = format(viewDate, 'yyyy-MM-dd');
    const dayTimetable = peekDayTimetable(viewDate) || (timetableKey === viewKey ? timetable : null);

    const nextDay = () => setViewDate(d => addDays(d, 1));
    const prevDay = () => setViewDate(d => addDays(d, -1));

    // Arrow keys step through days on the home timetable, and a mostly-horizontal
    // swipe does the same anywhere on the page (the handlers sit on the content
    // container, so they still work over a no-classes day's empty space). Both
    // stand down while typing or when a layer (palette, date picker, AI modal) is open.
    const layersOpen = paletteOpen || showDatePicker || showAiModal;
    useEffect(() => {
        const onKeyDown = (e) => {
            if (currentView !== 'home' || timetableViewMode !== 'daily' || layersOpen) return;
            const el = e.target;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            setViewDate(d => addDays(d, e.key === 'ArrowRight' ? 1 : -1));
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
        setViewDate(d => addDays(d, dx < 0 ? 1 : -1));
    };
    const resetToday = async () => {
        try {
            const { date } = await fetchNextSchoolDay();
            const sessions = showClipboardEvents && user?.studentId ? await loadClipboardSessions() : [];
            setViewDate(weekendClipboardDay(date, sessions));
        } catch {
            setViewDate(defaultDate || new Date());
        }
    };

    // Once the timetable is on screen and the browser is idle, load the other pages' data in the
    // background (one page at a time), so switching to them is instant. Once per app start.
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

    // Reset date when leaving the home timetable
    useEffect(() => {
        if (lastViewRef.current === 'home' && currentView !== 'home' && defaultDate) {
            setViewDate(defaultDate);
        }
        lastViewRef.current = currentView;
    }, [currentView, defaultDate]);

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
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-accent/25 border-t-accent rounded-full animate-spin"></div>
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
        <CanvasLinksProvider completeTimetable={completeTimetable} timetableData={timetable}>
        <NotificationsContext.Provider value={notificationsValue}>
            <div className="relative isolate flex h-[100dvh] overflow-hidden bg-m-page m-ambient text-zinc-900 dark:text-zinc-100">
            {ambientLight && <AmbientLight variant="page" />}
            <ModernSidebar currentView={currentView} setView={setCurrentView} user={user} hiddenPages={hiddenPages} />

            <main className="relative isolate flex-1 min-w-0 flex flex-col overflow-hidden bg-m-panel md:my-2 md:mr-2 md:rounded-2xl md:border border-m-line md:shadow-[0_1px_3px_rgb(0_0_0/0.04)]">
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
                    aiDisabled={aiDisabled}
                    aiGloballyDisabled={aiGloballyDisabled}
                    aiBannerDismissed={aiBannerDismissed}
                    onEnableAi={() => setAiDisabled(false)}
                    onDismissAi={() => setAiBannerDismissed(true)}
                    buildNotes={hiddenPages.includes('build-notes') ? [] : buildNotes}
                    adminNotices={adminNotices}
                    onOpenBuildNotes={() => setCurrentView('build-notes')}
                    onOpenCanvasLinks={hiddenPages.includes('canvas-links') ? null : () => setCurrentView('canvas-links')}
                    onOpenAdmin={(tab = 'notifications') => {
                        setAdminTabRequest({ tab });
                        setCurrentView('admin');
                    }}
                />
                {ambientLight && <AmbientLight variant="panel" />}
                <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-14 h-72 m-dots" />

                <div className="relative flex-1 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto">
                {maintenance && user?.role === 'Admin' && (
                    <div className="mx-4 md:mx-8 mt-6 -mb-2 px-4 py-3 shrink-0 rounded-xl flex items-center gap-3 text-sm font-medium bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400 border">
                        <AlertTriangle size={18} className="shrink-0" />
                        <span className="flex-1">Maintenance Mode Active - Admin Access Only</span>
                    </div>
                )}

                {broadcast && (
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

                <div
                    className="relative flex-1 p-4 md:p-8 pb-28 md:pb-12 max-w-7xl mx-auto w-full"
                    onTouchStart={onDayTouchStart}
                    onTouchEnd={onDayTouchEnd}
                >
                        <ErrorBoundary resetKey={currentView}>
                        {/* Views cross-fade with a slight lift, so moving between pages feels continuous. Opacity and
                            transform only (no blur): those stay on the GPU, so big pages don't stutter as they swap.
                            Suspense sits inside the keyed div: a lazy page suspends on its own, so AnimatePresence
                            never loses track of the exiting view mid-swap. */}
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
                            {/* HOME VIEW: greeting, the day's timetable and a side rail */}
                            {currentView === 'home' && (
                                <Home
                                    user={user}
                                    timetableData={dayTimetable}
                                    railTimetable={railTimetable}
                                    viewDate={viewDate}
                                    isCycle={timetableViewMode === 'cycle'}
                                    clipboardSessions={showClipboardEvents ? clipboardSessions : []}
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
                                                    className="flex items-center justify-center gap-1 sm:gap-2 px-2 h-8 sm:h-10 rounded-lg hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors w-[160px] sm:w-[210px]"
                                                >
                                                    <span className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white hidden sm:inline leading-none">{format(viewDate, 'EEEE')}</span>
                                                    <span className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white sm:hidden leading-none">{format(viewDate, 'EEE')}</span>
                                                    <span className="text-[12px] sm:text-[13px] text-zinc-500 whitespace-nowrap leading-none">{format(viewDate, 'd MMMM')}{weekLabel ? ` · ${weekLabel}` : ''}</span>
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
                                                {!aiDisabled && (
                                                    <button
                                                        onClick={() => setShowAiModal(true)}
                                                        aria-label="Ask Sage about your timetable"
                                                        className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg border border-zinc-900/10 dark:border-white/10 text-[12px] sm:text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
                                                    >
                                                        <Sparkles size={13} sm:size={14} className="sage-accent" />
                                                        <span className="hidden sm:inline">Ask <span className="sage-name">Sage</span></span>
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
                                                                const closure = closureLabel(date, pickerTerms);
                                                            
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
                                        viewMode={timetableViewMode}
                                        clipboardSessions={showClipboardEvents ? clipboardSessions : []}
                                        date={viewDate}
                                    />
                                </Home>
                            )}

                            {/* CALENDAR VIEW */}
                            {currentView === 'calendar' && <CalendarView user={user} />}

                            {/* NOTICES VIEW */}
                            {currentView === 'notices' && (
                                <DailyNotices notices={notices} aiBriefing={aiBlocked ? null : aiBriefing} user={user} />
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

                            {/* BUILD NOTES VIEW */}
                            {currentView === 'build-notes' && (
                                <BuildNotesView onBack={() => setCurrentView('profile')} />
                            )}

                            {/* PRIVACY VIEW */}
                            {currentView === 'privacy' && (
                                <PrivacyView onBack={() => setCurrentView('profile')} aiProviderName={aiProviderName} />
                            )}

                            {/* ADMIN VIEW */}
                            {currentView === 'admin' && <AdminPanel user={user} setView={setCurrentView} hiddenPages={hiddenPages} setHiddenPages={setHiddenPages} timetable={timetable} completeTimetable={completeTimetable} initialTab={adminTabRequest} />}

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
                                    aiProviderName={aiProviderName}
                                    ambientLight={ambientLight}
                                    setAmbientLight={setAmbientLight}
                                    showClipboardEvents={showClipboardEvents}
                                    setShowClipboardEvents={setShowClipboardEvents}
                                    onSignOut={logout}
                                    setView={setCurrentView}
                                />
                            )}
                            </Suspense>
                            </motion.div>
                        </AnimatePresence>
                        </ErrorBoundary>
                </div>

                {/* Sage popout — NoteFlow's ink-on-paper, like the Clipboard sheets */}
                {showAiModal && (
                    <div className="nf nf-pop-scrim animate-in fade-in duration-200">
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Ask Sage"
                            className="nf nf-sheet nf-pop sage-pop animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                className="nf-cb-btn nf-cb-btn--bare nf-pop__close"
                                onClick={() => {
                                    setShowAiModal(false);
                                    setAiQuestion('');
                                    setAiAnswer('');
                                }}
                                aria-label="Close"
                            >
                                <X size={16} strokeWidth={1.75} />
                            </button>
                            <h3 className="nf-pop__title">
                                <Hl still={reduceMotion} delay={0.15}><span className="sage-name">Sage</span></Hl>
                            </h3>

                            <div className="sage-body">
                                {aiBlocked ? (
                                    <div className="sage-answer animate-in fade-in duration-200">
                                        <p className="nf-meta sage-hint">Sage is under maintenance. Please check back later.</p>
                                    </div>
                                ) : (
                                <>
                                <p className="nf-meta sage-hint">Ask about classes, rooms, teachers, or times.</p>
                                <p className="nf-meta sage-hint">Sage sends your question and relevant information to {aiProviderName} to answer. Answers aren't stored on our servers.</p>
                                <form onSubmit={handleAskAiQuestion} className="flex gap-2">
                                    <input
                                        type="text"
                                        value={aiQuestion}
                                        onChange={(e) => setAiQuestion(e.target.value)}
                                        disabled={aiQaLoading}
                                        placeholder={aiQaLoading ? "Sage is typing…" : "e.g. What room is my next class?"}
                                        className="sage-input"
                                    />
                                    <button
                                        type="submit"
                                        disabled={aiQaLoading || !aiQuestion.trim()}
                                        className="nf-btn nf-btn--ink shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {aiQaLoading ? "Asking…" : "Ask"}
                                    </button>
                                </form>
                                {(aiQaLoading || aiAnswer) && (
                                    <div className="sage-answer animate-in fade-in duration-200">
                                        {aiAnswer ? (
                                            <div
                                                className="sage-answer__md"
                                                dangerouslySetInnerHTML={{
                                                    __html: sageMarkdown(aiShown) + (aiShown.length < aiAnswer.length ? '<span class="sage-caret" aria-hidden="true"></span>' : '')
                                                }}
                                            />
                                        ) : (
                                            <span className="sage-typing" role="status"><i aria-hidden="true" />Sage is typing</span>
                                        )}
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
                {...buildCommands({
                    user,
                    setView: setCurrentView,
                    theme,
                    toggleTheme,
                    onAskAi: aiDisabled ? null : () => { setCurrentView('home'); setShowAiModal(true); },
                    onSignOut: logout,
                    hiddenPages
                })}
            />

            {/* Canvas Link Suggestions Toast */}
            <CanvasLinkSuggestions disabled={hiddenPages.includes('canvas-links') || currentView === 'canvas-links'} />
        </div>
        </NotificationsContext.Provider>
        </CanvasLinksProvider>
        </MotionConfig>
    );
}

export default App;