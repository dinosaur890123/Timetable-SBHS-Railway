import React from 'react';
import { MapPin, User as UserIcon, Clock, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { isBreakBell } from '../utils/timetable';

const CARD_STYLES = {
    current:  'bg-white dark:bg-zinc-900 border-2 border-accent shadow-sm',
    changed:  'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
    default:  'bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/60',
};

// Cap the stagger so long days don't take seconds to finish animating in.
const enterDelay = (index) => Math.min(index, 8) * 0.03;

const PeriodCard = ({ period, bell, isCurrent, isNext, routineIndex, currentMinutes, startMinutes, endMinutes, isHighlighted, canvasLink }) => {
    const { title, room, oldRoom, fullTeacher, oldTeacher, isSubstituted, hasRoomChange } = period;
    const { time } = bell;

    const isBreak = isBreakBell(bell.bell, period);
    const isPast  = currentMinutes !== -1 && currentMinutes >= endMinutes;
    // Applied to inner elements: framer-motion's inline opacity would override it on the motion wrapper.
    const dim = isPast ? 'opacity-50 group-hover:opacity-100' : '';

    const hasCanvasLink = canvasLink && title && title !== 'Free Period' && !title.toLowerCase().includes('roll call');

    const progress = isCurrent && startMinutes != null && endMinutes
        ? Math.min(100, Math.max(0, ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100))
        : 0;

    const subjectBubble = isCurrent
        ? 'bg-accent text-accent-contrast border border-accent'
        : isHighlighted
        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700'
        : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800';

    const cardStyle = isCurrent ? CARD_STYLES.current
        : isHighlighted ? 'bg-violet-50/20 dark:bg-violet-950/10 border-2 border-violet-400 dark:border-violet-500'
        : (isSubstituted || hasRoomChange) ? CARD_STYLES.changed
        : CARD_STYLES.default;

    // Left accent strip flags a change without tinting the whole card.
    const changeStrip = !isCurrent && (hasRoomChange ? 'bg-amber-500' : isSubstituted ? 'bg-blue-500' : null);

    // ── Break row ──────────────────────────────────────────────────────────
    if (isBreak) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: enterDelay(routineIndex) }}
                className="relative flex items-center gap-3 py-0.5"
            >
                <div className={`w-11 sm:w-[50px] text-right shrink-0 ${dim}`}>
                    <span className="text-xs font-medium tabular-nums text-zinc-400">{time}</span>
                </div>
                <div className={`flex-1 flex items-center gap-3 ${dim}`}>
                    <span className={`text-xs font-semibold ${isCurrent ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}>
                        {bell.bellDisplay}
                    </span>
                    <span className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                    {isCurrent && (
                        <span className="text-xs font-semibold text-accent tabular-nums">
                            {Math.max(0, Math.ceil(endMinutes - currentMinutes))}m left
                        </span>
                    )}
                </div>
            </motion.div>
        );
    }

    const teacherChip = fullTeacher && (
        <span className={`inline-flex items-center gap-1 min-w-0 ${isSubstituted ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}`}>
            <UserIcon size={12} className="shrink-0" />
            <span className="truncate">{fullTeacher}</span>
            {isSubstituted && oldTeacher && (
                <span className="font-normal text-zinc-400 dark:text-zinc-500 truncate">for {oldTeacher}</span>
            )}
        </span>
    );

    const roomChip = room && (
        <span className={`inline-flex items-center gap-1 shrink-0 ${hasRoomChange ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-zinc-800 dark:text-zinc-200 font-semibold'}`}>
            <MapPin size={12} className="shrink-0" />
            <span>{room}</span>
            {hasRoomChange && oldRoom && oldRoom !== room && (
                <span className="font-normal text-zinc-400 dark:text-zinc-500">
                    was <span className="line-through">{oldRoom}</span>
                </span>
            )}
        </span>
    );

    // ── Period row ─────────────────────────────────────────────────────────
    const cardContent = (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: enterDelay(routineIndex) }}
            className="relative flex items-center gap-3 group"
        >
            {/* Time column */}
            <div className={`w-11 sm:w-[50px] text-right shrink-0 transition-opacity ${dim}`}>
                <span className={`text-sm font-semibold tabular-nums ${isCurrent ? 'text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>{time}</span>
            </div>

            {/* Card */}
            <div className={`flex-1 min-w-0 relative py-2.5 px-3 border rounded-xl transition-[background-color,opacity] overflow-hidden ${cardStyle} ${dim}`}>
                {changeStrip && <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-1 ${changeStrip}`} />}

                {/* Progress fill (current period only) */}
                {isCurrent && (
                    <div
                        className="absolute top-0 left-0 bottom-0 bg-zinc-100 dark:bg-white/[0.04] pointer-events-none transition-[width] duration-1000 ease-linear"
                        style={{ width: `${progress}%` }}
                    />
                )}

                <div className="relative z-10 flex items-center gap-3">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold shrink-0 ${subjectBubble}`}>
                        {bell.bell}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-x-4 gap-y-1">
                        {/* Title + status */}
                        <div className="flex items-center gap-2 min-w-0">
                            <h3 className={`text-sm font-semibold truncate ${isCurrent ? 'text-zinc-900 dark:text-white' : 'text-zinc-800 dark:text-zinc-100'}`}>
                                {title || 'Free Period'}
                            </h3>
                            {isCurrent && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent shrink-0 tabular-nums">
                                    <Clock size={12} /> {Math.max(0, Math.ceil(endMinutes - currentMinutes))}m left
                                </span>
                            )}
                            {isNext && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 shrink-0">
                                    Up next
                                </span>
                            )}
                            {hasCanvasLink && (
                                <ExternalLink size={12} className="hidden sm:block shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </div>

                        {/* Teacher + room: below the title on phones, right-aligned on wider screens */}
                        <div className="flex items-center gap-3 text-xs min-w-0 sm:justify-end">
                            {teacherChip}
                            {roomChip}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    if (hasCanvasLink) {
        return (
            <a
                href={canvasLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={`${title} — open in Canvas`}
            >
                {cardContent}
            </a>
        );
    }

    return cardContent;
};

export default PeriodCard;
