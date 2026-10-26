import React, { useState, useEffect } from 'react';
import { ArrowRight, MapPin, UserRound } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { applyPeriodVariations, isBreakBell } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';

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
        const isBreak = isBreakBell(bellId, period);
        period = isBreak
            ? { ...period, title: bell.bellDisplay }
            : applyPeriodVariations(period, bellId, classVariations, roomVariations);

        if (bellId === 'RC' || period.title?.toLowerCase().includes('roll call')) return null;

        const startMin = getMinutes(bell.time);
        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;
        return { bellId, bell, period, isBreak, startMin, endMin };
    }).filter(Boolean);
};

const isClass = (slot) => !slot.isBreak && slot.period.title && slot.period.title !== 'Free Period';

const RailLabel = ({ children, aside }) => (
    <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{children}</span>
        {aside}
    </div>
);

const RailCard = ({ children }) => (
    <section className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] p-4">
        {children}
    </section>
);

const ClassTitle = ({ title, className }) => {
    const { getLink } = useCanvasLinks();
    const link = getLink(title);
    if (!link) return <div className={className}>{title}</div>;
    return (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`${className} block hover:underline decoration-zinc-400/50 underline-offset-4`}>
            {title}
        </a>
    );
};

const Where = ({ slot }) => (
    <div className="mt-1 flex items-center gap-3 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <span className="tabular-nums shrink-0">{slot.bell.time}{slot.bell.endTime ? `–${slot.bell.endTime}` : ''}</span>
        {slot.period.room && (
            <span className="inline-flex items-center gap-1 shrink-0"><MapPin size={12} />{slot.period.room}</span>
        )}
        {slot.period.fullTeacher && (
            <span className="inline-flex items-center gap-1 min-w-0"><UserRound size={12} className="shrink-0" /><span className="truncate">{slot.period.fullTeacher}</span></span>
        )}
    </div>
);

const ThenLine = ({ slot, prefix = 'Then' }) => slot && (
    <div className="mt-4 pt-3 border-t border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <ArrowRight size={12} className="shrink-0" />
        <span className="shrink-0">{prefix}</span>
        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{slot.period.title}</span>
        <span className="ml-auto shrink-0 tabular-nums">{slot.bell.time}</span>
    </div>
);

const Countdown = ({ mins, caption }) => (
    <div className="flex items-baseline gap-2">
        <span className="text-[34px] leading-none font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">{formatCountdown(mins)}</span>
        <span className="text-[13px] text-zinc-500">{caption}</span>
    </div>
);

const Progress = ({ value }) => (
    <div className="mt-4 h-1 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
);

// What matters at this moment: the current class with a countdown, or what's first up.
const NowCard = ({ slots, nowMin, isLive }) => {
    const classes = slots.filter(isClass);
    if (classes.length === 0) return null;

    const dayStart = slots[0].startMin;
    const dayEnd = slots[slots.length - 1].endMin;

    if (!isLive || nowMin >= dayEnd) return null;

    if (nowMin < dayStart) {
        return (
            <RailCard>
                <RailLabel>Before school</RailLabel>
                <Countdown mins={classes[0].startMin - nowMin} caption="until first class" />
                <ThenLine slot={classes[0]} prefix="First" />
            </RailCard>
        );
    }

    const current = slots.find(s => nowMin >= s.startMin && nowMin < s.endMin);
    const next = classes.find(s => s.startMin >= (current ? current.endMin : nowMin));
    const schoolLeft = <span className="text-[12px] text-zinc-400 tabular-nums">{formatDuration(dayEnd - nowMin)} left today</span>;

    if (!current || !isClass(current)) {
        const end = current ? current.endMin : (next?.startMin ?? dayEnd);
        const start = current ? current.startMin : nowMin;
        return (
            <RailCard>
                <RailLabel aside={schoolLeft}>{current ? current.period.title.replace(/\s*\d+$/, '') : 'Between classes'}</RailLabel>
                <Countdown mins={end - nowMin} caption="left" />
                <Progress value={((nowMin - start) / Math.max(1, end - start)) * 100} />
                <ThenLine slot={next} prefix="Next" />
            </RailCard>
        );
    }

    return (
        <RailCard>
            <RailLabel aside={schoolLeft}>Now · P{current.bellId}</RailLabel>
            <ClassTitle title={current.period.title} className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white truncate" />
            <Where slot={current} />
            <div className="mt-4"><Countdown mins={current.endMin - nowMin} caption="left" /></div>
            <Progress value={((nowMin - current.startMin) / (current.endMin - current.startMin)) * 100} />
            <ThenLine slot={next} prefix="Next" />
        </RailCard>
    );
};

// My Synchron: a one-line greeting and the day's timetable, with a side rail holding the
// live countdown while school is on. Changes are marked on their rows.
const Home = ({ user, timetableData, railTimetable, viewDate, isCycle, dayNav, children }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // The greeting and rail describe the real school day (today, or the next one after
    // school), not whichever day is being browsed below. Falls back to the viewed day
    // until that's loaded.
    const day = railTimetable || timetableData;
    const slots = buildSlots(day);
    const inner = day?.timetable?.timetable || day?.timetable;
    const todayKey = format(now, 'yyyy-MM-dd');
    const dayKey = day?.date || (viewDate ? format(viewDate, 'yyyy-MM-dd') : todayKey);
    const isLive = dayKey === todayKey;
    const isTomorrow = dayKey === format(addDays(now, 1), 'yyyy-MM-dd');
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const classCount = slots.filter(isClass).length;
    const changes = slots.filter(s => !s.isBreak && (s.period.hasRoomChange || s.period.isSubstituted));
    const dayWord = isLive ? 'Today' : isTomorrow ? 'Tomorrow' : format(new Date(`${dayKey}T00:00`), 'EEEE');

    const firstClass = slots.find(isClass);
    const dayStart = slots[0]?.startMin;
    const dayEnd = slots[slots.length - 1]?.endMin;
    // The side rail only earns its place while the day is happening: up to two hours
    // before the first bell until the last one.
    const showRail = !isCycle && isLive && classCount > 0 && nowMin >= dayStart - 120 && nowMin < dayEnd;

    const status = [
        inner?.dayname ? `${dayWord} is ${inner.dayname}` : null,
        classCount ? `${classCount} classes` : null,
        !showRail && firstClass ? `starts ${firstClass.bell.time}` : null,
        changes.length ? (changes.length === 1 ? '1 change' : `${changes.length} changes`) : null
    ].filter(Boolean).join(' · ');

    const rail = showRail && <NowCard slots={slots} nowMin={nowMin} isLive={isLive} />;

    return (
        <div className={`mx-auto ${isCycle ? 'max-w-6xl' : showRail ? 'max-w-5xl' : 'max-w-3xl'}`}>
            <header className="mb-8 md:mb-10">
                <h1 className="text-[28px] md:text-[34px] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-white">
                    {getGreeting(now.getHours())}, <span className="text-accent">{user?.givenName || 'there'}</span>
                </h1>
                {status && <p className="mt-1.5 text-[15px] text-zinc-500 dark:text-zinc-400">{status}</p>}
            </header>

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
    );
};

export default Home;
