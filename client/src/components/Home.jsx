import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, MapPin, UserRound, CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { motion } from 'framer-motion';
import { applyPeriodVariations, isBreakBell } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';

const getMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
};

const getGreeting = (hour) => {
    if (hour < 5) return 'Good Night';
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    if (hour < 22) return 'Good Evening';
    return 'Good Night';
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

const Card = ({ label, aside, children, className = '' }) => (
    <section className={`relative flex flex-col min-w-0 rounded-2xl border border-m-line bg-m-card shadow-[var(--m-shadow)] p-4 md:p-5 ${className}`}>
        <header className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{label}</h2>
            {aside}
        </header>
        {children}
    </section>
);

const ClassTitle = ({ title, className }) => {
    const { getLink } = useCanvasLinks();
    const link = getLink(title);
    if (!link) return <h3 className={className}>{title}</h3>;
    return (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`${className} block hover:text-accent transition-colors`}>
            {title}
        </a>
    );
};

const VariationsCard = ({ slots, dayLabel }) => {
    const changes = slots.filter(s => !s.isBreak && (s.period.hasRoomChange || s.period.isSubstituted));

    return (
        <Card
            label={`${dayLabel}'s variations`}
            aside={changes.length > 0 && (
                <span className="font-mono text-[11px] min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    {changes.length}
                </span>
            )}
        >
            {changes.length === 0 ? (
                <div className="flex-1 flex items-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
                    <span>No changes. All classes as usual.</span>
                </div>
            ) : (
                <ul className="flex-1 -mx-1 space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                    {changes.map(({ bellId, period: p }) => (
                        <li key={bellId} className="px-1 py-1 rounded-lg text-sm">
                            <div className="flex items-baseline gap-2 min-w-0">
                                <span className="font-mono text-[11px] text-zinc-400 shrink-0">P{bellId}</span>
                                <span className="font-medium text-zinc-900 dark:text-white truncate">{p.title}</span>
                            </div>
                            <div className="pl-7 flex flex-col gap-0.5 text-[13px]">
                                {p.hasRoomChange && (
                                    <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 min-w-0">
                                        <MapPin size={12} className="shrink-0" />
                                        <span className="truncate">{p.oldRoom && p.oldRoom !== p.room ? `${p.oldRoom} → ${p.room}` : `Now in ${p.room}`}</span>
                                    </span>
                                )}
                                {p.isSubstituted && (
                                    <span className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400 min-w-0">
                                        <UserRound size={12} className="shrink-0" />
                                        <span className="truncate">{p.fullTeacher === 'No teacher' ? 'No teacher assigned' : `${p.fullTeacher} covering`}</span>
                                    </span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

const ProgressBar = ({ value }) => (
    <div className="h-1.5 w-full rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.08] overflow-hidden">
        <motion.div
            className="h-full rounded-full bg-accent"
            initial={false}
            animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
        />
    </div>
);

const Meta = ({ slot }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock size={13} /> {slot.bell.time}{slot.bell.endTime ? ` – ${slot.bell.endTime}` : ''}
        </span>
        {slot.period.room && (
            <span className={`inline-flex items-center gap-1.5 ${slot.period.hasRoomChange ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}`}>
                <MapPin size={13} /> {slot.period.room}
            </span>
        )}
        {slot.period.fullTeacher && (
            <span className={`inline-flex items-center gap-1.5 min-w-0 ${slot.period.isSubstituted ? 'text-blue-700 dark:text-blue-400 font-medium' : ''}`}>
                <UserRound size={13} className="shrink-0" /> <span className="truncate">{slot.period.fullTeacher}</span>
            </span>
        )}
    </div>
);

const UpNext = ({ slot, prefix }) => slot && (
    <div className="mt-3 pt-3 border-t border-m-line flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <ArrowRight size={13} className="shrink-0" />
        <span className="shrink-0">{prefix}</span>
        <span className="font-medium text-zinc-900 dark:text-white truncate">{slot.period.title}</span>
        {slot.period.room && <span className="shrink-0">· {slot.period.room}</span>}
        <span className="ml-auto shrink-0 tabular-nums">{slot.bell.time}</span>
    </div>
);

const NowCard = ({ slots, now, nowMin, isLive, viewedDate }) => {
    const classes = slots.filter(s => !s.isBreak && s.period.title && s.period.title !== 'Free Period');
    const dayStart = slots[0]?.startMin;
    const dayEnd = slots[slots.length - 1]?.endMin;

    if (classes.length === 0) {
        return (
            <Card label="Right now">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No classes on this day.</p>
            </Card>
        );
    }

    // Not today: preview how the viewed day starts.
    if (!isLive || nowMin >= dayEnd) {
        const first = classes[0];
        const isTomorrow = viewedDate && format(viewedDate, 'yyyy-MM-dd') === format(addDays(now, 1), 'yyyy-MM-dd');
        const when = !viewedDate ? 'Next day' : isTomorrow ? 'Tomorrow' : format(viewedDate, 'EEEE');
        return (
            <Card
                label={isLive ? 'School’s out' : `First up · ${when}`}
                aside={<span className="text-[12px] text-zinc-400 tabular-nums">{classes.length} classes</span>}
            >
                {isLive && <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">That’s the day done. First up next time:</p>}
                <ClassTitle title={first.period.title} className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white truncate" />
                <div className="mt-1.5"><Meta slot={first} /></div>
                <UpNext slot={classes[1]} prefix="Then" />
            </Card>
        );
    }

    const current = slots.find(s => nowMin >= s.startMin && nowMin < s.endMin);
    const next = classes.find(s => s.startMin >= (current ? current.endMin : nowMin));

    // Before school.
    if (nowMin < dayStart) {
        const first = classes[0];
        return (
            <Card label="Before school" aside={<span className="text-[12px] text-zinc-400">Starts {slots[0].bell.time}</span>}>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">{formatDuration(first.startMin - nowMin)}</span>
                    <span className="text-sm text-zinc-500">until first class</span>
                </div>
                <UpNext slot={first} prefix="First" />
            </Card>
        );
    }

    // Recess, lunch, or a gap between periods.
    if (!current || current.isBreak || !classes.includes(current)) {
        const breakEnd = current ? current.endMin : (next?.startMin ?? dayEnd);
        const breakStart = current ? current.startMin : nowMin;
        return (
            <Card label={current ? current.period.title : 'Between classes'} aside={<span className="text-[12px] text-zinc-400">{formatDuration(dayEnd - nowMin)} of school left</span>}>
                <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">{formatCountdown(breakEnd - nowMin)}</span>
                    <span className="text-sm text-zinc-500">left</span>
                </div>
                <ProgressBar value={((nowMin - breakStart) / Math.max(1, breakEnd - breakStart)) * 100} />
                <UpNext slot={next} prefix="Next" />
            </Card>
        );
    }

    // In class.
    const progress = ((nowMin - current.startMin) / (current.endMin - current.startMin)) * 100;
    return (
        <Card
            label={`Now · ${current.bell.bellDisplay || `Period ${current.bellId}`}`}
            aside={<span className="text-[12px] text-zinc-400">{formatDuration(dayEnd - nowMin)} of school left</span>}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <ClassTitle title={current.period.title} className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white truncate" />
                    <div className="mt-1.5"><Meta slot={current} /></div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-2xl md:text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white leading-none">
                        {formatCountdown(current.endMin - nowMin)}
                    </div>
                    <div className="text-[12px] text-zinc-400 mt-1">left</div>
                </div>
            </div>
            <div className="mt-4"><ProgressBar value={progress} /></div>
            <UpNext slot={next} prefix="Next" />
        </Card>
    );
};

// The top of "My Synchron": greeting, the viewed day's variations, and a live countdown for the current class.
const Home = ({ user, timetableData, viewDate }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const slots = buildSlots(timetableData);
    const inner = timetableData?.timetable?.timetable || timetableData?.timetable;
    const todayKey = format(now, 'yyyy-MM-dd');
    const viewedKey = timetableData?.date || (viewDate ? format(viewDate, 'yyyy-MM-dd') : todayKey);
    const isLive = viewedKey === todayKey;
    const isTomorrow = viewedKey === format(addDays(now, 1), 'yyyy-MM-dd');
    const viewedDate = viewDate || null;
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    const dayLabel = isLive ? 'Today' : isTomorrow ? 'Tomorrow' : viewedDate ? format(viewedDate, 'EEEE') : 'Today';
    const dayChip = inner?.dayname && (
        isLive ? `Today is ${inner.dayname}` : `${dayLabel} is ${inner.dayname}`
    );

    return (
        <div className="grid gap-5 xl:gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.4fr)] xl:items-center">
            <div className="min-w-0">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white leading-[1.05]">
                    {getGreeting(now.getHours())},{' '}
                    <span className="text-accent">{user?.givenName || 'Student'}</span>
                </h1>
                <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm md:text-base text-zinc-500 dark:text-zinc-400">
                    <CalendarIcon size={16} className="text-zinc-400 dark:text-zinc-500" />
                    <span>{format(now, 'EEEE, d MMMM yyyy')}</span>
                    {dayChip && (
                        <span className="px-2 py-0.5 rounded-md border border-m-line bg-zinc-900/[0.04] dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-200 text-xs md:text-sm font-medium">
                            {dayChip}
                        </span>
                    )}
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                <VariationsCard slots={slots} dayLabel={dayLabel} />
                <NowCard slots={slots} now={now} nowMin={nowMin} isLive={isLive} viewedDate={viewedDate} />
            </div>
        </div>
    );
};

export default Home;
