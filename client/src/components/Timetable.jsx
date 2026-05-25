import React, { useState, useEffect } from 'react';
import PeriodCard from './PeriodCard';
import { motion } from 'framer-motion';
import { fetchTimetableQa } from '../services/api';
import { Sparkles } from 'lucide-react';

const Timetable = ({ timetableData, showNow = true, aiDisabled }) => {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [qaLoading, setQaLoading] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    if (!timetableData || !timetableData.bells) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-550">
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
                <p className="text-zinc-500">Enjoy your day off or catch up on some study.</p>
            </div>
        );
    }

    const { periods } = innerTimetable;
    const routine = innerTimetable.routine ? innerTimetable.routine.split(',') : [];
    
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

        const periodInfo = periods[bellId] || { title: bell.bellDisplay }; 
        if (bellId === "R" || bellId === "L" || bellId === "RC") {
            periodInfo.title = bell.bellDisplay; 
        }

        const startMin = getMinutes(bell.time);
        const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60; 

        if (startMin < firstMin) firstMin = startMin;
        if (endMin > lastMin) lastMin = endMin;

        const isCurrent = currentMinutes >= startMin && currentMinutes < endMin;
        const isNext = !isCurrent && currentMinutes !== -1 && currentMinutes < startMin && (index === 0 || currentMinutes >= getMinutes(routine[index-1] ? bells.find(b=>b.bell===routine[index-1])?.time || "00:00" : "00:00"));

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

    const handleAskQuestion = async (e) => {
        e.preventDefault();
        if (!question.trim() || qaLoading) return;
        
        setQaLoading(true);
        setAnswer('');
        try {
            const data = await fetchTimetableQa(question, timetableData, currentMinutes);
            setAnswer(data.answer || "I couldn't generate an answer. Please try again.");
        } catch (err) {
            console.error("Q&A failed:", err);
            setAnswer("Failed to connect to the AI assistant. Please check your network and try again.");
        } finally {
            setQaLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full mt-4">
            
            {/* Timetable AI Q&A Search Box */}
            {!aiDisabled && (
                <div className="bg-white dark:bg-zinc-950 p-5 border border-zinc-200 dark:border-zinc-850 space-y-3">
                    <div className="flex items-center gap-2 select-none">
                        <div className="px-2 py-0.5 bg-black text-white dark:bg-white dark:text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles size={10} className={qaLoading ? "animate-pulse" : ""} />
                            Timetable AI
                        </div>
                        <span className="text-xs text-zinc-550 font-semibold">Ask questions about classes, rooms, teachers, or times</span>
                    </div>
                    <form onSubmit={handleAskQuestion} className="flex gap-2">
                        <input 
                            type="text" 
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            disabled={qaLoading}
                            placeholder={qaLoading ? "AI is typing..." : "e.g. What room is my next class? or Who teaches Period 2?"}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-all font-medium disabled:opacity-50"
                        />
                        <button 
                            type="submit"
                            disabled={qaLoading || !question.trim()}
                            className="px-4 py-2 bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white text-xs font-bold uppercase tracking-wider hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {qaLoading ? "Asking..." : "Ask"}
                        </button>
                    </form>
                    {answer && (
                        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 animate-in fade-in slide-in-from-top-1 duration-200">
                            <p className="text-sm font-semibold text-zinc-850 dark:text-zinc-200 leading-relaxed">
                                💡 {answer}
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center justify-between px-2">
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-550 dark:text-zinc-455">
                    Daily Schedule
                </h2>
            </div>

            <div className="bg-white dark:bg-zinc-950 p-6 md:p-8 border border-zinc-200 dark:border-zinc-850 relative">
                
                {/* Vertical Timeline Axis Container */}
                <div className="relative">
                    {/* Background Axis Line */}
                    <div className="absolute left-[39px] md:left-[55px] top-4 bottom-4 w-0.5 bg-zinc-200 dark:bg-zinc-800" />
                    
                    {/* Active Axis Line */}
                    {showNow && currentMinutes >= firstMin && (
                        <motion.div 
                            className="absolute left-[39px] md:left-[55px] top-4 w-0.5 bg-black dark:bg-white z-10 origin-top"
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: timelineProgressPos / 100 }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            style={{ bottom: '1rem' }}
                        />
                    )}

                    <div className="space-y-4">
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
                
            </div>
        </div>
    );
};

export default Timetable;
