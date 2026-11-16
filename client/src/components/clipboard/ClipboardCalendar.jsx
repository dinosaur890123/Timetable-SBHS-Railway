import React, { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, isWeekend,
    startOfMonth, startOfWeek
} from 'date-fns';
import { Hl } from '../study/noteflow';
import { clockTime, dayKeyOf, sessionName, sessionsOn, startOf, DayAgendaSheet } from './sessions';

const WEEK = { weekStartsOn: 1 };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CHIPS = 2;

const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setMatches(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);
    return matches;
};

// A month of Clipboard sessions on one sheet. Wide screens get the month grid; narrow
// ones get one week as a ruled agenda where tapping a session opens it straight away.
// Today carries the one highlighter swipe; clicking a day opens a right slide popout.
const ClipboardCalendar = ({ sessions, onOpen }) => {
    const still = useReducedMotion();
    const isMonthView = useMediaQuery('(min-width: 768px)');
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [week, setWeek] = useState(() => startOfWeek(new Date(), WEEK));
    const [selected, setSelected] = useState(null);

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

    const choose = (day) => {
        setSelected(day);
        if (!isSameMonth(day, month)) setMonth(startOfMonth(day));
    };
    // Today just returns to the current period — it never opens the day card.
    const goToday = () => {
        const now = new Date();
        setMonth(startOfMonth(now));
        setWeek(startOfWeek(now, WEEK));
        setSelected(null);
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
    const weekRows = weekDays
        .map((day) => ({ day, sessions: byDay[format(day, 'yyyy-MM-dd')] || [] }))
        .filter((row) => row.sessions.length > 0);

    const selectedSessions = selected ? sessionsOn(sessions, selected) : [];

    return (
        <section className="nf-cal">
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
                                    isToday(day) && 'is-today',
                                    selected && isSameDay(day, selected) && 'is-on'
                                ].filter(Boolean).join(' ');
                                return (
                                    <button
                                        key={day.toISOString()}
                                        type="button"
                                        role="gridcell"
                                        data-no-press
                                        className={`${classes} rounded-none`}
                                        aria-selected={selected ? isSameDay(day, selected) : false}
                                        aria-label={`${format(day, 'EEEE d MMMM')}${daySessions.length ? `, ${daySessions.length} on Clipboard` : ''}`}
                                        onClick={() => choose(day)}
                                    >
                                        <span className="nf-cal__num tnum">
                                            {isToday(day) ? <Hl still={still}>{format(day, 'd')}</Hl> : format(day, 'd')}
                                        </span>
                                        {daySessions.length > 0 && (
                                            <>
                                                <span className="nf-cal__dots" aria-hidden="true">
                                                    {daySessions.slice(0, 3).map((s) => (
                                                        <span key={s.id} className={s.cancelled ? 'is-cancelled' : undefined}><span className="nf-cb-dot" /></span>
                                                    ))}
                                                </span>
                                                <span className="nf-cal__chips" aria-hidden="true">
                                                    {daySessions.slice(0, CHIPS).map((s) => (
                                                        <span key={s.id} className={`nf-cal__chip ${s.cancelled ? 'is-cancelled' : ''}`}>
                                                            <span className="nf-cb-dot" />
                                                            <span><span className="tnum">{format(startOf(s), 'HH:mm')}</span> {s.activity}</span>
                                                        </span>
                                                    ))}
                                                    {daySessions.length > CHIPS && (
                                                        <span className="nf-cal__more">{daySessions.length - CHIPS} more</span>
                                                    )}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
            ) : (
            <div className="nf-sheet nf-cal__weeklist">
                {weekRows.length > 0 ? weekRows.map(({ day, sessions: daySessions }) => (
                    <div key={day.toISOString()} className="nf-cal__daygroup">
                        <div className="nf-cal__dayhead">
                            <span className="nf-cal__downame">{format(day, 'EEE')}</span>
                            <span className={`nf-cal__datenum tnum ${isToday(day) ? 'is-today' : ''}`}>
                                {isToday(day) ? <Hl still={still}>{format(day, 'd MMM')}</Hl> : format(day, 'd MMM')}
                            </span>
                        </div>
                        {daySessions.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                data-no-press
                                className={`nf-cb-session rounded-none ${s.cancelled ? 'is-cancelled' : ''}`}
                                onClick={() => onOpen(s)}
                                aria-label={`${sessionName(s)}${s.cancelled ? ', cancelled' : ''}. Show details`}
                            >
                                <span className="nf-cb-session__time tnum">{clockTime(startOf(s))}</span>
                                <span className="nf-cb-dot" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="nf-cb-session__name">{sessionName(s)}</span>
                                    {s.title && <span className="nf-meta"> {s.activity}</span>}
                                </span>
                                <span className="nf-cb-session__where">{s.cancelled ? 'Cancelled' : s.location?.name || ''}</span>
                            </button>
                        ))}
                    </div>
                )) : (
                    <p className="nf-cb-empty">Nothing on Clipboard this week.</p>
                )}
            </div>
            )}

            <DayAgendaSheet
                date={selected}
                sessions={selectedSessions}
                onClose={() => setSelected(null)}
                onOpenSession={onOpen}
            />
        </section>
    );
};

export default ClipboardCalendar;
