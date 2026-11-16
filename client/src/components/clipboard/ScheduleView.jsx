import React, { useMemo } from 'react';
import { format, isToday } from 'date-fns';
import { Hl, useNoteFlowFonts } from '../study/noteflow';
import { useReducedMotion } from 'framer-motion';
import { startOf, clockTime, sessionName } from './sessions';

// A mobile-friendly schedule view with events grouped by day
// Shows full day names and dates, with events as time + dot + name rows
const ScheduleView = ({ sessions, onOpen }) => {
    useNoteFlowFonts();
    const still = useReducedMotion();

    // Group sessions by day using their actual start date
    const dayGroups = useMemo(() => {
        const map = {};
        [...sessions].sort((a, b) => startOf(a) - startOf(b)).forEach((s) => {
            const startDate = startOf(s);
            if (startDate) {
                const key = format(startDate, 'yyyy-MM-dd');
                if (!map[key]) {
                    map[key] = { date: startDate, sessions: [] };
                }
                map[key].sessions.push(s);
            }
        });
        return Object.values(map).sort((a, b) => a.date - b.date);
    }, [sessions]);

    if (dayGroups.length === 0) {
        return (
            <div className="nf nf-schedule">
                <p className="nf-schedule-empty">Nothing scheduled this week.</p>
            </div>
        );
    }

    return (
        <div className="nf nf-schedule">
            {dayGroups.map(({ date, sessions: daySessions }) => (
                <div key={format(date, 'yyyy-MM-dd')} className="nf-schedule-day">
                    <div className="nf-schedule-dayhead">
                        <span className="nf-schedule-dayname">{format(date, 'EEEE')}</span>
                        <span className={`nf-schedule-date tnum ${isToday(date) ? 'is-today' : ''}`}>
                            {isToday(date) ? <Hl still={still}>{format(date, 'MMMM d, yyyy')}</Hl> : format(date, 'MMMM d, yyyy')}
                        </span>
                    </div>
                    <div className="nf-schedule-events">
                        {daySessions.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                data-no-press
                                className={`nf-schedule-event rounded-none ${s.cancelled ? 'is-cancelled' : ''}`}
                                onClick={() => onOpen(s)}
                                aria-label={`${sessionName(s)}${s.cancelled ? ', cancelled' : ''}. Show details`}
                            >
                                <span className="nf-schedule-time tnum">{clockTime(startOf(s))}</span>
                                <span
                                    className="nf-schedule-dot"
                                    aria-hidden="true"
                                    style={s.colour ? { background: s.colour } : undefined}
                                />
                                <span className="nf-schedule-name">{sessionName(s)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ScheduleView;
