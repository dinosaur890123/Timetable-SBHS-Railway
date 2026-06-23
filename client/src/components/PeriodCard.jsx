import React from 'react';
import { MapPin, User as UserIcon, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const CARD_STYLES = {
    current:  'bg-white dark:bg-zinc-900 border-2 border-accent scale-[1.01] z-20',
    sub:      'bg-blue-50/20 dark:bg-blue-950/10 border-zinc-200 dark:border-zinc-800/80 border-l-4 border-l-blue-600 dark:border-l-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20',
    room:     'bg-amber-50/20 dark:bg-amber-950/10 border-zinc-200 dark:border-zinc-800/80 border-l-4 border-l-amber-500 dark:border-l-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-950/20',
    default:  'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/80',
};

const PeriodCard = ({ period, bell, isCurrent, isNext, routineIndex, currentMinutes, startMinutes, endMinutes }) => {
    const { title, room, fullTeacher, isSubstituted, hasRoomChange } = period;
    const { time, endTime } = bell;

    const isBreak = bell.bell === 'R' || bell.bell === 'L' || bell.bell === 'RC' || (title && title.toLowerCase().includes('lunch'));
    const isPast  = currentMinutes !== -1 && currentMinutes >= endMinutes;

    const progress = isCurrent && startMinutes && endMinutes
        ? Math.min(100, Math.max(0, ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100))
        : 0;

    const dotClass = isCurrent
        ? 'bg-accent border-2 border-white dark:border-zinc-900 ring-4 ring-accent/10'
        : isPast
            ? 'bg-zinc-400 dark:bg-zinc-600 border border-zinc-200 dark:border-zinc-800'
            : 'bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700';

    const dotSize = isCurrent ? 'w-4 h-4' : 'w-3 h-3';

    const subjectBubble = isCurrent
        ? 'bg-accent text-accent-contrast border border-accent'
        : 'bg-zinc-100 text-zinc-850 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800';

    const cardStyle = isCurrent ? CARD_STYLES.current
        : isSubstituted          ? CARD_STYLES.sub
        : hasRoomChange          ? CARD_STYLES.room
        : CARD_STYLES.default;

    // ── Break row ──────────────────────────────────────────────────────────
    if (isBreak) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: routineIndex * 0.05 }}
                className={`relative flex items-center gap-2 md:gap-4 py-1 ${isPast ? 'opacity-40' : ''}`}
            >
                <div className="w-[50px] md:w-[80px] text-right shrink-0">
                    <span className="text-[10px] font-semibold text-zinc-400">{time}</span>
                </div>
                <div className="hidden md:flex relative z-10 items-center justify-center shrink-0 w-5">
                    <div className={`transition-all duration-300 rounded-full ${dotSize} ${dotClass}`} />
                </div>
                <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 px-3 py-1 border border-zinc-200 dark:border-zinc-800">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                        {bell.bellDisplay}
                    </span>
                </div>
            </motion.div>
        );
    }

    // ── Period row ─────────────────────────────────────────────────────────
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: routineIndex * 0.05 }}
            className={`relative flex items-center gap-2 md:gap-4 py-0.5 group ${isPast ? 'opacity-65 hover:opacity-100 transition-opacity' : ''}`}
        >
            {/* Time column */}
            <div className="w-[50px] md:w-[80px] text-right shrink-0 flex flex-col justify-center">
                <span className={`text-xs font-bold ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-650 dark:text-zinc-300'}`}>{time}</span>
                <span className="text-[9px] font-medium text-zinc-400 mt-0.5">{endTime}</span>
            </div>

            {/* Timeline dot */}
            <div className="hidden md:flex relative z-10 items-center justify-center shrink-0 w-5">
                <div className={`transition-all duration-300 rounded-full ${dotSize} ${dotClass}`} />
            </div>

            {/* Card */}
            <div className={`flex-1 flex flex-col justify-center relative py-1.5 px-3 border transition-all duration-300 overflow-hidden ${cardStyle}`}>

                {/* Progress bar (current period only) */}
                {isCurrent && (
                    <div
                        className="absolute top-0 left-0 bottom-0 bg-zinc-100 dark:bg-zinc-800/30 pointer-events-none transition-all duration-1000 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                )}

                <div className="flex items-center justify-between relative z-10 w-full gap-3">

                    {/* Left: period bubble + title + Up Next badge */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`flex items-center justify-center w-7 h-7 text-[10px] font-bold shrink-0 ${subjectBubble} ${!isCurrent && isPast ? 'opacity-60' : ''}`}>
                            {bell.bell}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <h3 className={`text-xs font-bold truncate ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-800 dark:text-zinc-200'}`}>
                                {title || 'Free Period'}
                            </h3>
                            {isNext && (
                                <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-850 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 animate-pulse shrink-0">
                                    Up Next
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right: time remaining, teacher, room */}
                    <div className="flex items-center gap-2 shrink-0 text-[10px]">
                        {isCurrent && (
                            <span className="text-[9px] font-bold text-accent flex items-center gap-0.5 bg-zinc-100 dark:bg-black/50 px-1 py-0.5 border border-zinc-300 dark:border-zinc-700 shrink-0">
                                <Clock size={10} className="animate-pulse" /> {Math.max(0, endMinutes - currentMinutes)}m left
                            </span>
                        )}

                        {fullTeacher && (
                            <span className={`flex items-center gap-0.5 shrink-0 ${
                                isSubstituted
                                    ? 'px-1 py-0.5 bg-blue-50 text-blue-600 dark:bg-blue-950/45 dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-sm'
                                    : 'text-zinc-550 dark:text-zinc-400'
                            }`}>
                                <UserIcon size={10} className={isSubstituted ? 'text-blue-500 dark:text-blue-400' : 'text-zinc-400'} />
                                <span>{fullTeacher}</span>
                            </span>
                        )}

                        {room && (
                            <span className={`flex items-center gap-0.5 font-semibold shrink-0 ${
                                hasRoomChange
                                    ? 'px-1 py-0.5 bg-amber-50 text-amber-600 dark:bg-amber-950/45 dark:text-amber-400 border border-amber-200 dark:border-amber-900 shadow-sm'
                                    : isCurrent ? 'text-black dark:text-white' : 'text-zinc-800 dark:text-zinc-200'
                            }`}>
                                <MapPin size={10} className={hasRoomChange ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400'} />
                                <span>{room}</span>
                            </span>
                        )}
                    </div>

                </div>
            </div>
        </motion.div>
    );
};

export default PeriodCard;