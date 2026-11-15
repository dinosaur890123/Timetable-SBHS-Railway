import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { subjectInk } from '../utils/timetable';
import { isLinklessTitle } from '../utils/canvasLinks';
import { TeacherTreat } from './TeacherTreat';

// Cap the stagger so long days don't take seconds to finish animating in.
const enterDelay = (index) => Math.min(index, 8) * 0.03;

// Changes are marked by shape (a quiet tag and a struck-through old value) rather than
// colour, so they read the same whichever accent colour theme is active.
const ChangeTag = ({ children, className = '' }) => (
    <span className={`shrink-0 px-1.5 py-px rounded-md border border-zinc-900/10 dark:border-white/10 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 ${className}`}>
        {children}
    </span>
);

const PeriodCard = ({ period, bell, label, isCurrent, justStarted, isNext, routineIndex, currentMinutes, startMinutes, endMinutes, isBreak, canvasLink, linksEnabled = true }) => {
    const { title, fullTitle, colour, room, oldRoom, fullTeacher, oldTeacher, isSubstituted, hasRoomChange } = period;
    const name = fullTitle || title;
    const isPast = currentMinutes !== -1 && currentMinutes >= endMinutes;
    // Applied inside the motion element: framer-motion's inline opacity would override it there.
    // A finished class fades back slowly, so the change of period reads as a handover.
    const dim = isPast ? 'opacity-50 group-hover:opacity-100 transition-opacity duration-700' : 'transition-opacity duration-700';
    const [showTooltip, setShowTooltip] = React.useState(false);
    const tooltipTimeoutRef = React.useRef(null);

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

    const hasCanvasLink = linksEnabled && canvasLink && title && title !== 'Free Period';
    const movedFrom = hasRoomChange && oldRoom && oldRoom !== room ? oldRoom : null;
    const shouldShowCanvasTooltip = linksEnabled && !hasCanvasLink && title && title !== 'Free Period' && !isLinklessTitle(title);

    React.useEffect(() => {
        return () => {
            if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current);
            }
        };
    }, []);

    const handleClick = () => {
        if (shouldShowCanvasTooltip) {
            setShowTooltip(true);
            if (tooltipTimeoutRef.current) {
                clearTimeout(tooltipTimeoutRef.current);
            }
            tooltipTimeoutRef.current = setTimeout(() => {
                setShowTooltip(false);
            }, 2500);
        }
    };

    const content = (
        <div className={`relative flex items-center gap-4 px-3 py-3 ${dim}`}>
            {/* The subject's colour from the timetable; the accent stands in for an uncoloured current class. */}
            {colour ? (
                <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-[4px] rounded-full subject-fill ${justStarted ? 'period-stripe' : ''}`} {...subjectInk(colour)} />
            ) : isCurrent && (
                <span aria-hidden className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-accent" />
            )}

            <div className="w-11 shrink-0 text-right leading-tight">
                <div className={`text-[13px] tabular-nums ${isCurrent ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>{bell.time}</div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">P{bell.bell}</div>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                    <h3 className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50" title={name || undefined}>
                        <span className="lg:hidden">{title || 'Free Period'}</span>
                        <span className="hidden lg:inline">{name || 'Free Period'}</span>
                    </h3>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {isCurrent ? (
                        <motion.span
                            className="shrink-0 font-medium text-accent"
                            initial={justStarted ? { opacity: 0, x: -6 } : false}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                        >
                            Now
                        </motion.span>
                    ) : isNext ? (
                        <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-200">Up next</span>
                    ) : null}
                    {(isCurrent || isNext) && fullTeacher && <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>}
                    {fullTeacher && (
                        <span className={`truncate hidden sm:inline ${isSubstituted ? 'px-1.5 py-0.5 rounded-md change-highlight' : ''}`}>
                            {fullTeacher === 'No teacher' ? null : fullTeacher}
                        </span>
                    )}
                    <TeacherTreat name={fullTeacher} />
                </div>
            </div>

            {hasCanvasLink && (
                <span className="inline-flex shrink-0 items-center gap-1 text-accent/80 group-hover:text-accent opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <img src="/canvas-lms.svg" alt="Canvas" className="h-3.5 w-auto shrink-0" />
                    <ArrowUpRight size={13} className="shrink-0" />
                </span>
            )}

            {room && (
                <div className="shrink-0 text-right leading-tight">
                    <div className="flex items-center gap-1.5 justify-end">
                        {fullTeacher && (
                            <span className={`text-[12px] text-zinc-500 dark:text-zinc-400 sm:hidden ${isSubstituted ? 'px-1 py-0.5 rounded-md change-highlight' : ''}`}>
                                {fullTeacher === 'No teacher' ? null : fullTeacher}
                            </span>
                        )}
                        <TeacherTreat name={fullTeacher} />
                        <div className={`text-[15px] font-medium tabular-nums ${hasRoomChange ? 'px-1.5 py-0.5 rounded-md change-highlight' : 'text-zinc-900 dark:text-zinc-50'}`}>{room}</div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <motion.li
            {...(colour ? subjectInk(colour) : {})}
            initial={{ opacity: 0, y: 4 }}
            // When its bell rings, the class lifts a touch and pulses in its subject colour once.
            animate={justStarted ? { opacity: 1, y: 0, scale: [1, 1.025, 1] } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: enterDelay(routineIndex), scale: { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] } }}
            className={`group rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06] transition-colors duration-500 ${justStarted ? 'period-start' : ''} ${isCurrent
                ? 'bg-zinc-900/[0.035] dark:bg-white/[0.045] hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.07]'
                : 'hover:bg-zinc-900/[0.025] dark:hover:bg-white/[0.025]'}`}
        >
            {hasCanvasLink ? (
                <a
                    href={canvasLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`${name}, open in Canvas`}
                >
                    {content}
                </a>
            ) : (
                <button
                    onClick={handleClick}
                    className="w-full text-left bg-transparent border-0 p-0 cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    disabled={!shouldShowCanvasTooltip}
                >
                    {content}
                </button>
            )}
            <AnimatePresence>
                {showTooltip && shouldShowCanvasTooltip && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-1.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-medium rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none"
                    >
                        Set up Canvas links in settings
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.li>
    );
};

export default PeriodCard;
