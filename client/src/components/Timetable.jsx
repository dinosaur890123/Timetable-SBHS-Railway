import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, AlertCircle, Coffee, Umbrella, Calendar } from 'lucide-react';
import PeriodCard from './PeriodCard';
import { MotionConfig, motion } from 'framer-motion';
import { format, getDay } from 'date-fns';
import { applyPeriodVariations, describeClass, indexSubjects, isBreakBell, isBreakStylePeriod, isSportOrScripturePeriod, resolveRoutineBells, subjectInk, formatTime12Hour } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { useNoteFlowFonts } from './study/noteflow';
import { SessionLine, SessionSheet, dayKeyOf, endOf, startOf } from './clipboard/sessions';
import { termsPage, closureLabel } from '../services/pageData';
import { useCachedLoad } from '../utils/pageCache';

const SessionRow = ({ session, isPast, index, onOpen }) => {
    const startTime = startOf(session);
    const timeStr = startTime ? format(startTime, 'HH:mm') : '';
    return (
    <motion.li
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: Math.min(index, 8) * 0.03 }}
        className="px-2.5 sm:px-3 py-1.5"
    >
        <div className={`flex items-center gap-3 transition-opacity duration-700 ${isPast ? 'opacity-50 hover:opacity-100' : ''}`}>
            <span className="w-[3.25rem] shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {formatTime12Hour(timeStr)}
            </span>
            <SessionLine session={session} onOpen={onOpen} />
        </div>
    </motion.li>
    );
};

const CycleCell = ({ classInfo, onSelect }) => {
    const { name, title, room, colour, isSelected, isDimmed } = classInfo;
    return (
        <div
            onClick={onSelect}
            title={name}
            {...(colour ? subjectInk(colour) : {})}
            className={`press press-soft relative flex min-h-[3rem] flex-col items-start justify-center rounded-xl border px-1.5 py-1 md:flex-row md:items-center md:py-2 ${colour ? 'subject-bar md:pl-3.5 md:pr-2.5' : 'md:px-2.5'} text-left cursor-pointer transition-all duration-200 ${
                isSelected
                    ? 'bg-accent/10 border-accent/40 shadow-sm'
                : `bg-zinc-900/[0.018] dark:bg-white/[0.018] border-zinc-900/[0.06] dark:border-white/[0.06] hover:bg-zinc-900/[0.035] dark:hover:bg-white/[0.035] ${isDimmed ? 'opacity-35 grayscale hover:opacity-90 hover:grayscale-0' : ''}`
            }`}
        >
            <span className="min-w-0 w-full truncate text-[10px] font-medium leading-tight text-zinc-900 dark:text-white md:w-auto md:flex-1 md:text-[12px]">
                <span className="lg:hidden">{title}</span>
                <span className="hidden lg:inline">{name || title}</span>
            </span>
            {room && (
                <span className="max-w-full truncate text-[9px] font-medium leading-tight tabular-nums text-zinc-500 dark:text-zinc-400 md:ml-2 md:shrink-0 md:text-[11px]">{room}</span>
            )}
        </div>
    );
};

const DaySkeleton = () => (
    <ol className="-mx-3 space-y-1.5" aria-busy="true" aria-label="Loading timetable">
        {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-[62px] rounded-xl bg-zinc-900/[0.04] dark:bg-white/[0.05] animate-pulse-subtle" />
        ))}
    </ol>
);

const Timetable = ({ timetableData, completeTimetable, railTimetable, viewMode = 'daily', showNow = true, clipboardSessions = [], date, calendarEvents = [], currentWeek }) => {
    const { getLink, linksEnabled } = useCanvasLinks();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState(null);
    const [openSession, setOpenSession] = useState(null);
    useNoteFlowFonts(clipboardSessions.length > 0);
    const bellWatch = useRef({ key: undefined, at: 0 });

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { data: terms } = useCachedLoad(termsPage().key, termsPage().load);

    const resolvedCompleteTimetable = completeTimetable || (() => {
        try {
            return JSON.parse(localStorage.getItem('cached_complete_timetable') || 'null');
        } catch {
            return null;
        }
    })();

    if (viewMode === 'cycle' && !resolvedCompleteTimetable) return <DaySkeleton />;
    if (viewMode === 'daily' && !timetableData) return <DaySkeleton />;

    const todayKey = format(currentTime, 'yyyy-MM-dd');
    const viewedKey = date ? format(date, 'yyyy-MM-dd') : (timetableData?.date || todayKey);
    const viewedDate = date || new Date(`${viewedKey}T00:00`);

    const devDayEvent = calendarEvents.find(e => e.info?.date === viewedKey)?.items?.find(item =>
        item.title && /school development day/i.test(item.title)
    );

    const publicHolidayEvent = calendarEvents.find(e => e.info?.date === viewedKey)?.items?.find(item =>
        item.title && /public holiday/i.test(item.title)
    );

    const dow = getDay(viewedDate);
    const isWeekend = dow === 0 || dow === 6;

    const closure = closureLabel(viewedDate, terms, calendarEvents);
    const isSchoolHoliday = closure === 'School holidays';
    const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

    const { bells, timetable } = timetableData || {};
    const innerTimetable = timetable?.timetable || timetable;
    const servedKey = /^\d{4}-\d{2}-\d{2}$/.test(timetableData?.date || '') ? timetableData.date : viewedKey;

    if (viewMode === 'daily' && (!bells || !innerTimetable?.periods || servedKey > viewedKey)) {
        const nowKeyed = viewedKey < todayKey ? Infinity : viewedKey > todayKey ? -1 : minutesOf(currentTime);
        const daySessions = clipboardSessions
            .filter(s => dayKeyOf(s) === viewedKey)
            .sort((a, b) => startOf(a) - startOf(b))
            .map(s => ({ session: s, isPast: nowKeyed >= minutesOf(endOf(s) || startOf(s)) }));

        let notice = null;
        if (publicHolidayEvent) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-3 py-3 bg-blue-500/[0.06] dark:bg-blue-400/[0.08] border border-blue-500/[0.14] dark:border-blue-400/[0.16] rounded-xl"
                >
                    <Calendar size={17} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{publicHolidayEvent.title}</p>
                    </div>
                </motion.div>
            );
        } else if (devDayEvent) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-3 py-3 bg-blue-500/[0.06] dark:bg-blue-400/[0.08] border border-blue-500/[0.14] dark:border-blue-400/[0.16] rounded-xl"
                >
                    <AlertCircle size={17} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{devDayEvent.title}</p>
                    </div>
                </motion.div>
            );
        } else if (isSchoolHoliday) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-3 py-3 bg-zinc-900/[0.015] dark:bg-white/[0.02] border border-zinc-900/[0.07] dark:border-white/[0.08] rounded-xl"
                >
                    <Umbrella size={17} className="text-zinc-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">School holidays</p>
                    </div>
                </motion.div>
            );
        } else if (isWeekend) {
            notice = (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 px-3 py-3 bg-zinc-900/[0.015] dark:bg-white/[0.02] border border-zinc-900/[0.07] dark:border-white/[0.08] rounded-xl"
                >
                    <Coffee size={17} className="text-zinc-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Weekend</p>
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

    const { periods } = innerTimetable || {};
    const routine = innerTimetable?.routine ? innerTimetable.routine.split(',') : [];
    const routineBells = resolveRoutineBells(routine, bells);
    const classVariations = timetableData?.classVariations || {};
    const roomVariations = timetableData?.roomVariations || {};
    const daySubjects = timetable?.subjects;
    const subjectIndex = indexSubjects(resolvedCompleteTimetable);

    const getMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const currentMinutes = !showNow || viewedKey > todayKey
        ? -1
        : viewedKey < todayKey
            ? 24 * 60
            : currentTime.getHours() * 60 + currentTime.getMinutes() + currentTime.getSeconds() / 60;

    let firstMin = 24 * 60;
    let lastMin = 0;
    let routineData = [];
    let timelineProgressPos = 0;
    let startedBell = null;

    if (viewMode === 'daily') {
        routineData = routine.map((bellId, index) => {
            const bell = routineBells[index];
            if (!bell) return null;

            let periodInfo = periods?.[bellId] || { title: bell.bellDisplay };
            const originalTitle = periodInfo.title;
            const breakInfo = { ...periodInfo, bellDisplay: bell.bellDisplay };
            const isRealBreak = isBreakBell(bellId, breakInfo);

            if (isRealBreak) {
                periodInfo = { ...periodInfo, title: periodInfo.title || bell.bellDisplay };
            } else {
                periodInfo = applyPeriodVariations(periodInfo, bellId, classVariations, roomVariations);
                const { name, colour } = describeClass(periodInfo, daySubjects, subjectIndex);
                periodInfo = { ...periodInfo, fullTitle: name, colour };
            }

            if (bellId === "RC" || (originalTitle && String(originalTitle).toLowerCase().includes("roll call"))) {
                return null;
            }

            const startMin = getMinutes(bell.time);
            const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;

            if (startMin < firstMin) firstMin = startMin;
            if (endMin > lastMin) lastMin = endMin;

            const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;
            const isNext = !isCurrent && currentMinutes !== -1 && currentMinutes < startMin && (index === 0 || currentMinutes >= getMinutes(routineBells[index - 1]?.time || "00:00"));

            const isBreak = isBreakStylePeriod(bellId, breakInfo);
            if (isRealBreak && String(bellId) === '0') return null;

            const isSportOrScripture = !isRealBreak && isBreak;
            let label = null;
            if (isBreak) {
                if (isRealBreak) {
                    label = (periodInfo.title || bell.bellDisplay || '').replace(/\s*\d+$/, '');
                } else {
                    const rawLabel = periodInfo.fullTitle || periodInfo.title || '';
                    label = /^sp[\s-]?\d*$/i.test(rawLabel.trim()) ? 'Sport' : rawLabel;
                }
            }

            return {
                bellId, index, bell, periodInfo, startMin, endMin, isCurrent, isNext, isBreak, isRealBreak, isSportOrScripture,
                label
            };
        }).filter(Boolean).reduce((rows, row) => {
            const prev = rows[rows.length - 1];
            if (prev?.isRealBreak && row.isRealBreak && prev.label === row.label) {
                prev.endMin = row.endMin;
                prev.isCurrent = currentMinutes >= prev.startMin && currentMinutes < prev.endMin;
                return rows;
            }
            rows.push({ ...row });
            return rows;
        }, []).map((row, index, rows) => {
            const lunchRows = rows
                .map((candidate, rowIndex) => ({ candidate, rowIndex }))
                .filter(({ candidate }) => candidate.isRealBreak && /lunch/i.test(candidate.periodInfo.title || candidate.bell.bellDisplay || ''));
            const splitByClass = lunchRows.length > 1 && rows
                .slice(lunchRows[0].rowIndex + 1, lunchRows[lunchRows.length - 1].rowIndex)
                .some(middle => !middle.isBreak && middle.periodInfo.title && middle.periodInfo.title !== 'Free Period');
            if (!splitByClass || !row.isRealBreak || !/lunch/i.test(row.periodInfo.title || row.bell.bellDisplay || '')) return row;
            const lunchNumber = lunchRows.findIndex(({ rowIndex }) => rowIndex === index) + 1;
            return { ...row, label: `Lunch ${lunchNumber}` };
        });

        const live = routineData.find(r => r.isCurrent);
        const liveKey = `${viewedKey}:${live ? live.bellId : 'none'}`;
        if (bellWatch.current.key !== liveKey) {
            const sameDay = bellWatch.current.key?.startsWith(`${viewedKey}:`);
            bellWatch.current = { key: liveKey, at: sameDay ? Date.now() : 0 };
        }
        startedBell = live && Date.now() - bellWatch.current.at < 2600 ? live.bellId : null;

        if (currentMinutes >= firstMin && currentMinutes <= lastMin) {
            timelineProgressPos = ((currentMinutes - firstMin) / (lastMin - firstMin)) * 100;
        } else if (currentMinutes > lastMin) {
            timelineProgressPos = 100;
        } else {
            timelineProgressPos = 0;
        }
    }

    const renderCycleView = () => {
        const fullData = resolvedCompleteTimetable;
        if (!fullData) {
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

        const timetableStructure = fullData.timetable || fullData;
        const cycleDays = timetableStructure?.days || {};

        const bells = fullData.bells
            || timetableData?.bells
            || railTimetable?.bells
            || (() => {
                try {
                    const cached = JSON.parse(localStorage.getItem('cached_timetable') || '{}');
                    return cached?.bells || [];
                } catch {
                    return [];
                }
            })();

        const dayNumbers = Object.keys(cycleDays).map(Number).filter(n => Number.isInteger(n) && n > 0);
        const weekCount = Math.max(1, Math.ceil(Math.max(0, ...dayNumbers) / days.length));
        const weekLetter = (name) => (name || '').trim().match(/([A-Z])$/)?.[1] || null;
        const weeks = Array.from({ length: weekCount }, (_, w) => {
            const dayNums = days.map((_, d) => w * days.length + d + 1);
            const label = dayNums.map(n => weekLetter(cycleDays[n]?.dayname)).find(Boolean) || String.fromCharCode(65 + w);
            return { label, dayNums };
        });

        const currentWeekLabel = currentWeek
            || weekLetter(railTimetable?.timetable?.timetable?.dayname || railTimetable?.timetable?.dayname)
            || weekLetter(innerTimetable?.dayname)
            || (() => {
                try {
                    const cached = JSON.parse(localStorage.getItem('cached_timetable') || '{}');
                    return weekLetter(cached?.timetable?.timetable?.dayname || cached?.timetable?.dayname);
                } catch {
                    return null;
                }
            })();

        const allDayNums = weeks.flatMap(w => w.dayNums);

        const classPeriod = (dayNum, bellId) => {
            const periodInfo = cycleDays[dayNum]?.periods?.[bellId];
            if (!periodInfo) return null;
            const bellDisplay = bells.find(bell => bell.bell === bellId)?.bellDisplay;
            if (isBreakBell(bellId, { ...periodInfo, bellDisplay })) return null;
            if (bellId === "RC" || (periodInfo.title && String(periodInfo.title).toLowerCase().includes("roll call"))) return null;
            if (!periodInfo.title || periodInfo.title === 'Free Period' || periodInfo.title === '') return null;
            return periodInfo;
        };

        const allPeriodSlots = new Set();
        allDayNums.forEach(dayNum => {
            const dayData = cycleDays[dayNum];
            if (dayData?.routine) {
                dayData.routine.split(',').forEach(bellId => {
                    const cleanId = String(bellId).trim();
                    if (cleanId && cleanId !== 'RC') {
                        allPeriodSlots.add(cleanId);
                    }
                });
            }
            if (dayData?.periods) {
                Object.keys(dayData.periods).forEach(bellId => {
                    const cleanId = String(bellId).trim();
                    if (cleanId && cleanId !== 'RC') {
                        allPeriodSlots.add(cleanId);
                    }
                });
            }
        });

        const periodSlots = Array.from(allPeriodSlots).sort((a, b) => {
            const bellA = bells.find(bell => bell.bell === a);
            const bellB = bells.find(bell => bell.bell === b);
            if (bellA?.time && bellB?.time) {
                return bellA.time.localeCompare(bellB.time);
            }
            return String(a).localeCompare(String(b), undefined, { numeric: true });
        }).filter(bellId => {
            return allDayNums.some(dayNum => classPeriod(dayNum, bellId));
        });

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
                bell: bell?.bellDisplay || `Period ${bellId}`,
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
                                    <table className="w-full table-fixed">
                                        <thead>
                                            <tr className="bg-m-panel border-b border-m-line">
                                                {days.map(day => (
                                                    <th key={day} className="px-0.5 py-2 sm:px-4 sm:py-3 text-center sm:text-left text-[10px] sm:text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.06em] sm:tracking-[0.1em]">
                                                        {day.slice(0, 3)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {periodSlots.map(bellId => (
                                                <tr key={bellId} className="border-b border-zinc-900/[0.05] dark:border-white/[0.05] last:border-0">
                                                    {week.dayNums.map(dayNum => {
                                                        const classInfo = getClassInfo(dayNum, bellId);

                                                        if (!classInfo) {
                                                            return (
                                                                <td key={dayNum} className="px-0.5 py-1 sm:px-2 sm:py-2">
                                                                    <div className={`min-h-[3rem] h-full rounded-xl border border-dashed border-zinc-900/[0.05] dark:border-white/[0.05] bg-zinc-900/[0.012] dark:bg-white/[0.012] transition-all duration-200 ${selectedClass ? 'opacity-40' : ''}`}></div>
                                                                </td>
                                                            );
                                                        }

                                                        return (
                                                            <td key={dayNum} className="px-0.5 py-1 sm:px-2 sm:py-2">
                                                                <CycleCell classInfo={classInfo} onSelect={() => setSelectedClass(prev => prev === classInfo.title ? null : classInfo.title)} />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
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

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3 w-full">
            {viewMode === 'daily' && (
                <>
                    {publicHolidayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-3 py-3 bg-blue-500/[0.06] dark:bg-blue-400/[0.08] border border-blue-500/[0.14] dark:border-blue-400/[0.16] rounded-xl"
                        >
                            <Calendar size={17} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{publicHolidayEvent.title}</p>
                            </div>
                        </motion.div>
                    )}
                    {devDayEvent && !publicHolidayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-3 py-3 bg-blue-500/[0.06] dark:bg-blue-400/[0.08] border border-blue-500/[0.14] dark:border-blue-400/[0.16] rounded-xl"
                        >
                            <AlertCircle size={17} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">{devDayEvent.title}</p>
                            </div>
                        </motion.div>
                    )}
                    {isSchoolHoliday && !publicHolidayEvent && !devDayEvent && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-3 py-3 bg-zinc-900/[0.015] dark:bg-white/[0.02] border border-zinc-900/[0.07] dark:border-white/[0.08] rounded-xl"
                        >
                            <Umbrella size={17} className="text-zinc-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">School holidays</p>
                            </div>
                        </motion.div>
                    )}
                    {isWeekend && !publicHolidayEvent && !devDayEvent && !isSchoolHoliday && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-3 py-3 bg-zinc-900/[0.015] dark:bg-white/[0.02] border border-zinc-900/[0.07] dark:border-white/[0.08] rounded-xl"
                        >
                            <Coffee size={17} className="text-zinc-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Weekend</p>
                            </div>
                        </motion.div>
                    )}
                </>
            )}
            {viewMode === 'daily' ? (
                <>
                <ol className="-mx-3 space-y-1 rounded-2xl border border-zinc-900/[0.06] bg-zinc-900/[0.02] px-2 py-2 dark:border-white/[0.06] dark:bg-white/[0.025]">
                    {dayRows.map(({ kind, row: data, session, isPast }, i) => kind === 'session' ? (
                        <SessionRow key={`cb-${session.id}`} session={session} isPast={isPast} index={i} onOpen={setOpenSession} />
                    ) : (
                        <PeriodCard
                            key={`${viewedKey}-${data.bellId}-${data.index}`}
                            period={data.periodInfo}
                            bell={data.bell}
                            label={data.label}
                            isBreak={data.isBreak}
                            isRealBreak={data.isRealBreak}
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
                        <li className="flex items-center gap-3 px-2.5 sm:px-3 pt-3">
                            <span className="w-[3.25rem] shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">
                                {formatTime12Hour(routineData[routineData.length - 1].bell.endTime)}
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
