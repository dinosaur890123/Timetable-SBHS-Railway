import React, { useState, useEffect, useRef } from 'react';
import PeriodCard from './PeriodCard';
import { MotionConfig, motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { applyPeriodVariations, describeClass, indexSubjects, isBreakBell, subjectInk } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { fetchStudentClipboardSessions } from '../services/api';
import { Calendar, MapPin, Users, X } from 'lucide-react';

// One class in the cycle grid: its subject colour as an edge and a faint wash, full name up to two lines
// on desktop, abbreviated on mobile.
const CycleCell = ({ classInfo, onSelect }) => {
    const { name, title, room, colour, isSelected } = classInfo;
    const tinted = colour && !isSelected;
    return (
        <div
            onClick={onSelect}
            title={name}
            {...(tinted ? subjectInk(colour) : {})}
            className={`press press-soft min-h-[3.25rem] px-3 py-1.5 rounded-lg border cursor-pointer transition-all hover:shadow-md flex flex-col justify-center ${
                isSelected
                    ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-400 dark:border-violet-500 shadow-md'
                    : `${tinted ? 'subject-edge' : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800'} border-zinc-200 dark:border-zinc-800`
            }`}
        >
            <span className={`text-xs font-bold leading-tight line-clamp-2 ${
                isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-900 dark:text-white'
            }`}>
                <span className="lg:hidden">{title}</span>
                <span className="hidden lg:inline">{name}</span>
            </span>
            {room && (
                <span className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{room}</span>
            )}
        </div>
    );
};

const Timetable = ({ timetableData, completeTimetable, viewMode = 'daily', showNow = true, showClipboardEvents = false, user = null }) => {
    const { getLink } = useCanvasLinks();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState(null);
    const [clipboardSessions, setClipboardSessions] = useState([]);
    const [selectedClipboardEvent, setSelectedClipboardEvent] = useState(null);
    // Which row was live at the last tick, and when that last changed (see startedBell below).
    const bellWatch = useRef({ key: undefined, at: 0 });

    useEffect(() => {
        // Every second, so a bell is noticed as it rings rather than up to 15 seconds later.
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch clipboard sessions when toggle is enabled
    useEffect(() => {
        if (!showClipboardEvents || !user?.studentId) {
            setClipboardSessions([]);
            return;
        }

        const loadClipboardSessions = async () => {
            try {
                const sessions = await fetchStudentClipboardSessions(user.studentId);
                setClipboardSessions(sessions);
            } catch (err) {
                console.error("Failed to fetch clipboard sessions:", err);
                setClipboardSessions([]);
            }
        };

        loadClipboardSessions();
    }, [showClipboardEvents, user?.studentId]);

    if (!timetableData || !timetableData.bells) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-555">
                <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-zinc-400 dark:border-t-zinc-500 rounded-full animate-spin mb-4"></div>
                Loading timetable...
            </div>
        );
    }

    const { bells, timetable } = timetableData;
    const innerTimetable = timetable?.timetable || timetable;

    if (!innerTimetable || !innerTimetable.periods) {
        return (
            <div className="bg-white dark:bg-zinc-950 p-12 text-center border border-zinc-200 dark:border-zinc-850 mt-6 shadow-sm">
                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center mx-auto mb-4 text-3xl">🎉</div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No Classes Today!</h3>
                <p className="text-zinc-500">Enjoy your day off or do something fun.</p>
            </div>
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
    const todayKey = format(currentTime, 'yyyy-MM-dd');
    const viewedKey = timetableData.date || todayKey;
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
            if (isBreakBell(bellId, periodInfo)) {
                periodInfo = { ...periodInfo, title: bell.bellDisplay };
            } else {
                periodInfo = applyPeriodVariations(periodInfo, bellId, classVariations, roomVariations);
                const { name, colour } = describeClass(periodInfo, daySubjects, subjectIndex);
                periodInfo = { ...periodInfo, fullTitle: name, colour };
            }

            // Filter out roll call from timetable view
            if (bellId === "RC" || (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call"))) {
                return null;
            }

            const startMin = getMinutes(bell.time);
            const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60;

            if (startMin < firstMin) firstMin = startMin;
            if (endMin > lastMin) lastMin = endMin;

            const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;
            const isNext = !isCurrent && currentMinutes !== -1 && currentMinutes < startMin && (index === 0 || currentMinutes >= getMinutes(routine[index - 1] ? bells.find(b => b.bell === routine[index - 1])?.time || "00:00" : "00:00"));

            const isBreak = isBreakBell(bellId, periodInfo);
            // An empty Period 0 is just a gap before school starts.
            if (isBreak && String(bellId) === '0') return null;

            // Find clipboard events that overlap with this period
            const periodClipboardEvents = dayClipboardSessions.filter(session => {
                return session.startMin < endMin && session.endMin > startMin;
            });

            return {
                bellId, index, bell, periodInfo, startMin, endMin, isCurrent, isNext, isBreak,
                label: isBreak ? periodInfo.title.replace(/\s*\d+$/, '') : null,
                clipboardEvents: periodClipboardEvents
            };
        }).filter(Boolean).reduce((rows, row) => {
            // Fold back-to-back breaks with the same name ("Lunch 1", "Lunch 2") into one row.
            const prev = rows[rows.length - 1];
            if (prev?.isBreak && row.isBreak && prev.label === row.label) {
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

    // Filter and process clipboard sessions for the current day
    const dayClipboardSessions = clipboardSessions.filter(session => {
        if (!session.startDateTime) return false;
        const sessionDate = format(parseISO(session.startDateTime), 'yyyy-MM-dd');
        return sessionDate === viewedKey;
    }).map(session => {
        // Parse start and end times to minutes
        const startDate = session.startDateTime ? parseISO(session.startDateTime) : null;
        const endDate = session.endDateTime ? parseISO(session.endDateTime) : null;
        const startMin = startDate ? startDate.getHours() * 60 + startDate.getMinutes() : 0;
        const endMin = endDate ? endDate.getHours() * 60 + endDate.getMinutes() : startMin + 60;

        // Determine if this session falls during school hours
        const isDuringSchool = startMin >= firstMin && endMin <= lastMin;

        return {
            ...session,
            startMin,
            endMin,
            isDuringSchool
        };
    }).sort((a, b) => a.startMin - b.startMin);

    // Clipboard Event Card Component (for after-school events)
    const ClipboardEventCard = ({ session, index }) => {
        const isPast = currentMinutes !== -1 && currentMinutes >= session.endMin;
        const isCurrent = currentMinutes >= session.startMin && currentMinutes < session.endMin;
        const dim = isPast ? 'opacity-50 hover:opacity-100 transition-opacity duration-700' : 'transition-opacity duration-700';

        const startTime = session.startDateTime ? format(parseISO(session.startDateTime), 'h:mm a') : '';
        const endTime = session.endDateTime ? format(parseISO(session.endDateTime), 'h:mm a') : '';

        return (
            <motion.li
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index, 8) * 0.03 }}
                className={`group rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06] transition-colors duration-500 ${isCurrent
                    ? 'bg-accent/10 dark:bg-accent/20 border-accent/30'
                    : 'hover:bg-zinc-900/[0.025] dark:hover:bg-white/[0.025]'} ${dim}`}
                onClick={() => setSelectedClipboardEvent(session)}
            >
                <div className="relative flex items-center gap-4 px-3 py-3">
                    {/* Left accent bar */}
                    <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${isCurrent ? 'bg-accent' : 'bg-zinc-400 dark:bg-zinc-600'}`} />

                    <div className="w-11 shrink-0 text-right leading-tight">
                        <div className={`text-[13px] tabular-nums ${isCurrent ? 'font-medium text-accent' : 'text-zinc-500 dark:text-zinc-400'}`}>{startTime}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{endTime}</div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50" title={session.activity}>
                                {session.activity}
                            </h3>
                            {session.title && (
                                <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                                    {session.title}
                                </span>
                            )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                            {isCurrent ? (
                                <span className="shrink-0 font-medium text-accent">Now</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
                                After school
                            </span>
                        </div>
                    </div>
                </div>
            </motion.li>
        );
    };

    const renderCycleView = () => {
        if (!completeTimetable) {
            return (
                <div className="bg-white dark:bg-zinc-950 p-12 text-center border border-zinc-200 dark:border-zinc-850 mt-6 shadow-sm">
                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center mx-auto mb-4 text-3xl">📅</div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No Cycle Data</h3>
                    <p className="text-zinc-500">Complete timetable data not available.</p>
                </div>
            );
        }

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        
        // Handle different possible data structures
        const bells = completeTimetable.bells || timetableData?.bells || [];
        const timetableStructure = completeTimetable.timetable || completeTimetable;

        // "Lunch 1" -> "Lunch" for break bells; null for anything else.
        const breakLabel = (bellId) => {
            const bell = bells.find(b => b.bell === bellId);
            if (!bell || !isBreakBell(bellId, { title: bell.bellDisplay })) return null;
            return bell.bellDisplay.replace(/\s*\d+$/, '');
        };

        // Get all unique period slots across all days
        const allPeriodSlots = new Set();
        days.forEach((_, dayIndex) => {
            // SBHS API uses 1-based indexing for days (1=Monday, 2=Tuesday, etc.)
            const dayData = timetableStructure?.days?.[dayIndex + 1];
            if (dayData?.routine) {
                dayData.routine.split(',').forEach(bellId => {
                    const bell = bells.find(b => b.bell === bellId);
                    if (bell) allPeriodSlots.add(bellId);
                });
            }
        });
        
        const periodSlots = Array.from(allPeriodSlots).sort((a, b) => {
            const bellA = bells.find(bell => bell.bell === a);
            const bellB = bells.find(bell => bell.bell === b);
            if (!bellA || !bellB) return 0;
            return bellA.time.localeCompare(bellB.time);
        }).filter(bellId => {
            // Breaks have no class but still mark the shape of the day; an empty Period 0 does not.
            const bell = bells.find(b => b.bell === bellId);
            if (isBreakBell(bellId, { title: bell?.bellDisplay })) {
                return bellId !== 'RC' && String(bellId) !== '0';
            }

            // Check if this period has at least one class across all days
            const hasAnyClass = days.some((_, dayIndex) => {
                const dayData = timetableStructure?.days?.[dayIndex + 1];
                if (!dayData) return false;
                
                const periods = dayData.periods || {};
                const periodInfo = periods[bellId];
                
                // No period info at all
                if (!periodInfo) return false;
                
                // Filter out breaks, roll call, and free periods
                if (isBreakBell(bellId, periodInfo)) return false;
                if (bellId === "RC" || (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call"))) return false;
                if (!periodInfo.title || periodInfo.title === 'Free Period' || periodInfo.title === '') return false;
                
                return true;
            });
            
            return hasAnyClass;
        }).filter((bellId, i, slots) => {
            // Fold back-to-back breaks with the same name ("Lunch 1", "Lunch 2") into one row.
            const label = breakLabel(bellId);
            return !label || label !== breakLabel(slots[i - 1]);
        });

        // Get class info for a specific day and period
        const getClassInfo = (dayIndex, bellId) => {
            // SBHS API uses 1-based indexing for days (1=Monday, 2=Tuesday, etc.)
            const dayData = timetableStructure?.days?.[dayIndex + 1];
            if (!dayData) return null;
            
            const periods = dayData.periods || {};
            let periodInfo = periods[bellId] || null;
            
            // Filter out breaks, roll call, and free periods
            if (!periodInfo) return null;
            if (isBreakBell(bellId, periodInfo)) return null;
            if (bellId === "RC" || (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call"))) return null;
            if (!periodInfo.title || periodInfo.title === 'Free Period' || periodInfo.title === '') return null;
            
            const bell = bells.find(b => b.bell === bellId);
            const isSelected = selectedClass && periodInfo.title === selectedClass;
            
            return {
                ...describeClass(periodInfo, null, subjectIndex),
                title: periodInfo.title,
                room: periodInfo.room,
                teacher: periodInfo.fullTeacher || periodInfo.teacher,
                bell: bell?.bellDisplay || bellId,
                isSelected
            };
        };

        if (periodSlots.length === 0) {
            return (
                <div className="bg-white dark:bg-zinc-950 p-12 text-center border border-zinc-200 dark:border-zinc-850 mt-6 shadow-sm">
                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center mx-auto mb-4 text-3xl">📅</div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No Cycle Data</h3>
                    <p className="text-zinc-500">No periods found in complete timetable.</p>
                </div>
            );
        }

        return (
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                                <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-24">Period</th>
                                {days.map(day => (
                                    <th key={day} className="px-4 py-3 text-left text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                        {day.slice(0, 3)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {periodSlots.map(bellId => {
                                const bell = bells.find(b => b.bell === bellId);
                                if (!bell) return null;

                                const label = breakLabel(bellId);
                                if (label) {
                                    return (
                                        <tr key={bellId} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                            <td className="px-4 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">{label}</td>
                                            <td colSpan={days.length} className="px-2 py-1.5">
                                                <div className="h-px bg-zinc-900/[0.06] dark:bg-white/[0.06]" />
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr key={bellId} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                        <td className="px-4 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                            {bell.bellDisplay}
                                        </td>
                                        {days.map((_, dayIndex) => {
                                            const classInfo = getClassInfo(dayIndex, bellId);
                                            
                                            if (!classInfo) {
                                                return (
                                                    <td key={dayIndex} className="px-2 py-2">
                                                        <div className="min-h-[3.25rem] h-full bg-zinc-50 dark:bg-zinc-900/50 rounded-lg"></div>
                                                    </td>
                                                );
                                            }
                                            
                                            const canvasLink = getLink(classInfo.title);
                                            const cell = <CycleCell classInfo={classInfo} onSelect={() => setSelectedClass(prev => prev === classInfo.title ? null : classInfo.title)} />;

                                            return (
                                                <td key={dayIndex} className="px-2 py-2">
                                                    {canvasLink ? (
                                                        <a
                                                            href={canvasLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="block"
                                                        >
                                                            {cell}
                                                        </a>
                                                    ) : cell}
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
        );
    };

    // Variations for the day are summarised in the home page's header card.
    return (
        <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3 w-full">
            {viewMode === 'daily' ? (
                <>
                <ol className="-mx-3 space-y-0.5">
                    {routineData.map((data) => (
                        <PeriodCard
                            key={`${data.bellId}-${data.index}`}
                            period={data.periodInfo}
                            bell={data.bell}
                            label={data.label}
                            isBreak={data.isBreak}
                            isCurrent={data.isCurrent}
                            justStarted={data.bellId === startedBell}
                            isNext={data.isNext}
                            routineIndex={data.index}
                            currentMinutes={currentMinutes}
                            startMinutes={data.startMin}
                            endMinutes={data.endMin}
                            canvasLink={getLink(data.periodInfo.title)}
                            clipboardEvents={data.clipboardEvents || []}
                            onClipboardEventClick={setSelectedClipboardEvent}
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

                    {/* After-school clipboard events */}
                    {showClipboardEvents && dayClipboardSessions.filter(s => !s.isDuringSchool).length > 0 && (
                        <>
                            <li className="flex items-center gap-4 px-3 pt-4 pb-2">
                                <span className="w-11 shrink-0"></span>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">After school</span>
                            </li>
                            {dayClipboardSessions.filter(s => !s.isDuringSchool).map((session, idx) => (
                                <ClipboardEventCard key={session.id} session={session} index={idx} />
                            ))}
                        </>
                    )}
                </ol>
                </>
            ) : (
                renderCycleView()
            )}
        </div>

        {/* Clipboard Event Detail Modal */}
        <AnimatePresence>
            {selectedClipboardEvent && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 dark:bg-zinc-950/70 backdrop-blur-sm"
                onClick={() => setSelectedClipboardEvent(null)}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-md w-full overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6 space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{selectedClipboardEvent.activity}</h3>
                                {selectedClipboardEvent.title && (
                                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{selectedClipboardEvent.title}</p>
                                )}
                            </div>
                            <button
                                onClick={() => setSelectedClipboardEvent(null)}
                                className="shrink-0 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <X size={20} className="text-zinc-500 dark:text-zinc-400" />
                            </button>
                        </div>

                        <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                    <Calendar size={16} className="text-zinc-500 dark:text-zinc-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Date & Time</p>
                                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                        {selectedClipboardEvent.date} · {selectedClipboardEvent.time}
                                    </p>
                                </div>
                            </div>

                            {selectedClipboardEvent.location && (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                        <MapPin size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Location</p>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                            {selectedClipboardEvent.location}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedClipboardEvent.team && (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                        <Users size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Team</p>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                            {selectedClipboardEvent.team}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {selectedClipboardEvent.staff && (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                                        <Users size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Staff</p>
                                        <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                            {selectedClipboardEvent.staff}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-800">
                        <button
                            onClick={() => setSelectedClipboardEvent(null)}
                            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </motion.div>
            )}
        </AnimatePresence>
        </MotionConfig>
    );
};

export default Timetable;
