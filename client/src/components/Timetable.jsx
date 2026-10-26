import React, { useState, useEffect } from 'react';
import PeriodCard from './PeriodCard';
import { MotionConfig } from 'framer-motion';
import { format } from 'date-fns';
import { MapPin, UserRound } from 'lucide-react';
import { applyPeriodVariations, isBreakBell } from '../utils/timetable';
import { useCanvasLinks } from '../context/CanvasLinksContext';

const Timetable = ({ timetableData, completeTimetable, viewMode = 'daily', showNow = true }) => {
    const { getLink } = useCanvasLinks();
    const [currentTime, setCurrentTime] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 15000);
        return () => clearInterval(timer);
    }, []);

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

    if (viewMode === 'daily') {
        routineData = routine.map((bellId, index) => {
            const bell = bells.find(b => b.bell === bellId);
            if (!bell) return null;

            let periodInfo = periods[bellId] || { title: bell.bellDisplay };
            if (isBreakBell(bellId, periodInfo)) {
                periodInfo = { ...periodInfo, title: bell.bellDisplay };
            } else {
                periodInfo = applyPeriodVariations(periodInfo, bellId, classVariations, roomVariations);
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

            return {
                bellId, index, bell, periodInfo, startMin, endMin, isCurrent, isNext
            };
        }).filter(Boolean);

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
            const bellA = bells.find(b => b.bell === a);
            const bellB = bells.find(b => b.bell === b);
            if (!bellA || !bellB) return 0;
            return bellA.time.localeCompare(bellB.time);
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
                                                        <div className="h-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg"></div>
                                                    </td>
                                                );
                                            }
                                            
                                            const canvasLink = getLink(classInfo.title);

                                            return (
                                                <td key={dayIndex} className="px-2 py-2">
                                                    {canvasLink ? (
                                                        <a
                                                            href={canvasLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="block h-12"
                                                        >
                                                            <div
                                                                onClick={() => setSelectedClass(prev => prev === classInfo.title ? null : classInfo.title)}
                                                                className={`h-12 px-3 rounded-lg border cursor-pointer transition-all hover:shadow-md flex flex-col justify-center ${
                                                                    classInfo.isSelected
                                                                        ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-400 dark:border-violet-500 shadow-md'
                                                                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                                                }`}
                                                            >
                                                                <span className={`text-xs font-bold truncate ${
                                                                    classInfo.isSelected
                                                                        ? 'text-violet-700 dark:text-violet-300'
                                                                        : 'text-zinc-900 dark:text-white'
                                                                }`}>
                                                                    {classInfo.title}
                                                                </span>
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    {classInfo.room && (
                                                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                                                            {classInfo.room}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </a>
                                                    ) : (
                                                        <div
                                                            onClick={() => setSelectedClass(prev => prev === classInfo.title ? null : classInfo.title)}
                                                            className={`h-12 px-3 rounded-lg border cursor-pointer transition-all hover:shadow-md flex flex-col justify-center ${
                                                                classInfo.isSelected
                                                                    ? 'bg-violet-100 dark:bg-violet-900/30 border-violet-400 dark:border-violet-500 shadow-md'
                                                                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                                            }`}
                                                        >
                                                            <span className={`text-xs font-bold truncate ${
                                                                classInfo.isSelected
                                                                    ? 'text-violet-700 dark:text-violet-300'
                                                                    : 'text-zinc-900 dark:text-white'
                                                            }`}>
                                                                {classInfo.title}
                                                            </span>
                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                {classInfo.room && (
                                                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                                                                        {classInfo.room}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
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

    const changes = routineData.filter(d => d.periodInfo.hasRoomChange || d.periodInfo.isSubstituted);

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
            {viewMode === 'daily' ? (
                <>
                {changes.length > 0 && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                            {changes.length} {changes.length === 1 ? 'change' : 'changes'} to this day
                        </p>
                        <ul className="mt-1.5 space-y-1">
                            {changes.map(({ bellId, index, periodInfo: p }) => (
                                <li key={`${bellId}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                                    <span className="font-medium">P{bellId} {p.title}</span>
                                    {p.hasRoomChange && (
                                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                            <MapPin size={13} />
                                            {p.oldRoom && p.oldRoom !== p.room ? `${p.oldRoom} → ${p.room}` : `Now in ${p.room}`}
                                        </span>
                                    )}
                                    {p.isSubstituted && (
                                        <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
                                            <UserRound size={13} />
                                            {p.fullTeacher === 'No teacher' ? 'No teacher assigned' : `${p.fullTeacher} covering`}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <div className="bg-white dark:bg-zinc-950 p-2 sm:p-3 md:p-4 border border-zinc-200 dark:border-zinc-850 rounded-2xl">
                    <div className="space-y-1.5">
                        {routineData.map((data) => (
                            <PeriodCard
                                key={`${data.bellId}-${data.index}`}
                                period={data.periodInfo}
                                bell={data.bell}
                                isCurrent={data.isCurrent}
                                isNext={data.isNext}
                                routineIndex={data.index}
                                currentMinutes={currentMinutes}
                                startMinutes={data.startMin}
                                endMinutes={data.endMin}
                                canvasLink={getLink(data.periodInfo.title)}
                            />
                        ))}
                        {/* End of Day divider */}
                        {routineData.length > 0 && (
                            <div className="my-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                                    <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">
                                        End of Day
                                    </span>
                                    <div className="flex-1 h-px bg-zinc-200 dark:bg-[rgb(255_255_255/0.15)]" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                </>
            ) : (
                renderCycleView()
            )}
        </div>
        </MotionConfig>
    );
};

export default Timetable;
