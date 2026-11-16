import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, MapPin, UserRound } from 'lucide-react';
import { format, addDays, parseISO, getDay } from 'date-fns';
import { applyPeriodVariations, describeClass, isBreakBell, isBreakStylePeriod, subjectInk, formatTime12Hour } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { TeacherTreat } from './TeacherTreat';
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

const formatCountdown = (mins) => {
    const totalSeconds = Math.max(0, Math.round(mins * 60));
    const hrs = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
};

// Flattens the day's routine into ordered slots with variations applied, skipping roll call.
const buildSlots = (timetableData) => {
    if (!timetableData?.bells) return [];
    const inner = timetableData.timetable?.timetable || timetableData.timetable;
    if (!inner?.periods) return [];

    const routine = inner.routine ? inner.routine.split(',') : [];
    const classVariations = timetableData.classVariations || {};
    const roomVariations = timetableData.roomVariations || {};

    return routine.map((bellId) => {
        const bell = timetableData.bells.find(b => b.bell === bellId);
        if (!bell) return null;

        let period = inner.periods[bellId] || { title: bell.bellDisplay };
        const originalTitle = period.title;
        const isRealBreak = isBreakBell(bellId, period);
        const isBreak = isBreakStylePeriod(bellId, period);

        if (isRealBreak) {
            period = { ...period, title: period.title || bell.bellDisplay };
        } else {
            period = applyPeriodVariations(period, bellId, classVariations, roomVariations);
            const { name, colour } = describeClass(period, timetableData.timetable?.subjects);
            period = { ...period, fullTitle: name, colour };
        }

        if (bellId === 'RC' || (originalTitle && String(originalTitle).toLowerCase().includes('roll call'))) return null;
        // An empty Period 0 is just a gap before school starts.
        if (isRealBreak && String(bellId) === '0') return null;

        const isSportOrScripture = !isRealBreak && isBreak;
        const startMin = getMinutes(bell.time);
        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;
        return { bellId, bell, period, isBreak, isRealBreak, isSportOrScripture, startMin, endMin };
    }).filter(Boolean).reduce((rows, slot) => {
        // Fold back-to-back breaks with the same name ("Lunch 1", "Lunch 2") into one.
        // Do not merge sport/scripture periods.
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

// Converts clipboard sessions to slot-like objects for the countdown
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
                    title: session.activity,
                    fullTitle: session.title ? `${session.activity}: ${session.title}` : session.activity,
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

// Daily/cycle switch. The active pill is positioned manually rather than with a
// framer-motion layoutId: a layout animation still in flight when the page swaps
// inside AnimatePresence can leave the next view blank (same issue as awards).
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
        <div className="relative flex items-center p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06] mt-4 md:mt-1 md:shrink-0 w-fit md:w-auto">
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
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{children}</span>
        {aside}
    </div>
);

// The rail's card, washed with the live class's colour. `phase` names what it is showing
// (before school, a break, a class); when that changes the card pulses once, a sheen sweeps
// across and the new content rises in, so a bell is something you notice.
const RailCard = ({ children, colour, phase }) => {
    const previous = useRef(phase);
    const [changedAt, setChangedAt] = useState(0);
    // Reduced motion keeps the swap but drops the blur, which framer-motion would still play.
    const still = useReducedMotion();

    useEffect(() => {
        if (previous.current === phase) return;
        previous.current = phase;
        setChangedAt(Date.now());
    }, [phase]);

    return (
        <section
            {...(colour ? subjectInk(colour) : {})}
            className={`relative overflow-hidden rounded-2xl border border-m-line bg-m-card m-shadow p-3 sm:p-4 transition-[border-color] duration-700 ${colour ? 'subject-wash' : ''}`}
        >
            {changedAt > 0 && (
                <>
                    <span key={`pulse-${changedAt}`} aria-hidden className="absolute inset-0 rounded-2xl pointer-events-none period-start" />
                    <motion.span
                        key={`sheen-${changedAt}`}
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-2/3 pointer-events-none"
                        style={{ background: 'linear-gradient(100deg, transparent, color-mix(in srgb, var(--subject-ink, hsl(var(--color-accent))) 26%, transparent), transparent)' }}
                        initial={{ x: '-110%' }}
                        animate={{ x: '170%' }}
                        transition={{ duration: 1.25, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                </>
            )}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={phase}
                    className="relative"
                    initial={still ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97, filter: 'blur(8px)' }}
                    animate={still ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={still ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, y: -10, filter: 'blur(6px)', transition: { duration: 0.18 } }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                >
                    {children}
                </motion.div>
            </AnimatePresence>
        </section>
    );
};

// The subject's colour from the timetable, as a small dot beside its name.
const SubjectDot = ({ colour }) => colour
    ? <span aria-hidden className="inline-block w-2 h-2 shrink-0 rounded-full subject-fill" {...subjectInk(colour)} />
    : null;

// Canvas links are keyed by the short class code; the full name is what's shown on desktop,
// abbreviated on mobile.
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

const Where = ({ slot }) => (
    <div className="mt-1 flex items-center gap-2 sm:gap-3 text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <span className="tabular-nums shrink-0">{formatTime12Hour(slot.bell.time)}{slot.bell.endTime ? `–${formatTime12Hour(slot.bell.endTime)}` : ''}</span>
        {slot.period.room && (
            <span className="inline-flex items-center gap-1 shrink-0"><MapPin size={12} />{slot.period.room}</span>
        )}
        {slot.period.fullTeacher && (
            <span className="inline-flex items-center gap-1 min-w-0"><UserRound size={12} className="shrink-0" /><span className="truncate">{slot.period.fullTeacher}</span><TeacherTreat name={slot.period.fullTeacher} /></span>
        )}
    </div>
);

const ThenLine = ({ slot, prefix = 'Then' }) => slot && (
    <div className="mt-2.5 sm:mt-4 pt-2.5 sm:pt-3 border-t border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <ArrowRight size={12} className="shrink-0" />
        <span className="shrink-0">{prefix}</span>
        <SubjectDot colour={slot.period.colour} />
        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
            <span className="lg:hidden">{slot.period.title}</span>
            <span className="hidden lg:inline">{slot.period.fullTitle || slot.period.title}</span>
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{formatTime12Hour(slot.bell.time)}</span>
    </div>
);

// Digits roll like an odometer: counting down, each new digit drops in from above while the
// old one falls away. Keyed from the right so the seconds keep their place as the string shortens.
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
        <span className="text-[26px] sm:text-[34px] leading-none font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">
            <span className="sr-only">{formatCountdown(mins)}</span>
            <span aria-hidden><RollingText text={formatCountdown(mins)} /></span>
        </span>
        <span className="text-xs sm:text-[13px] text-zinc-500">{caption}</span>
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

// What matters at this moment: the current class with a countdown, or what's first up.
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
    const next = allSlots.find(s => s.startMin >= (current ? current.endMin : nowMin));
    const schoolLeft = <span className="text-[12px] text-zinc-400 tabular-nums">{formatDuration(dayEnd - nowMin)} left today</span>;

    if (!current || (!isClass(current) && !current.isExtracurricular)) {
        const end = current ? current.endMin : (next?.startMin ?? dayEnd);
        const start = current ? current.startMin : nowMin;
        return (
            <RailCard phase={current ? `break-${current.bellId}` : 'between'}>
                <RailLabel aside={schoolLeft}>{current ? slotTitle(current.period) : 'Between classes'}</RailLabel>
                <Countdown mins={end - nowMin} caption="left" />
                <Progress value={((nowMin - start) / Math.max(1, end - start)) * 100} />
                <ThenLine slot={next} prefix="Next" />
            </RailCard>
        );
    }

    const isExtracurricular = current.isExtracurricular;
    const label = isExtracurricular ? 'Now · Extracurricular' : `Now · P${current.bellId}`;

    return (
        <RailCard phase={isExtracurricular ? `extracurricular-${current.bellId}` : `class-${current.bellId}`} colour={current.period.colour}>
            <RailLabel aside={schoolLeft}>{label}</RailLabel>
            <ClassTitle period={current.period} className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900 dark:text-white truncate" />
            <Where slot={current} />
            <div className="mt-2 sm:mt-4"><Countdown mins={current.endMin - nowMin} caption="left" /></div>
            <Progress value={((nowMin - current.startMin) / (current.endMin - current.startMin)) * 100} colour={current.period.colour} />
            <ThenLine slot={next} prefix="Next" />
        </RailCard>
    );
};

// My Synchron: a one-line greeting and the day's timetable, with a side rail holding the
// live countdown while school is on. Changes are marked on their rows.
const Home = ({ user, timetableData, railTimetable, viewDate, isCycle, viewMode = 'daily', onViewModeChange, clipboardSessions = [], currentWeek, dayNav, children }) => {
    const [now, setNow] = useState(new Date());
    const [scanIn, setScanIn] = useState({ date: null, state: 'loading' });
    const [todayTimetable, setTodayTimetable] = useState(() => peekDayTimetable(new Date()));

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Use the real day's bell times for polling bounds, independent of the date
    // currently selected in the timetable.
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
    const isSchoolDay = getDay(now) !== 0 && getDay(now) !== 6 && hasTodaySchedule;
    useEffect(() => {
        if (!user?.studentId || !isSchoolDay || !hasTodaySchedule) {
            setScanIn({ date: todayKey, state: 'unknown' });
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
                    setScanIn({ date: todayKey, state: 'scanned', time: getScanTime(record) });
                    return;
                }
                setScanIn({ date: todayKey, state: 'not-scanned' });
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
        setScanIn({ date: todayKey, state: 'loading' });
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

    // The greeting and rail describe the real school day (today, or the next one after
    // school), not whichever day is being browsed below. Falls back to the viewed day
    // until that's loaded.
    const inner = day?.timetable?.timetable || day?.timetable;
    const dayKey = day?.date || (viewDate ? format(viewDate, 'yyyy-MM-dd') : todayKey);
    const isLive = dayKey === todayKey;
    const isTomorrow = dayKey === format(addDays(now, 1), 'yyyy-MM-dd');
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const classCount = slots.filter(isClass).length;
    const dayWord = isLive ? 'Today' : isTomorrow ? 'Tomorrow' : format(new Date(`${dayKey}T00:00`), 'EEEE');

    const firstClass = slots.find(isClass);
    const clipboardSlots = buildClipboardSlots(clipboardSessions, dayKey);
    const hasExtracurriculars = clipboardSlots.length > 0;
    // The rail's window starts two hours before the earliest thing of the day —
    // a 7am training session counts, not just the first school bell.
    const dayStart = [slots[0]?.startMin, clipboardSlots[0]?.startMin].filter(n => n != null).reduce((a, b) => Math.min(a, b), Infinity);
    const dayEnd = slots.length ? slots[slots.length - 1].endMin : -Infinity;
    // Extend dayEnd if extracurriculars go after school
    const extendedDayEnd = hasExtracurriculars ? Math.max(dayEnd, clipboardSlots[clipboardSlots.length - 1].endMin) : dayEnd;
    // The side rail only earns its place while the day is happening: up to two hours
    // before the first event until the last one (including extracurriculars). The
    // header width follows the same rule in cycle view so it doesn't jump when
    // switching between daily and cycle.
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

    const dailyStatus = [
        inner?.dayname ? `${dayWord} is ${inner.dayname}` : null,
        !showRail && firstClass ? `starts ${formatTime12Hour(firstClass.bell.time)}` : null
    ].filter(Boolean).join(' · ');

    const cycleStatus = resolvedCurrentWeek ? `Currently Week ${resolvedCurrentWeek}` : null;
    const status = isCycle ? cycleStatus : dailyStatus;

    const rail = showRail && <NowCard slots={slots} nowMin={nowMin} isLive={isLive} clipboardSessions={clipboardSessions} dayKey={dayKey} />;

    // Header and content get their own containers: the greeting/toggle always uses
    // the daily width, while cycle keeps its wider table below.
    const headerWidth = railHours ? 'max-w-5xl' : 'max-w-3xl';
    const contentWidth = isCycle ? 'max-w-6xl' : headerWidth;

    return (
        <div>
            <div className={`mx-auto ${headerWidth}`}>
            <header className="mb-4 md:mb-10">
                <div className="md:flex md:items-start md:justify-between md:gap-4">
                    <div className="min-w-0">
                        <h1 className="text-[28px] md:text-[34px] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-white">
                            {getGreeting(now.getHours())}, <span className="text-accent">{user?.givenName || 'there'}</span>
                        </h1>
                        {status && <p className="mt-1.5 text-[15px] text-zinc-500 dark:text-zinc-400">{status}</p>}
                        {isSchoolDay && hasTodaySchedule && nowMin < schoolEndMin && scanIn.date === todayKey && scanIn.state !== 'loading' && scanIn.state !== 'unknown' && (
                            <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${scanIn.state === 'scanned' ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300'}`}>
                                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${scanIn.state === 'scanned' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span>{format(now, 'EEE d MMM')} · {scanIn.state === 'scanned' ? `Scanned on today at ${scanIn.time || 'time unavailable'}` : 'Not scanned yet today'}</span>
                            </p>
                        )}
                    </div>
                    <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
                </div>
            </header>
            </div>

            <div className={`mx-auto ${contentWidth}`}>
            {/* Day swipes are handled on the page container in App, so they work
                even over the empty space of a no-classes day. */}
            <div className={showRail ? 'grid gap-6 lg:gap-10 lg:grid-cols-[minmax(0,1fr)_280px]' : ''}>
                {/* On phones the countdown sits above the list so it's seen first */}
                {rail && <div className="lg:hidden">{rail}</div>}
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
