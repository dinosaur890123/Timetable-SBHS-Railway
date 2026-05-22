import React, { useState, useEffect } from 'react';
import { Clock, BookOpen, Bell, ArrowRight, CheckCircle, Calendar as CalendarIcon, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const Home = ({ user, timetableData, notices }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Get time-based greeting
    const hour = currentTime.getHours();
    let greeting = 'Good Evening';
    if (hour < 12) greeting = 'Good Morning';
    else if (hour < 18) greeting = 'Good Afternoon';

    // Parse Timetable Data
    let innerTimetable = null;
    let bells = [];
    let periods = {};
    let routine = [];

    if (timetableData && timetableData.bells) {
        bells = timetableData.bells;
        innerTimetable = timetableData.timetable?.timetable || timetableData.timetable;
        if (innerTimetable && innerTimetable.periods) {
            periods = innerTimetable.periods;
            routine = innerTimetable.routine ? innerTimetable.routine.split(',') : [];
        }
    }

    const getMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    let currentClass = null;
    let nextClass = null;
    let progress = 0;

    if (routine.length > 0) {
        for (let i = 0; i < routine.length; i++) {
            const bellId = routine[i];
            const bell = bells.find(b => b.bell === bellId);
            if (!bell) continue;

            const startMin = getMinutes(bell.time);
            const endMin = bell.endTime ? getMinutes(bell.endTime) : startMin + 60; // Approximate if no end time

            const periodInfo = periods[bellId] || { title: bell.bellDisplay };
            if (bellId === "R" || bellId === "L" || bellId === "RC") {
                periodInfo.title = bell.bellDisplay;
                periodInfo.isBreak = true;
            }

            if (currentMinutes >= startMin && currentMinutes < endMin) {
                currentClass = { ...periodInfo, ...bell, startMin, endMin };
                progress = ((currentMinutes - startMin) / (endMin - startMin)) * 100;
                
                // Find next valid class
                for (let j = i + 1; j < routine.length; j++) {
                    const nextBellId = routine[j];
                    const nextBell = bells.find(b => b.bell === nextBellId);
                    if (nextBell) {
                        const nextPeriodInfo = periods[nextBellId] || { title: nextBell.bellDisplay };
                        if (nextBellId === "R" || nextBellId === "L" || nextBellId === "RC") {
                             nextPeriodInfo.title = nextBell.bellDisplay;
                             nextPeriodInfo.isBreak = true;
                        }
                        nextClass = { ...nextPeriodInfo, ...nextBell };
                        break;
                    }
                }
                break;
            } else if (currentMinutes < startMin && !currentClass && !nextClass) {
                 // We haven't reached the first class of the day, or we are between classes
                 nextClass = { ...periodInfo, ...bell, isBreak: (bellId === "R" || bellId === "L" || bellId === "RC") };
                 break;
            }
        }
    }

    const todayNotices = notices?.notices ? notices.notices.slice(0, 3) : [];

    const getSubjectGradient = (title) => {
        return 'bg-zinc-100 dark:bg-zinc-900 text-black dark:text-white border-zinc-300 dark:border-zinc-750';
    };


    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            {/* Greeting Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white mb-2">
                        {greeting}, <span className="text-black dark:text-white underline decoration-zinc-400 underline-offset-4">{user?.givenName || 'Student'}</span>
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 font-semibold text-lg flex items-center gap-2">
                        <CalendarIcon size={20} />
                        {format(currentTime, 'EEEE, d MMMM yyyy')}
                        {innerTimetable?.dayname && (
                            <span className="ml-2 px-2.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-sm font-bold uppercase tracking-wider border border-zinc-300 dark:border-zinc-700">
                                {innerTimetable.dayname}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Status Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Current Class Card */}
                    <div className="bg-white dark:bg-zinc-950 p-6 md:p-8 border border-zinc-200 dark:border-zinc-850 relative overflow-hidden group">
                        
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-500">
                            <Clock size={120} />
                        </div>

                        <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-6 flex items-center gap-2">
                            <div className="w-2 h-2 bg-black dark:bg-white animate-pulse" />
                            Right Now
                        </h2>

                        {currentClass ? (
                            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 relative z-10">
                                {/* Circular Progress Indicator */}
                                <div className="relative shrink-0">
                                    <svg className="w-32 h-32 transform -rotate-90">
                                        <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-zinc-100 dark:text-zinc-900" />
                                        <motion.circle 
                                            initial={{ strokeDasharray: '0 351.86' }}
                                            animate={{ strokeDasharray: `${(progress / 100) * 351.86} 351.86` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" 
                                            className="text-black dark:text-white" 
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-2xl font-bold text-zinc-900 dark:text-white">{Math.max(0, currentClass.endMin - currentMinutes)}</span>
                                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">min left</span>
                                    </div>
                                </div>

                                <div className="flex-1 text-center md:text-left">
                                    <div className="inline-block px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-bold uppercase tracking-widest mb-3">
                                        Period {currentClass.bell}
                                    </div>
                                    <h3 className="text-3xl md:text-4xl font-extrabold text-zinc-900 dark:text-white mb-2">
                                        {currentClass.title || "Free Period"}
                                    </h3>
                                    
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                                        <span className="flex items-center gap-1.5"><Clock size={16} /> {currentClass.time} - {currentClass.endTime || '??'}</span>
                                        {currentClass.room && <span className="flex items-center gap-1.5 px-2 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"><MapPin size={16} /> {currentClass.room}</span>}
                                        {currentClass.fullTeacher && <span className="flex items-center gap-1.5"><UserIcon size={16} /> {currentClass.fullTeacher}</span>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 z-10 relative">
                                <CheckCircle size={48} className="mx-auto text-black dark:text-white mb-4 opacity-70" />
                                <h3 className="text-2xl font-extrabold text-zinc-900 dark:text-white mb-2">No Classes Right Now</h3>
                                <p className="text-zinc-500">Take a break or catch up on study.</p>
                            </div>
                        )}
                    </div>

                    {/* Next Class & Quick Links row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Next Class Widget */}
                        <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850">
                             <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-550 dark:text-zinc-400 mb-4 flex items-center gap-2">
                                <ArrowRight size={14} />
                                Up Next
                            </h2>
                            {nextClass ? (
                                <div className="flex items-center gap-4">
                                     <div className={`w-14 h-14 flex items-center justify-center font-bold text-xl border ${getSubjectGradient(nextClass.title)}`}>
                                        {nextClass.bell}
                                     </div>
                                     <div>
                                         <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white leading-tight">{nextClass.title}</h3>
                                         <p className="text-sm text-zinc-500 flex items-center gap-2 mt-1">
                                             <Clock size={14} /> {nextClass.time}
                                             {nextClass.room && <span className="opacity-50">|</span>}
                                             {nextClass.room && <span>{nextClass.room}</span>}
                                         </p>
                                     </div>
                                </div>
                            ) : (
                                <div className="py-4 text-zinc-500 text-sm">No more classes today.</div>
                            )}
                        </div>

                        {/* Quick Stats or Features Widget */}
                        <div className="bg-black text-white dark:bg-zinc-950 p-6 border border-black dark:border-zinc-850 relative overflow-hidden">
                             <div className="absolute top-0 right-0 p-4 opacity-10">
                                 <Zap size={80} />
                             </div>
                             <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2">
                                Daily Summary
                            </h2>
                            <div className="flex gap-6 mt-2 relative z-10">
                                <div>
                                    <div className="text-3xl font-extrabold">{routine.length}</div>
                                    <div className="text-sm font-semibold text-zinc-400">Periods</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-extrabold">{todayNotices.length}</div>
                                    <div className="text-sm font-semibold text-zinc-400">Notices</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    {/* Notices Snapshot */}
                    <div className="bg-white dark:bg-zinc-950 p-6 border border-zinc-200 dark:border-zinc-850 h-full">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-sm font-extrabold uppercase tracking-widest text-zinc-900 dark:text-white flex items-center gap-2">
                                <Bell size={16} className="text-black dark:text-white" />
                                Latest Notices
                            </h2>
                            <button className="text-xs font-bold text-zinc-900 dark:text-white underline decoration-zinc-400 hover:text-black dark:hover:text-white">View All</button>
                        </div>
                        
                        <div className="space-y-4">
                            {todayNotices.length > 0 ? todayNotices.map((notice, idx) => (
                                <div key={idx} className="group cursor-pointer">
                                    <h3 className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-650 dark:group-hover:text-white transition-colors line-clamp-1">{notice.title}</h3>
                                    <p className="text-xs text-zinc-550 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: notice.content }}></p>
                                </div>
                            )) : (
                                <div className="text-center py-8 text-zinc-505 text-sm">
                                    <Bell size={24} className="mx-auto mb-2 opacity-20" />
                                    No notices for today.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Dummy icons since we didn't import them at top to save space
const MapPin = ({size}) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>;
const UserIcon = ({size}) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;


export default Home;