import React, { useState, useEffect } from 'react';
import PeriodCard from './PeriodCard';
import { motion } from 'framer-motion';
import { applyPeriodVariations, isBreakBell } from '../utils/timetable';

const Timetable = ({ timetableData, completeTimetable, showNow = true }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [viewMode, setViewMode] = useState('daily');
    const [selectedClass, setSelectedClass] = useState(null);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!timetableData || !timetableData.bells) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-555">
                <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-zinc-400 dark:border-t-zinc-500 rounded-full animate-spin mb-4"></div>
                Loading timetable data...
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

    const currentMinutes = showNow
        ? currentTime.getHours() * 60 + currentTime.getMinutes()
        : -1;

    // Calculate timeline boundaries
    let firstMin = 24 * 60;
    let lastMin = 0;

    const routineData = routine.map((bellId, index) => {
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
    let timelineProgressPos = 0;
    if (currentMinutes >= firstMin && currentMinutes <= lastMin) {
        timelineProgressPos = ((currentMinutes - firstMin) / (lastMin - firstMin)) * 100;
    } else if (currentMinutes > lastMin) {
        timelineProgressPos = 100;
    } else {
        timelineProgressPos = 0;
    }

    const renderCycleView = () => {
        if (!completeTimetable || !completeTimetable.bells) {
            return (
                <div className="bg-white dark:bg-zinc-950 p-12 text-center border border-zinc-200 dark:border-zinc-850 mt-6 shadow-sm">
                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center mx-auto mb-4 text-3xl">📅</div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">No Cycle Data</h3>
                    <p className="text-zinc-500">Complete timetable data not available.</p>
                </div>
            );
        }

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const { bells } = completeTimetable;
        
        // Get all unique bell IDs from the complete timetable structure
        const getDayTimetable = (dayIndex) => {
            const dayData = completeTimetable.timetable?.timetable?.[dayIndex] || completeTimetable.timetable?.[dayIndex];
            if (!dayData) return null;
            
            const periods = dayData.periods || {};
            const routine = dayData.routine ? dayData.routine.split(',') : [];
            
            return routine.map((bellId, index) => {
                const bell = bells.find(b => b.bell === bellId);
                if (!bell) return null;
                
                let periodInfo = periods[bellId] || { title: bell.bellDisplay };
                if (isBreakBell(bellId, periodInfo)) {
                    periodInfo = { ...periodInfo, title: bell.bellDisplay };
                }
                
                // Filter out roll call
                if (bellId === "RC" || (periodInfo.title && periodInfo.title.toLowerCase().includes("roll call"))) {
                    return null;
                }
                
                const isSelected = selectedClass && periodInfo.title === selectedClass;
                
                return {
                    bellId,
                    index,
                    bell,
                    periodInfo,
                    isSelected
                };
            }).filter(Boolean);
        };

        return (
            <div className="space-y-4">
                {days.map((day, dayIndex) => {
                    const dayPeriods = getDayTimetable(dayIndex);
                    if (!dayPeriods || dayPeriods.length === 0) return null;
                    
                    return (
                        <div key={day} className="bg-white dark:bg-zinc-950 p-3 md:p-4 border border-zinc-200 dark:border-zinc-850">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-2 px-1">{day}</h3>
                            <div className="space-y-1.5">
                                {dayPeriods.map((data) => (
                                    <div
                                        key={`${data.bellId}-${data.index}`}
                                        onClick={() => {
                                            if (data.periodInfo.title && data.periodInfo.title !== 'Free Period') {
                                                setSelectedClass(prev => prev === data.periodInfo.title ? null : data.periodInfo.title);
                                            }
                                        }}
                                        className="cursor-pointer"
                                    >
                                        <PeriodCard
                                            period={data.periodInfo}
                                            bell={data.bell}
                                            isCurrent={false}
                                            isNext={false}
                                            routineIndex={data.index}
                                            currentMinutes={-1}
                                            startMinutes={0}
                                            endMinutes={0}
                                            isHighlighted={data.isSelected}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
            {/* View Toggle Slider */}
            <div className="bg-white dark:bg-zinc-950 p-2 border border-zinc-200 dark:border-zinc-850 rounded-xl flex items-center gap-2">
                <button
                    onClick={() => setViewMode('daily')}
                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        viewMode === 'daily'
                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                    Daily
                </button>
                <button
                    onClick={() => setViewMode('cycle')}
                    className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        viewMode === 'cycle'
                            ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                >
                    Cycle
                </button>
            </div>

            {viewMode === 'daily' ? (
                <div className="bg-white dark:bg-zinc-950 p-3 md:p-4 border border-zinc-200 dark:border-zinc-850">
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
                            />
                        ))}
                    </div>
                </div>
            ) : (
                renderCycleView()
            )}
        </div>
    );
};

export default Timetable;
