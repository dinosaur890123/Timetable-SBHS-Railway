import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { format, addDays, parseISO, getDay } from 'date-fns';
import { applyPeriodVariations, describeClass, isBreakBell, isBreakStylePeriod, resolveRoutineBells, subjectInk, formatTime12Hour } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { fetchDayTimetable, fetchStudentAttendanceScanIn, peekDayTimetable } from '../services/api';

const getMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const getGreeting = (hour) => {
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    if (hour < 22) return 'Good evening';
    return 'Good night';
};

const formatDuration = (mins) => {
    const total = Math.max(0, Math.ceil(mins));
    const hrs = Math.floor(total / 60);
    return hrs > 0 ? `${hrs}h ${total % 60}m` : `${total}m`;
};

const getScanTime = (record) => {
    const value = record && typeof record === 'object'
        ? record.timestamp || record.scanInDateTime || record.scannedAt || record.scanInAt || record.dateTime || record.time
        : null;
    if (!value) return null;
    const raw = String(value);
    const date = /^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)
        ? new Date(`1970-01-01T${raw}`)
        : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : format(date, 'h:mm a');
};

const SCAN_STATUS_CACHE_KEY = 'attendance_scan_status';
const readScanStatusCache = (studentId, date) => {
    try {
        const cached = JSON.parse(localStorage.getItem(SCAN_STATUS_CACHE_KEY) || 'null');
        return cached?.studentId === studentId && cached?.date === date
            && ['scanned', 'not-scanned'].includes(cached?.state) ? cached : null;
    } catch {
        return null;
    }
};

const saveScanStatusCache = (studentId, status) => {
    if (!['scanned', 'not-scanned'].includes(status.state)) return;
    try {
        localStorage.setItem(SCAN_STATUS_CACHE_KEY, JSON.stringify({ studentId, ...status }));
    } catch {}
};

const formatCountdown = (mins) => {
    const totalSeconds = Math.max(0, Math.round(mins * 60));
    const hrs = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

const buildSlots = (timetableData) => {
    if (!timetableData?.bells) return [];
    const inner = timetableData.timetable?.timetable || timetableData.timetable;
    if (!inner?.periods) return [];

    const routine = inner.routine ? inner.routine.split(',') : [];
    const routineBells = resolveRoutineBells(routine, timetableData.bells);
    const classVariations = timetableData.classVariations || {};
    const roomVariations = timetableData.roomVariations || {};

    return routine.map((bellId, index) => {
        const bell = routineBells[index];
        if (!bell) return null;

        let period = inner.periods[bellId] || { title: bell.bellDisplay };
        const originalTitle = period.title;
        const breakInfo = { ...period, bellDisplay: bell.bellDisplay };
        const isRealBreak = isBreakBell(bellId, breakInfo);
        const isBreak = isBreakStylePeriod(bellId, breakInfo);

        if (isRealBreak) {
            period = { ...period, title: period.title || bell.bellDisplay };
        } else {
            period = applyPeriodVariations(period, bellId, classVariations, roomVariations);
            const { name, colour } = describeClass(period, timetableData.timetable?.subjects);
            period = { ...period, fullTitle: name, colour };
        }

        if (bellId === 'RC' || (originalTitle && String(originalTitle).toLowerCase().includes('roll call'))) return null;
        if (isRealBreak && String(bellId) === '0') return null;

        const isSportOrScripture = !isRealBreak && isBreak;
        const startMin = getMinutes(bell.time);
        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;
        return { bellId, bell, period, isBreak, isRealBreak, isSportOrScripture, startMin, endMin };
    }).filter(Boolean).reduce((rows, slot) => {
        const prev = rows[rows.length - 1];
        const label = slot.period.title?.replace(/\s*\d+$/, '');
        if (prev?.isRealBreak && slot.isRealBreak && prev.period.title?.replace(/\s*\d+$/, '') === label) {
            prev.endMin = slot.endMin;
            return rows;
        }
        rows.push(slot);
        return rows;
    }, []);
};

const isClass = (slot) => !slot.isBreak && slot.period.title && slot.period.title !== 'Free Period';

const buildClipboardSlots = (sessions, dayKey) => {
    if (!sessions || !dayKey) return [];
    return sessions
        .filter(session => {
            if (!session.start || !session.end || session.cancelled) return false;
            const sessionDate = format(parseISO(session.start), 'yyyy-MM-dd');
            return sessionDate === dayKey;
        })
        .map(session => {
            const startDate = parseISO(session.start);
            const endDate = parseISO(session.end);
            const startMin = startDate.getHours() * 60 + startDate.getMinutes();
            const endMin = endDate.getHours() * 60 + endDate.getMinutes();
            return {
                bellId: 'EC',
                bell: { time: session.start.split('T')[1]?.substring(0, 5), endTime: session.end.split('T')[1]?.substring(0, 5) },
                period: {
                    title: session.title || session.activity,
                    fullTitle: session.title || session.activity,
                    room: session.location?.name || null,
                    isExtracurricular: true
                },
                isBreak: false,
                startMin,
                endMin,
                isExtracurricular: true
            };
        })
        .sort((a, b) => a.startMin - b.startMin);
};

const ViewModeToggle = ({ viewMode, onViewModeChange }) => {
    const tabsRef = useRef({});
    const [pill, setPill] = useState(null);

    useLayoutEffect(() => {
        const updatePill = () => {
            const el = tabsRef.current[viewMode];
            if (el) {
                setPill({
                    left: el.offsetLeft,
                    width: el.offsetWidth,
                    top: el.offsetTop,
                    height: el.offsetHeight,
                });
            }
        };
        updatePill();
        window.addEventListener('resize', updatePill);
        return () => window.removeEventListener('resize', updatePill);
    }, [viewMode]);

    return (
        <div className="relative flex items-center p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06] mt-4 md:mt-0 md:shrink-0 w-fit md:w-auto">
            {pill && (
                <span
                    aria-hidden="true"
                    className="absolute rounded-md bg-white dark:bg-zinc-800 shadow-sm transition-all duration-200 ease-out pointer-events-none"
                    style={{ left: pill.left, width: pill.width, top: pill.top, height: pill.height }}
                />
            )}
            {['daily', 'cycle'].map(mode => (
                <button
                    key={mode}
                    ref={el => { if (el) tabsRef.current[mode] = el; }}
                    onClick={() => onViewModeChange?.(mode)}
                    className={`relative z-10 px-2.5 py-1 text-xs font-medium capitalize rounded-md transition-colors ${viewMode === mode ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                >
                    {mode}
                </button>
            ))}
        </div>
    );
};

const RailLabel = ({ children, aside }) => (
    <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
        <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">{children}</span>
        {aside}
    </div>
);

const RailCard = ({ children, colour, phase }) => {
    return (
        <section
            {...(colour ? subjectInk(colour) : {})}
            className="now-card-surface relative rounded-xl border border-zinc-900/[0.07] dark:border-white/[0.08] p-3 sm:p-4"
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={phase}
                    className="relative"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </section>
    );
};

const SubjectDot = ({ colour }) => colour
    ? <span aria-hidden className="inline-block w-2 h-2 shrink-0 rounded-full subject-fill" {...subjectInk(colour)} />
    : null;

const ClassTitle = ({ period, className }) => {
    const { getLink, linksEnabled } = useCanvasLinks();
    const link = linksEnabled ? getLink(period.title, period.year) : null;
    const name = period.fullTitle || period.title;
    const shortName = period.title;
    return (
        <div className="flex items-center gap-2 min-w-0">
            <SubjectDot colour={period.colour} />
            {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className={`${className} block hover:underline decoration-zinc-400/50 underline-offset-4`}>
                    <span className="lg:hidden">{shortName}</span>
                    <span className="hidden lg:inline">{name}</span>
                </a>
            ) : (
                <div className={className}>
                    <span className="lg:hidden">{shortName}</span>
                    <span className="hidden lg:inline">{name}</span>
                </div>
            )}
        </div>
    );
};

const ThenLine = ({ slot, prefix = 'Then' }) => slot && (
    <div className="mt-2.5 sm:mt-4 pt-2.5 sm:pt-3 border-t border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <ArrowRight size={12} className="shrink-0" />
        <span className="shrink-0">{prefix}</span>
        {!slot.isEndOfDay && <SubjectDot colour={slot.period.colour} />}
        <span className="min-w-0 flex-1 whitespace-normal break-words font-medium text-zinc-800 dark:text-zinc-200">
            {slot.isEndOfDay ? 'End of day' : <>
                <span className="lg:hidden">{slot.period.title}</span>
                <span className="hidden lg:inline">{slot.period.fullTitle || slot.period.title}</span>
            </>}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{formatTime12Hour(slot.bell.time)}</span>
    </div>
);

const RollingText = ({ text }) => (
    <span className="inline-flex">
        {text.split('').map((ch, i, all) => {
            const slot = all.length - i;
            if (!/\d/.test(ch)) return <span key={slot}>{ch}</span>;
            return (
                <span key={slot} className="relative inline-block overflow-hidden">
                    <span className="invisible">{ch}</span>
                    <AnimatePresence initial={false}>
                        <motion.span
                            key={ch}
                            className="absolute inset-0"
                            initial={{ y: '-80%', opacity: 0 }}
                            animate={{ y: '0%', opacity: 1 }}
                            exit={{ y: '80%', opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 30, opacity: { duration: 0.2 } }}
                        >
                            {ch}
                        </motion.span>
                    </AnimatePresence>
                </span>
            );
        })}
    </span>
);

const Countdown = ({ mins, caption }) => (
    <div className="flex items-baseline gap-1.5 sm:gap-2">
        <span className="text-[24px] sm:text-[30px] leading-none font-medium tracking-tight tabular-nums text-zinc-900 dark:text-white">
            <span className="sr-only">{formatCountdown(mins)}</span>
            <span aria-hidden><RollingText text={formatCountdown(mins)} /></span>
        </span>
        {caption && <span className="text-xs sm:text-[13px] text-zinc-500">{caption}</span>}
    </div>
);

const Progress = ({ value, colour }) => (
    <div className="mt-2 sm:mt-4 h-0.5 sm:h-1 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden">
        <div
            {...(colour ? subjectInk(colour) : {})}
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${colour ? 'subject-fill' : 'bg-accent'}`}
            style={{ ...(colour ? subjectInk(colour).style : {}), width: `${Math.min(100, Math.max(0, value))}%` }}
        />
    </div>
);

const NowCard = ({ slots, nowMin, isLive, clipboardSessions, dayKey }) => {
    const clipboardSlots = buildClipboardSlots(clipboardSessions, dayKey);
    const allSlots = [...slots, ...clipboardSlots].sort((a, b) => a.startMin - b.startMin);

    if (allSlots.length === 0) return null;

    const dayStart = allSlots[0].startMin;
    const dayEnd = allSlots[allSlots.length - 1].endMin;

    if (!isLive || nowMin >= dayEnd) return null;

    const slotTitle = (p) => {
        const raw = p?.fullTitle || p?.title || '';
        return /^sp[\s-]?\d*$/i.test(raw.trim()) ? 'Sport' : raw.replace(/\s*\d+$/, '');
    };
    const countdownCaption = (slot) => {
        if (!slot) return null;
        if (slot.isEndOfDay) return 'until end of day';
        return isClass(slot) ? 'until transition' : `until ${slotTitle(slot.period)}`;
    };

    if (nowMin < dayStart) {
        const first = allSlots[0];
        return (
            <RailCard phase="before-school">
                <RailLabel>Before school</RailLabel>
                <Countdown
                    mins={first.startMin - nowMin}
                    caption={first.isBreak
                        ? `until ${slotTitle(first.period)}`
                        : first.isExtracurricular ? 'until first session' : 'until first class'}
                />
                <ThenLine slot={first} prefix="First" />
            </RailCard>
        );
    }

    const current = allSlots.find(s => nowMin >= s.startMin && nowMin < s.endMin);
    const lastSlot = allSlots[allSlots.length - 1];
    const endOfDayTime = lastSlot.bell.endTime || `${String(Math.floor(dayEnd / 60)).padStart(2, '0')}:${String(dayEnd % 60).padStart(2, '0')}`;
    const next = allSlots.find(s => s.startMin >= (current ? current.endMin : nowMin)) || {
        isEndOfDay: true,
        startMin: dayEnd,
        endMin: dayEnd,
        bell: { time: endOfDayTime },
        period: { title: 'End of day', fullTitle: 'End of day' }
    };
    const schoolLeft = <span className="text-[12px] text-zinc-400 tabular-nums">{formatDuration(dayEnd - nowMin)} left today</span>;

    if (!current || (!isClass(current) && !current.isExtracurricular)) {
        const end = current ? current.endMin : (next?.startMin ?? dayEnd);
        const start = current ? current.startMin : nowMin;
        return (
            <RailCard phase={current ? `break-${current.bellId}` : 'between'}>
                <RailLabel aside={schoolLeft}>{current ? slotTitle(current.period) : 'Between classes'}</RailLabel>
                <Countdown mins={end - nowMin} caption={countdownCaption(next)} />
                <Progress value={((nowMin - start) / Math.max(1, end - start)) * 100} />
                <ThenLine slot={next} prefix="Next" />
            </RailCard>
        );
    }

    const isExtracurricular = current.isExtracurricular;

    return (
        <RailCard phase={isExtracurricular ? `extracurricular-${current.bellId}` : `class-${current.bellId}`} colour={current.period.colour}>
            <ClassTitle period={current.period} className="min-w-0 whitespace-normal break-words text-base sm:text-lg font-semibold tracking-tight text-zinc-900 dark:text-white" />
            <div className="mt-2"><Countdown mins={current.endMin - nowMin} caption={countdownCaption(next)} /></div>
            <Progress value={((nowMin - current.startMin) / (current.endMin - current.startMin)) * 100} colour={current.period.colour} />
            <ThenLine slot={next} prefix="Next" />
        </RailCard>
    );
};

const Home = ({ user, timetableData, railTimetable, viewDate, isCycle, viewMode = 'daily', onViewModeChange, clipboardSessions = [], currentWeek, dayNav, children }) => {
    const [now, setNow] = useState(new Date());
    const [scanIn, setScanIn] = useState(() => {
        const date = format(new Date(), 'yyyy-MM-dd');
        return readScanStatusCache(user?.studentId, date) || { date: null, state: 'loading' };
    });
    const [nextDayScanIn, setNextDayScanIn] = useState({ date: null, state: 'loading' });
    const [todayTimetable, setTodayTimetable] = useState(() => peekDayTimetable(new Date()));

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const day = railTimetable || timetableData;
    const slots = buildSlots(day);
    const todayKey = format(now, 'yyyy-MM-dd');
    useEffect(() => {
        if (!user?.studentId) return;
        let active = true;
        setTodayTimetable(peekDayTimetable(now) || null);
        fetchDayTimetable(now)
            .then(data => { if (active) setTodayTimetable(data); })
            .catch(() => {});
        return () => { active = false; };
    }, [user?.studentId, todayKey]);

    const todayMatches = todayTimetable?.date === todayKey;
    const todaySlots = todayMatches ? buildSlots(todayTimetable) : [];
    const hasTodaySchedule = todaySlots.length > 0;
    const schoolStartMin = todaySlots[0]?.startMin ?? 9 * 60;
    const schoolEndMin = todaySlots.at(-1)?.endMin ?? 15 * 60 + 30;
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const afterSchool = hasTodaySchedule && nowMin >= schoolEndMin;
    const isSchoolDay = getDay(now) !== 0 && getDay(now) !== 6 && hasTodaySchedule;
    useEffect(() => {
        if (!user?.studentId || !isSchoolDay || !hasTodaySchedule) {
            setScanIn({ date: todayKey, state: 'unknown' });
            return;
        }
        const cachedStatus = readScanStatusCache(user.studentId, todayKey);
        if (cachedStatus?.state === 'scanned') {
            setScanIn(cachedStatus);
            return;
        }
        let active = true;
        let scanned = false;
        let timer;
        const scheduleInitialCheck = () => {
            clearTimeout(timer);
            const current = new Date();
            const currentMin = current.getHours() * 60 + current.getMinutes();
            if (currentMin < 6 * 60) {
                timer = setTimeout(poll, (6 * 60 - currentMin) * 60000);
            } else {
                poll();
            }
        };
        const poll = async () => {
            const current = new Date();
            const currentMin = current.getHours() * 60 + current.getMinutes();
            if (!active || scanned || document.visibilityState === 'hidden' || currentMin >= schoolEndMin) return;
            try {
                const record = await fetchStudentAttendanceScanIn(user.studentId, todayKey);
                if (!active) return;
                if (record) {
                    scanned = true;
                    const nextStatus = { date: todayKey, state: 'scanned', time: getScanTime(record) };
                    setScanIn(nextStatus);
                    saveScanStatusCache(user.studentId, nextStatus);
                    return;
                }
                const nextStatus = { date: todayKey, state: 'not-scanned' };
                setScanIn(nextStatus);
                saveScanStatusCache(user.studentId, nextStatus);
            } catch {
                if (!active) return;
                setScanIn({ date: todayKey, state: 'unknown' });
            }
            if (!active || scanned || document.visibilityState === 'hidden') return;
            const minutesUntilStart = schoolStartMin - currentMin;
            const delay = currentMin < 7 * 60
                ? 1800000
                : currentMin < 8 * 60 ? 300000
                    : minutesUntilStart > 30 ? 120000
                        : minutesUntilStart > 0 ? 60000 : 1800000;
            const untilEnd = Math.max(0, (schoolEndMin - currentMin) * 60000);
            if (untilEnd > 0) timer = setTimeout(poll, Math.min(delay, untilEnd));
        };
        if (!cachedStatus) setScanIn({ date: todayKey, state: 'loading' });
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') clearTimeout(timer);
            else scheduleInitialCheck();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        scheduleInitialCheck();
        return () => {
            active = false;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [user?.studentId, todayKey, isSchoolDay, hasTodaySchedule, schoolStartMin, schoolEndMin]);

    useEffect(() => {
        if (!user?.studentId || !afterSchool) return;
        const nextDate = addDays(now, 1);
        const nextDateKey = format(nextDate, 'yyyy-MM-dd');
        const cached = readScanStatusCache(user.studentId, nextDateKey);
        setNextDayScanIn(cached || { date: nextDateKey, state: 'loading' });
        let active = true;
        (async () => {
            try {
                const timetable = await fetchDayTimetable(nextDate);
                if (timetable?.date !== nextDateKey || buildSlots(timetable).length === 0) {
                    if (active) setNextDayScanIn({ date: nextDateKey, state: 'unknown' });
                    return;
                }
                if (active && !cached) setNextDayScanIn({ date: nextDateKey, state: 'not-scanned' });
                const record = await fetchStudentAttendanceScanIn(user.studentId, nextDateKey);
                if (!active) return;
                const status = record
                    ? { date: nextDateKey, state: 'scanned', time: getScanTime(record) }
                    : { date: nextDateKey, state: 'not-scanned' };
                setNextDayScanIn(status);
                saveScanStatusCache(user.studentId, status);
            } catch {
                if (active) setNextDayScanIn({ date: nextDateKey, state: 'unknown' });
            }
        })();
        return () => { active = false; };
    }, [user?.studentId, todayKey, afterSchool]);

    const inner = day?.timetable?.timetable || day?.timetable;
    const dayKey = day?.date || (viewDate ? format(viewDate, 'yyyy-MM-dd') : todayKey);
    const isLive = dayKey === todayKey;
    const classCount = slots.filter(isClass).length;

    const firstClass = slots.find(isClass);
    const clipboardSlots = buildClipboardSlots(clipboardSessions, dayKey);
    const hasExtracurriculars = clipboardSlots.length > 0;
    const dayStart = [slots[0]?.startMin, clipboardSlots[0]?.startMin].filter(n => n != null).reduce((a, b) => Math.min(a, b), Infinity);
    const dayEnd = slots.length ? slots[slots.length - 1].endMin : -Infinity;
    const extendedDayEnd = hasExtracurriculars ? Math.max(dayEnd, clipboardSlots[clipboardSlots.length - 1].endMin) : dayEnd;
    const railHours = isLive && (classCount > 0 || hasExtracurriculars) && nowMin >= dayStart - 120 && nowMin < extendedDayEnd;
    const showRail = !isCycle && railHours;

    const weekLetter = (name) => (name || '').trim().match(/([A-Z])$/)?.[1] || null;
    const resolvedCurrentWeek = currentWeek
        || weekLetter(railTimetable?.timetable?.timetable?.dayname || railTimetable?.timetable?.dayname)
        || weekLetter(inner?.dayname)
        || (() => {
            try {
                const cached = JSON.parse(localStorage.getItem('cached_timetable') || '{}');
                return weekLetter(cached?.timetable?.timetable?.dayname || cached?.timetable?.dayname);
            } catch {
                return null;
            }
        })();

    const rail = showRail && <NowCard slots={slots} nowMin={nowMin} isLive={isLive} clipboardSessions={clipboardSessions} dayKey={dayKey} />;
    const nextDayKey = format(addDays(now, 1), 'yyyy-MM-dd');
    const shownScanIn = afterSchool ? nextDayScanIn : scanIn;
    const shownScanDate = afterSchool ? nextDayKey : todayKey;
    const showScanPill = !afterSchool && isSchoolDay
        && shownScanIn.date === shownScanDate
        && ['scanned', 'not-scanned'].includes(shownScanIn.state);
    const scanUrgent = !afterSchool && shownScanIn.state === 'not-scanned'
        && nowMin >= schoolStartMin - 10;
    const scanPillTone = shownScanIn.state === 'scanned'
        ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
        : scanUrgent
            ? 'bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300'
            : 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300';
    const scanDotTone = shownScanIn.state === 'scanned'
        ? 'bg-emerald-500'
        : scanUrgent ? 'bg-red-500' : 'bg-amber-500';

    const headerWidth = railHours ? 'max-w-5xl' : 'max-w-3xl';
    const contentWidth = isCycle ? 'max-w-6xl' : headerWidth;

    return (
        <div>
            <div className={`mx-auto ${headerWidth}`}>
            <header className={showScanPill ? 'mb-1 md:mb-3' : 'mb-3 md:mb-8'}>
                <div className="md:flex md:items-center md:justify-between md:gap-4">
                    <div className="min-w-0">
                        <h1 className="look-greeting text-[28px] md:text-[34px] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-white">
                            {getGreeting(now.getHours())}, <span className="look-swipe text-accent">{user?.givenName || 'there'}</span>
                        </h1>
                        {showScanPill && (
                            <p className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${scanPillTone}`}>
                                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${scanDotTone}`} />
                                <span>{afterSchool
                                    ? `${format(addDays(now, 1), 'EEE d MMM')} · ${shownScanIn.state === 'scanned' ? `Scanned on at ${shownScanIn.time || 'time unavailable'}` : 'Not scanned yet'}`
                                    : shownScanIn.state === 'scanned' ? `Scanned on today at ${shownScanIn.time || 'time unavailable'}` : 'Not scanned yet today'}</span>
                            </p>
                        )}
                    </div>
                    <div className="hidden md:block">
                        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
                    </div>
                </div>
            </header>
            </div>

            <div className={`mx-auto ${contentWidth}`}>
            <div className={showRail ? 'grid md:gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_280px]' : ''}>
                {rail && <div className="lg:hidden">{rail}</div>}
                <div className="mb-3 md:hidden">
                    <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
                </div>
                <section className="min-w-0">
                    {dayNav}
                    {children}
                </section>
                {rail && (
                    <div className="hidden lg:block">
                        <div className="lg:sticky lg:top-20">{rail}</div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
};

export default Home;
