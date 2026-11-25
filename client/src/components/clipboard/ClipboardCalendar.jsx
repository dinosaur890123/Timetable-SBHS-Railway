import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, isWeekend,
    startOfMonth, startOfWeek
} from 'date-fns';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { clockTime, dayKeyOf, endOf, sessionInk, sessionName, startOf } from './sessions';
import { formatTime12Hour } from '../../utils/timetable';
import ScheduleView from './ScheduleView';

const WEEK = { weekStartsOn: 1 };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_MIN_WIDTH = 768;

const ClipboardCalendar = ({ sessions, onOpen }) => {
    const sectionRef = useRef(null);
    const isWideViewport = useMediaQuery('(min-width: 768px)');
    const [sheetWide, setSheetWide] = useState(true);
    useEffect(() => {
        const el = sectionRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) => setSheetWide(entry.contentRect.width >= MONTH_MIN_WIDTH));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    const isMonthView = isWideViewport && sheetWide;
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [week, setWeek] = useState(() => startOfWeek(new Date(), WEEK));
    const [hoveredSession, setHoveredSession] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const hasFineHover = useMediaQuery('(hover: hover) and (pointer: fine)');

    const handleEventMouseEnter = (event, session) => {
        if (!isWideViewport || !hasFineHover) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const tooltipWidth = 240;
        const tooltipHeight = 80;
        const x = Math.max(8, Math.min(rect.left + (rect.width - tooltipWidth) / 2, window.innerWidth - tooltipWidth - 8));
        const y = Math.max(8, Math.min(rect.top - tooltipHeight - 6, window.innerHeight - tooltipHeight - 8));
        setTooltipPosition({ x, y });
        setHoveredSession(session);
    };

    const byDay = useMemo(() => {
        const map = {};
        [...sessions].sort((a, b) => startOf(a) - startOf(b)).forEach((s) => {
            const key = dayKeyOf(s);
            if (key) (map[key] ||= []).push(s);
        });
        return map;
    }, [sessions]);

    const weeks = useMemo(() => {
        const rows = [];
        let day = startOfWeek(startOfMonth(month), WEEK);
        const last = endOfWeek(endOfMonth(month), WEEK);
        while (day <= last) {
            rows.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
            day = addDays(day, 7);
        }
        return rows;
    }, [month]);

    const goToday = () => {
        const now = new Date();
        setMonth(startOfMonth(now));
        setWeek(startOfWeek(now, WEEK));
    };
    const step = (dir) => {
        if (isMonthView) {
            setMonth((m) => addMonths(m, dir));
        } else {
            const next = addDays(week, dir * 7);
            setWeek(next);
            setMonth(startOfMonth(next));
        }
    };

    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
    const weekSessions = useMemo(() => {
        return weekDays.flatMap(day => {
            const key = format(day, 'yyyy-MM-dd');
            return byDay[key] || [];
        });
    }, [weekDays, byDay]);

    return (
        <section className="nf-cal" ref={sectionRef}>
            <div className="nf-cal__head">
                <h2 className="nf-cal__month">
                    {isMonthView ? (
                        <>{format(month, 'MMMM')} <span>{format(month, 'yyyy')}</span></>
                    ) : (
                        <>{format(week, 'd MMM')} – {format(addDays(week, 6), 'd MMM yyyy')}</>
                    )}
                </h2>
                <div className="nf-cal__nav">
                    <button type="button" className="nf-cb-btn nf-cb-btn--bare" onClick={() => step(-1)} aria-label={isMonthView ? 'Previous month' : 'Previous week'}>
                        <ChevronLeft size={16} strokeWidth={1.75} />
                    </button>
                    <button type="button" className="nf-cb-btn" onClick={goToday}>Today</button>
                    <button type="button" className="nf-cb-btn nf-cb-btn--bare" onClick={() => step(1)} aria-label={isMonthView ? 'Next month' : 'Next week'}>
                        <ChevronRight size={16} strokeWidth={1.75} />
                    </button>
                </div>
            </div>

            {isMonthView ? (
            <>
            <div className="nf-sheet nf-cal__sheet">
                <div className="nf-cal__week" aria-hidden="true">
                    {DOW.map((d) => <div key={d} className="nf-cal__dow">{d}</div>)}
                </div>
                <div className="nf-cal__grid" role="grid" aria-label={format(month, 'MMMM yyyy')}>
                    {weeks.map((week) => (
                        <div key={week[0].toISOString()} className="nf-cal__week" role="row">
                            {week.map((day) => {
                                const daySessions = byDay[format(day, 'yyyy-MM-dd')] || [];
                                const classes = [
                                    'nf-cal__day',
                                    !isSameMonth(day, month) && 'is-out',
                                    isWeekend(day) && 'is-weekend',
                                    isToday(day) && 'is-today'
                                ].filter(Boolean).join(' ');
                                return (
                                    <div
                                        key={day.toISOString()}
                                        role="gridcell"
                                        data-no-press
                                        className={classes}
                                        aria-label={`${format(day, 'EEEE d MMMM')}${daySessions.length ? `, ${daySessions.length} on Clipboard` : ''}`}
                                    >
                                        <span className="nf-cal__num tnum">
                                            {isToday(day) ? <span className="nf-cal__today">{format(day, 'd')}</span> : format(day, 'd')}
                                        </span>
                                        {daySessions.length > 0 && (
                                            <span className="nf-cal__chips">
                                                    {daySessions.map((s) => (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            data-no-press
                                                            className={`nf-cal__chip ${s.cancelled ? 'is-cancelled' : ''}`}
                                                            onClick={() => onOpen(s)}
                                                            onMouseEnter={(event) => handleEventMouseEnter(event, s)}
                                                            onMouseLeave={() => setHoveredSession(null)}
                                                            aria-label={`${sessionName(s)}${s.cancelled ? ', cancelled' : ''}. Show details`}
                                                        >
                                                            <span className="nf-cb-dot" style={sessionInk(s)} />
                                                            <span><span className="tnum">{formatTime12Hour(format(startOf(s), 'HH:mm'))}</span> {s.activity}</span>
                                                        </button>
                                                    ))}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            {hoveredSession && isMonthView && hasFineHover && (
                <div
                    className="nf-schedule-tooltip"
                    style={{ position: 'fixed', left: tooltipPosition.x, top: tooltipPosition.y, zIndex: 100 }}
                >
                    <div className={`nf-schedule-tooltip-inner${hoveredSession.cancelled ? ' is-cancelled' : ''}`}>
                        <b>{sessionName(hoveredSession)}</b>
                        {hoveredSession.cancelled && <div className="nf-schedule-tooltip-cancelled">Cancelled</div>}
                        <div className="nf-meta tnum">
                            {clockTime(startOf(hoveredSession))}{endOf(hoveredSession) ? ` – ${clockTime(endOf(hoveredSession))}` : ''}
                        </div>
                        {hoveredSession.location?.name && <div className="nf-meta">{hoveredSession.location.name}</div>}
                    </div>
                </div>
            )}
            </>
            ) : (
            <ScheduleView sessions={weekSessions} onOpen={onOpen} />
            )}
        </section>
    );
};

export default ClipboardCalendar;
