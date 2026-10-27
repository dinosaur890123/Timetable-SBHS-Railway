import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

// Cap the stagger so long days don't take seconds to finish animating in.
const enterDelay = (index) => Math.min(index, 8) * 0.03;

// Changes are marked by shape (a quiet tag and a struck-through old value) rather than
// colour, so they read the same whichever accent colour theme is active.
const ChangeTag = ({ children, className = '' }) => (
    <span className={`shrink-0 px-1.5 py-px rounded-md border border-zinc-900/10 dark:border-white/10 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 ${className}`}>
        {children}
    </span>
);

const PeriodCard = ({ period, bell, label, isCurrent, isNext, routineIndex, currentMinutes, startMinutes, endMinutes, isBreak, canvasLink }) => {
    const { title, room, oldRoom, fullTeacher, oldTeacher, isSubstituted, hasRoomChange } = period;
    const isPast = currentMinutes !== -1 && currentMinutes >= endMinutes;
    // Applied inside the motion element: framer-motion's inline opacity would override it there.
    const dim = isPast ? 'opacity-50 group-hover:opacity-100 transition-opacity' : '';

    if (isBreak) {
        return (
            <motion.li
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: enterDelay(routineIndex) }}
                className="px-3 py-1.5"
            >
                <div className={`flex items-center gap-4 ${dim}`}>
                <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">{bell.time}</span>
                <span className={`text-[12px] ${isCurrent ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'}`}>{label}</span>
                <span className="flex-1 h-px bg-zinc-900/[0.06] dark:bg-white/[0.06]" />
                <span className={`text-[12px] tabular-nums ${isCurrent ? 'font-medium text-accent' : 'text-zinc-400 dark:text-zinc-600'}`}>
                    {isCurrent ? 'Now' : `${endMinutes - startMinutes} min`}
                </span>
                </div>
            </motion.li>
        );
    }

    const hasCanvasLink = canvasLink && title && title !== 'Free Period';
    const movedFrom = hasRoomChange && oldRoom && oldRoom !== room ? oldRoom : null;

    const content = (
        <div className={`relative flex items-center gap-4 px-3 py-3 ${dim}`}>
            {isCurrent && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-accent" />}

            <div className="w-11 shrink-0 text-right leading-tight">
                <div className={`text-[13px] tabular-nums ${isCurrent ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>{bell.time}</div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">P{bell.bell}</div>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                    <h3 className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{title || 'Free Period'}</h3>
                    {hasCanvasLink && (
                        <ArrowUpRight size={14} className="shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                    {isSubstituted && <ChangeTag className="hidden sm:inline">Cover</ChangeTag>}
                    {movedFrom && <ChangeTag className="hidden sm:inline">Room change</ChangeTag>}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {isCurrent ? (
                        <span className="shrink-0 font-medium text-accent">Now</span>
                    ) : isNext ? (
                        <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-200">Up next</span>
                    ) : null}
                    {(isCurrent || isNext) && fullTeacher && <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>}
                    {fullTeacher && (
                        <span className={`truncate hidden sm:inline ${isSubstituted ? 'px-1.5 py-0.5 rounded-md bg-accent/20' : ''}`}>
                            {fullTeacher === 'No teacher' ? 'No teacher assigned' : fullTeacher}
                            {isSubstituted && oldTeacher && <span className="text-zinc-400 dark:text-zinc-500"> for {oldTeacher}</span>}
                        </span>
                    )}
                </div>
            </div>

            {room && (
                <div className="shrink-0 text-right leading-tight">
                    <div className="flex items-center gap-1.5 justify-end">
                        {fullTeacher && (
                            <span className={`truncate text-[12px] text-zinc-500 dark:text-zinc-400 sm:hidden max-w-[60px] ${isSubstituted ? 'px-1 py-0.5 rounded-md bg-accent/20' : ''}`}>
                                {fullTeacher === 'No teacher' ? 'No teacher' : fullTeacher}
                            </span>
                        )}
                        <div className={`text-[15px] font-medium tabular-nums ${hasRoomChange ? 'px-1.5 py-0.5 rounded-md bg-accent/20' : 'text-zinc-900 dark:text-zinc-50'}`}>{room}</div>
                    </div>
                    {movedFrom && <div className="text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500 line-through">{movedFrom}</div>}
                </div>
            )}
        </div>
    );

    return (
        <motion.li
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: enterDelay(routineIndex) }}
            className={`group rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06] transition-colors ${isCurrent
                ? 'bg-zinc-900/[0.035] dark:bg-white/[0.045]'
                : 'hover:bg-zinc-900/[0.025] dark:hover:bg-white/[0.025]'}`}
        >
            {hasCanvasLink ? (
                <a
                    href={canvasLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`${title}, open in Canvas`}
                >
                    {content}
                </a>
            ) : content}
        </motion.li>
    );
};

export default PeriodCard;
