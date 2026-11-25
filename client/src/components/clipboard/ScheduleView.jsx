import React, { useMemo, useState, useRef } from 'react';
import { format, isToday } from 'date-fns';
import { startOf, clockTime, sessionInk, sessionName, endOf } from './sessions';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const ScheduleView = ({ sessions, onOpen }) => {
    const [hoveredSession, setHoveredSession] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const isDesktop = useMediaQuery('(min-width: 768px)');
    const hasHover = useMediaQuery('(hover: hover)');

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

    const handleMouseEnter = (e, session) => {
        if (!isDesktop || !hasHover) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const tooltipWidth = 240;
        const tooltipHeight = 80;

        let x = rect.left + (rect.width - tooltipWidth) / 2;
        let y = rect.top - tooltipHeight - 8;

        x = Math.max(8, Math.min(x, window.innerWidth - tooltipWidth - 8));
        y = Math.max(8, Math.min(y, window.innerHeight - tooltipHeight - 8));

        setTooltipPosition({ x, y });
        setHoveredSession(session);
    };

    const handleMouseLeave = () => {
        setHoveredSession(null);
    };

    if (dayGroups.length === 0) {
        return (
            <div className="nf nf-schedule">
                <p className="nf-schedule-empty">Nothing scheduled this week.</p>
            </div>
        );
    }

    return (
        <div className="nf nf-schedule" ref={containerRef}>
            {dayGroups.map(({ date, sessions: daySessions }) => (
                <div key={format(date, 'yyyy-MM-dd')} className="nf-schedule-day">
                    <div className="nf-schedule-dayhead">
                        <span className="nf-schedule-dayname">{format(date, 'EEEE')}</span>
                        <span className={`nf-schedule-date tnum ${isToday(date) ? 'is-today' : ''}`}>
                            {isToday(date) ? <span className="theme-highlight">{format(date, 'MMMM d, yyyy')}</span> : format(date, 'MMMM d, yyyy')}
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
                                onMouseEnter={(e) => handleMouseEnter(e, s)}
                                onMouseLeave={handleMouseLeave}
                                aria-label={`${sessionName(s)}${s.cancelled ? ', cancelled' : ''}. Show details`}
                            >
                                <span className="nf-schedule-time tnum">{clockTime(startOf(s))}</span>
                                <span
                                    className="nf-schedule-dot"
                                    aria-hidden="true"
                                    style={sessionInk(s)}
                                />
                                <span className="nf-schedule-name">{sessionName(s)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            {hoveredSession && isDesktop && hasHover && (
                <div
                    className="nf-schedule-tooltip"
                    style={{
                        position: 'fixed',
                        left: tooltipPosition.x,
                        top: tooltipPosition.y,
                        zIndex: 100
                    }}
                >
                    <div className="nf-schedule-tooltip-inner">
                        <b>{sessionName(hoveredSession)}</b>
                        <div className="nf-meta tnum">
                            {clockTime(startOf(hoveredSession))}{endOf(hoveredSession) ? ` – ${clockTime(endOf(hoveredSession))}` : ''}
                        </div>
                        {hoveredSession.location?.name && (
                            <div className="nf-meta">{hoveredSession.location.name}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScheduleView;
