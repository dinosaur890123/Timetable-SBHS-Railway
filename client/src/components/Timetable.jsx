import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, AlertCircle, Coffee, Umbrella, Calendar } from 'lucide-react';
import PeriodCard from './PeriodCard';
import { MotionConfig, motion } from 'framer-motion';
import { format, getDay } from 'date-fns';
import { applyPeriodVariations, describeClass, indexSubjects, isBreakBell, isBreakStylePeriod, subjectInk } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { useNoteFlowFonts } from './study/noteflow';
import { SessionLine, SessionSheet, dayKeyOf, endOf, startOf } from './clipboard/sessions';
import { termsPage, closureLabel } from '../services/pageData';
import { useCachedLoad } from '../utils/pageCache';

// A Clipboard session in the day: one line at its start time, dimmed once it's over like a break.
const SessionRow = ({ session, isPast, index, onOpen }) => (
    <motion.li
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: Math.min(index, 8) * 0.03 }}
        className="px-3 py-1.5"
    >
        <div className={`flex items-center gap-4 transition-opacity duration-700 ${isPast ? 'opacity-50 hover:opacity-100' : ''}`}>
            <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {format(startOf(session), 'HH:mm')}
            </span>
            <SessionLine session={session} onOpen={onOpen} />
        </div>
    </motion.li>
);

// One class in the cycle grid: its subject colour as an edge and a faint wash, full name up to two lines
// on desktop, abbreviated on mobile.
const CycleCell = ({ classInfo, onSelect }) => {
    const { name, title, room, colour, isSelected, isDimmed } = classInfo;
    const tinted = colour && !isSelected;
    return (
        <div
            onClick={onSelect}
            title={name}
            {...(tinted ? subjectInk(colour) : {})}
            className={`press press-soft min-h-[2.75rem] sm:min-h-[3.25rem] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md flex flex-col justify-center ${
                isSelected
                    ? 'bg-accent/10 border-accent/50 shadow-md'
                    : `${tinted ? 'subject-edge' : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'} border-zinc-200 dark:border-zinc-800 ${isDimmed ? 'opacity-35 grayscale hover:opacity-90 hover:grayscale-0' : ''}`
            }`}
        >
            <span className="text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 text-zinc-900 dark:text-white">
                <span className="lg:hidden">{title}</span>
                <span className="hidden lg:inline">{name}</span>
            </span>
            {room && (
                <span className="mt-0.5 text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{room}</span>
            )}
        </div>
    );
};

// Stands in for a day that's still on its way, the same shape as the rows that will replace it.
const DaySkeleton = () => (
    <ol className="-mx-3 space-y-1.5" aria-busy="true" aria-label="Loading timetable">
        {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-[62px] rounded-xl bg-zinc-900/[0.04] dark:bg-white/[0.05] animate-pulse-subtle" />
        ))}
    </ol>
);

const Timetable = ({ timetableData, completeTimetable, viewMode = 'daily', showNow = true, clipboardSessions = [], date, calendarEvents = [] }) => {
    const { getLink, linksEnabled } = useCanvasLinks();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState(null);
    const [openSession, setOpenSession] = useState(null);
    useNoteFlowFonts(clipboardSessions.length > 0);
    // Which row was live at the last tick, and when that last changed (see startedBell below).
    const bellWatch = useRef({ key: undefined, at: 0 });

    useEffect(() => {
        // Every second, so a bell is noticed as it rings rather than up to 15 seconds later.
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch terms data to check for school holidays - moved to top to avoid conditional hook calls
    const { data: terms } = useCachedLoad(termsPage().key, termsPage().load);

    if (!timetableData) return <DaySkeleton />;

    // The day being looked at: the date asked for, else the one the timetable says it's for.
    const todayKey = format(currentTime, 'yyyy-MM-dd');
    const viewedKey = date ? format(date, 'yyyy-MM-dd') : (timetableData.date || todayKey);
    const viewedDate = date || new Date(`${viewedKey}T00:00`);

    // Check if the current day is a staff development day
    const devDayEvent = calendarEvents.find(e => e.info?.date === viewedKey)?.items?.find(item =>
        item.title && /school development day/i.test(item.title)
    );

    // Check if the current day is a public holiday
    const publicHolidayEvent = calendarEvents.find(e => e.info?.date === viewedKey)?.items?.find(item =>
        item.title && /public holiday/i.test(item.title)
    );

    // Check if it's a weekend
    const dow = getDay(viewedDate);
    const isWeekend = dow === 0 || dow === 6;

    // Check if it's a school holiday
    const closure = closureLabel(viewedDate, terms, calendarEvents);
    const isSchoolHoliday = closure === 'School holidays';
    const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

    const { bells, timetable } = timetableData;
    const innerTimetable = timetable?.timetable || timetable;
    // Weekends and holidays have no bells or periods. A reply that has rolled on to a later school day
    // counts as none too, so Monday's classes never show up under Saturday.
    const servedKey = /^\d{4}-\d{2}-\d{2}$/.test(timetableData.date || '') ? timetableData.date : viewedKey;

    // For daily view only: check if there are no classes
    if (viewMode === 'daily' && (!bells || !innerTimetable?.periods || servedKey > viewedKey)) {
        // No classes, but Clipboard still runs: Saturday sport, Sunday rowing and so on.
        const nowKeyed = viewedKey < todayKey ? Infinity : viewedKey > todayKey ? -1 : minutesOf(currentTime);
        const daySessions = clipboardSessions
            .filter(s => dayKeyOf(s) === viewedKey)
            .sort((a, b) => startOf(a) - startOf(b))
            .map(s => ({ session: s, isPast: nowKeyed >= minutesOf(endOf(s) || startOf(s)) }));

        // Determine the appropriate notice message - priority: public holiday > dev day > school holidays > weekend
        let notice = null;
        if (publicHolidayEvent) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-4 px-6 py-6 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-2xl"
                >
                    <Calendar size={28} className="text-purple-600 dark:text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0 text-center">
                        <p className="text-lg font-semibold text-purple-900 dark:text-purple-100">{publicHolidayEvent.title}</p>
                        <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">No classes on {format(viewedDate, 'd MMMM')}</p>
                    </div>
                </motion.div>
            );
        } else if (devDayEvent) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-4 px-6 py-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl"
                >
                    <AlertCircle size={28} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0 text-center">
                        <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">{devDayEvent.title}</p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">No classes on {format(viewedDate, 'd MMMM')}</p>
                    </div>
                </motion.div>
            );
        } else if (isSchoolHoliday) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-4 px-6 py-6 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-2xl"
                >
                    <Umbrella size={28} className="text-green-600 dark:text-green-400 shrink-0" />
                    <div className="flex-1 min-w-0 text-center">
                        <p className="text-lg font-semibold text-green-900 dark:text-green-100">School holidays</p>
                        <p className="text-sm text-green-700 dark:text-green-300 mt-1">Enjoy your holidays!</p>
                    </div>
                </motion.div>
            );
        } else if (isWeekend) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-4 px-6 py-6 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl"
                >
                    <Coffee size={28} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0 text-center">
                        <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">Weekend</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Enjoy your weekend!</p>
                    </div>
                </motion.div>
            );
        }

        return (
            <MotionConfig reducedMotion="user">
                {viewMode === 'daily' && daySessions.length === 0 && notice && (
                    <div className="pb-10">
                        {notice}
                    </div>
                )}
                {daySessions.length > 0 && (
                    <ol className="-mx-3 space-y-0.5">
                        {daySessions.map(({ session, isPast }, i) => (
                            <SessionRow key={`cb-${session.id}`} session={session} isPast={isPast} index={i} onOpen={setOpenSession} />
                        ))}
                    </ol>
                )}
                <SessionSheet session={openSession} onClose={() => setOpenSession(null)} />
            </MotionConfig>
        );
    }

    const { periods } = innerTimetable;
    const routine = innerTimetable.routine ? innerTimetable.routine.split(',') : [];
    const classVariations = timetableData.classVariations || {};
    const roomVariations = timetableData.roomVariations || {};
    const daySubjects = timetable?.subjects;
    const subjectIndex = indexSubjects(completeTimetable);

    const getMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    // Only the live day gets a "now" marker. Earlier days render fully past,
    // later days render with nothing current or up next.
    const currentMinutes = !showNow || viewedKey > todayKey
        ? -1
        : viewedKey < todayKey
            ? 24 * 60
            : currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60;

    // Calculate timeline boundaries and routine data (only for daily view)
    let firstMin = 24 * 60;
    let lastMin = 0;
    let routineData = [];
    let timelineProgressPos = 0;
    let startedBell = null;

    if (viewMode === 'daily') {
        routineData = routine.map((bellId, index) => {
            const bell = bells.find(b => b.bell === bellId);
            if (!bell) return null;

            let periodInfo = periods[bellId] || { title: bell.bellDisplay };
            const originalTitle = periodInfo.title;
            const isActualBreak = isBreakBell(bellId, periodInfo);
            const isSportOrScripture = !isActualBreak && isBreakStylePeriod(bellId, periodInfo);

            if (isActualBreak) {
                periodInfo = { ...periodInfo, title: bell.bellDisplay };
            } else {
                periodInfo = applyPeriodVariations(periodInfo, bellId, classVariations, roomVariations);
                const { name, colour } = describeClass(periodInfo, daySubjects, subjectIndex);
                periodInfo = { ...periodInfo, fullTitle: name, colour };
            }

            // Filter out roll call from timetable view
            if (bellId === "RC" || (originalTitle && originalTitle.toLowerCase().includes("roll call"))) {
                return null;
            }

            const startMin = getMinutes(bell.time);
            const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;

            if (startMin < firstMin) firstMin = startMin;
            if (endMin > lastMin) lastMin = endMin;

            const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;
            const isNext = !isCurrent && currentMinutes !== -1 && currentMinutes < startMin && (index === 0 || currentMinutes >= getMinutes(routine[index - 1] ? bells.find(b => b.bell === routine[index - 1])?.time || "00:00" : "00:00"));

            const isBreak = isActualBreak || isSportOrScripture;
            // An empty Period 0 is just a gap before school starts.
            if (isActualBreak && String(bellId) === '0') return null;

            return {
                bellId, index, bell, periodInfo, startMin, endMin, isCurrent, isNext, isBreak, isSportOrScripture: !!isSportOrScripture,
                label: isActualBreak ? periodInfo.title.replace(/\s*\d+$/, '') : null
            };
        }).filter(Boolean).reduce((rows, row) => {
            // Fold back-to-back breaks with the same name ("Lunch 1", "Lunch 2") into one row.
            // Don't fold sport/scripture periods - they should remain separate.
            const prev = rows[rows.length - 1];
            if (prev?.isBreak && !prev.isSportOrScripture && row.isBreak && !row.isSportOrScripture && prev.label === row.label) {
                prev.endMin = row.endMin;
                prev.isCurrent = currentMinutes >= prev.startMin && currentMinutes < prev.endMin;
                return rows;
            }
            rows.push({ ...row });
            return rows;
        }, []);

        // A bell has just rung if the live row changed since the last tick on the same day.
        // Opening the page or browsing to another day never counts as a bell.
        const live = routineData.find(r => r.isCurrent);
        const liveKey = `${viewedKey}:${live ? live.bellId : 'none'}`;
        if (bellWatch.current.key !== liveKey) {
            const sameDay = bellWatch.current.key?.startsWith(`${viewedKey}:`);
            bellWatch.current = { key: liveKey, at: sameDay ? Date.now() : 0 };
        }
        startedBell = live && Date.now() - bellWatch.current.at < 2600 ? live.bellId : null;

        // Timeline Progress Line Position
        if (currentMinutes >= firstMin && currentMinutes <= lastMin) {
            timelineProgressPos = ((currentMinutes - firstMin) / (lastMin - firstMin)) * 100;
        } else if (currentMinutes > lastMin) {
            timelineProgressPos = 100;
        } else {
            timelineProgressPos = 0;
        }
    }

    const renderCycleView = () => {
        if (!completeTimetable) {
            return (
                <div className="rounded-2xl border border-m-line bg-m-card p-12 text-center mt-6">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-zinc-900/[0.04] dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 grid place-items-center">
                        <CalendarDays size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white mb-1">No cycle data</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Complete timetable data not available.</p>
                </div>
            );
        }

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        
        // Handle different possible data structures
        const bells = completeTimetable.bells || timetableData?.bells || [];
        const timetableStructure = completeTimetable.timetable || completeTimetable;
        const cycleDays = timetableStructure?.days || {};

        // The SBHS cycle runs over several weeks (usually A, B and C): days are keyed 1..15,
        // 1 = Monday A, 6 = Monday B, 11 = Monday C. Count the weeks from the highest day present.
        const dayNumbers = Object.keys(cycleDays).map(Number).filter(n => Number.isInteger(n) && n > 0);
        const weekCount = Math.max(1, Math.ceil(Math.max(0, ...dayNumbers) / days.length));
        const weekLetter = (name) => (name || '').trim().match(/([A-Z])$/)?.[1] || null;
        const weeks = Array.from({ length: weekCount }, (_, w) => {
            const dayNums = days.map((_, d) => w * days.length + d + 1);
            const label = dayNums.map(n => weekLetter(cycleDays[n]?.dayname)).find(Boolean) || String.fromCharCode(65 + w);
            return { label, dayNums };
        });
        const currentWeekLabel = weekLetter(innerTimetable?.dayname);
        const allDayNums = weeks.flatMap(w => w.dayNums);

        // Get all unique period slots across every day of the cycle, so rows line up between weeks
        const allPeriodSlots = new Set();
        allDayNums.forEach(dayNum => {
            const dayData = cycleDays[dayNum];
            if (dayData?.routine) {
                dayData.routine.split(',').forEach(bellId => {
                    const bell = bells.find(b => b.bell === bellId);
                    if (bell) allPeriodSlots.add(bellId);
                });
            }
        });

        // A period's class on a cycle day, or null for breaks, roll call and free periods
        const classPeriod = (dayNum, bellId) => {
            const periodInfo = cycleDays[dayNum]?.periods?.[bellId];
            if (!periodInfo) return null;
            if (isBreakBell(bellId, periodInfo)) return null;
            if (bellId === "RC" || (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call"))) return null;
            if (!periodInfo.title || periodInfo.title === 'Free Period' || periodInfo.title === '') return null;
            return periodInfo;
        };
        
        const periodSlots = Array.from(allPeriodSlots).sort((a, b) => {
            const bellA = bells.find(bell => bell.bell === a);
            const bellB = bells.find(bell => bell.bell === b);
            if (!bellA || !bellB) return 0;
            return bellA.time.localeCompare(bellB.time);
        }).filter(bellId => {
            // The cycle grid shows teaching periods only; breaks don't earn a row.
            const bell = bells.find(b => b.bell === bellId);
            if (isBreakBell(bellId, { title: bell?.bellDisplay })) return false;
            // Keep the period if it has at least one class anywhere in the cycle
            return allDayNums.some(dayNum => classPeriod(dayNum, bellId));
        });

        // Get class info for a specific cycle day and period
        const getClassInfo = (dayNum, bellId) => {
            const periodInfo = classPeriod(dayNum, bellId);
            if (!periodInfo) return null;
            
            const bell = bells.find(b => b.bell === bellId);
            const isSelected = !!selectedClass && periodInfo.title === selectedClass;
            const isDimmed = !!selectedClass && !isSelected;
            
            return {
                ...describeClass(periodInfo, null, subjectIndex),
                title: periodInfo.title,
                room: periodInfo.room,
                teacher: periodInfo.fullTeacher || periodInfo.teacher,
                bell: bell?.bellDisplay || bellId,
                isSelected,
                isDimmed
            };
        };

        if (periodSlots.length === 0) {
            return (
                <div className="rounded-2xl border border-m-line bg-m-card p-12 text-center mt-6">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-zinc-900/[0.04] dark:bg-white/[0.05] text-zinc-500 dark:text-zinc-400 grid place-items-center">
                        <CalendarDays size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white mb-1">No cycle data</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">No periods found in the complete timetable.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-6">
                {weeks.map(week => {
                    const isCurrentWeek = weeks.length > 1 && currentWeekLabel === week.label;
                    return (
                        <section key={week.label} aria-label={`Week ${week.label}`}>
                            {weeks.length > 1 && (
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-white">Week {week.label}</h3>
                                    {isCurrentWeek && (
                                        <span className="text-[10px] font-medium uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md bg-accent/10 text-accent">This week</span>
                                    )}
                                </div>
                            )}
                            <div className={`rounded-2xl border bg-m-card overflow-hidden ${isCurrentWeek ? 'border-accent/40' : 'border-m-line'}`}>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-m-panel border-b border-m-line">
                                                {days.map(day => (
                                                    <th key={day} className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.12em]">
                                                        {day.slice(0, 3)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {periodSlots.map(bellId => {
                                                const bell = bells.find(b => b.bell === bellId);
                                                if (!bell) return null;

                                                return (
                                                    <tr key={bellId} className="border-b border-zinc-900/[0.05] dark:border-white/[0.05] last:border-0">
                                                        {week.dayNums.map(dayNum => {
                                                            const classInfo = getClassInfo(dayNum, bellId);
                                                            
                                                            if (!classInfo) {
                                                                return (
                                                                    <td key={dayNum} className="px-1 sm:px-2 py-1 sm:py-2">
                                                                        <div className={`min-h-[2.75rem] sm:min-h-[3.25rem] h-full bg-zinc-900/[0.03] dark:bg-white/[0.03] rounded-lg transition-all duration-200 ${selectedClass ? 'opacity-40' : ''}`}></div>
                                                                    </td>
                                                                );
                                                            }

                                                            return (
                                                                <td key={dayNum} className="px-1 sm:px-2 py-1 sm:py-2">
                                                                    <CycleCell classInfo={classInfo} onSelect={() => setSelectedClass(prev => prev === classInfo.title ? null : classInfo.title)} />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>
        );
    };

    // Clipboard sessions on the viewed day slot in by start time: during school after the period they
    // start in, after school below "End of day".
    const daySessions = viewMode === 'daily'
        ? clipboardSessions.filter(s => dayKeyOf(s) === viewedKey).map(s => {
            const at = minutesOf(startOf(s));
            const until = endOf(s) ? minutesOf(endOf(s)) : at + 60;
            return { session: s, at, isPast: currentMinutes !== -1 && currentMinutes >= until };
        })
        : [];
    const dayRows = [
        ...routineData.map(row => ({ kind: 'period', at: row.startMin, row })),
        ...daySessions.filter(s => s.at < lastMin).map(s => ({ kind: 'session', ...s }))
    ].sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'period' ? -1 : 1));
    const afterSchool = daySessions.filter(s => s.at >= lastMin);

    // Variations for the day are summarised in the home page's header card.
    return (
        <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3 w-full">
            {viewMode === 'daily' && (
                <>
                    {publicHolidayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-xl"
                        >
                            <Calendar size={18} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-purple-900 dark:text-purple-100">{publicHolidayEvent.title}</p>
                                <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">No classes on {format(viewedDate, 'd MMMM')}</p>
                            </div>
                        </motion.div>
                    )}
                    {devDayEvent && !publicHolidayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl"
                        >
                            <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{devDayEvent.title}</p>
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">No classes on {format(viewedDate, 'd MMMM')}</p>
                            </div>
                        </motion.div>
                    )}
                    {isSchoolHoliday && !publicHolidayEvent && !devDayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-xl"
                        >
                            <Umbrella size={18} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-green-900 dark:text-green-100">School holidays</p>
                                <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">Enjoy your holidays!</p>
                            </div>
                        </motion.div>
                    )}
                    {isWeekend && !publicHolidayEvent && !devDayEvent && !isSchoolHoliday && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl"
                        >
                            <Coffee size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Weekend</p>
                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Enjoy your weekend!</p>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
            {viewMode === 'daily' ? (
                <>
                <ol className="-mx-3 space-y-0.5">
                    {dayRows.map(({ kind, row: data, session, isPast }, i) => kind === 'session' ? (
                        <SessionRow key={`cb-${session.id}`} session={session} isPast={isPast} index={i} onOpen={setOpenSession} />
                    ) : (
                        <PeriodCard
                            key={`${data.bellId}-${data.index}`}
                            period={data.periodInfo}
                            bell={data.bell}
                            label={data.label}
                            isBreak={data.isBreak}
                            isSportOrScripture={data.isSportOrScripture}
                            isCurrent={data.isCurrent}
                            justStarted={data.bellId === startedBell}
                            isNext={data.isNext}
                            routineIndex={data.index}
                            currentMinutes={currentMinutes}
                            startMinutes={data.startMin}
                            endMinutes={data.endMin}
                            canvasLink={getLink(data.periodInfo.title, data.periodInfo.year)}
                            linksEnabled={linksEnabled}
                        />
                    ))}
                    {routineData.length > 0 && (
                        <li className="flex items-center gap-4 px-3 pt-3">
                            <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
                                {routineData[routineData.length - 1].bell.endTime}
                            </span>
                            <span className="text-[12px] text-zinc-400 dark:text-zinc-500">End of day</span>
                        </li>
                    )}
                    {routineData.length > 0 && afterSchool.map(({ session, isPast }, i) => (
                        <SessionRow key={`cb-${session.id}`} session={session} isPast={isPast} index={dayRows.length + i} onOpen={setOpenSession} />
                    ))}
                </ol>
                <SessionSheet session={openSession} onClose={() => setOpenSession(null)} />
                </>
            ) : (
                renderCycleView()
            )}
        </div>
        </MotionConfig>
    );
};

export default Timetable;
