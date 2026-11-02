import React, { useMemo, useState } from 'react';
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

// A month of Clipboard sessions on one sheet. Today carries the one highlighter swipe;
// clicking a day opens a right slide popout with that day's sessions.
const ClipboardCalendar = ({ sessions, onOpen }) => {
    const still = useReducedMotion();
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
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
    const goToday = () => choose(new Date());

    const selectedSessions = selected ? sessionsOn(sessions, selected) : [];

    return (
        <section className="nf-cal">
            <div className="nf-cal__head">
                <h2 className="nf-cal__month">
                    {format(month, 'MMMM')} <span>{format(month, 'yyyy')}</span>
                </h2>
                <div className="nf-cal__nav">
                    <button type="button" className="nf-cb-btn nf-cb-btn--bare" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
                        <ChevronLeft size={16} strokeWidth={1.75} />
                    </button>
                    <button type="button" className="nf-cb-btn" onClick={goToday}>Today</button>
                    <button type="button" className="nf-cb-btn nf-cb-btn--bare" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
                        <ChevronRight size={16} strokeWidth={1.75} />
                    </button>
                </div>
            </div>

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
