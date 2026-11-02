import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Users, X, Calendar } from 'lucide-react';

const getMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const cleanTime = timeStr.split('–')[0].trim();
    const [time, period] = cleanTime.split(' ');
    const [h, m] = time.split(':').map(Number);
    let hours = h;
    if (period && (period.toLowerCase() === 'pm' || period.toLowerCase() === 'p.m.')) {
        if (hours !== 12) hours += 12;
    } else if (period && (period.toLowerCase() === 'am' || period.toLowerCase() === 'a.m.')) {
        if (hours === 12) hours = 0;
    }
    return hours * 60 + m;
};

const EventDetailPopout = ({ event, onClose }) => {
    if (!event) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.15 }}
                className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl max-w-sm w-full rounded-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{event.activity}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    {event.title && (
                        <div className="flex items-start gap-2">
                            <Calendar size={14} className="shrink-0 text-zinc-400 mt-0.5" />
                            <div className="min-w-0">
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">Title</div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{event.title}</div>
                            </div>
                        </div>
                    )}
                    <div className="flex items-start gap-2">
                        <Clock size={14} className="shrink-0 text-zinc-400 mt-0.5" />
                        <div className="min-w-0">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Time</div>
                            <div className="text-sm font-medium text-zinc-900 dark:text-white">{event.time}</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <MapPin size={14} className="shrink-0 text-zinc-400 mt-0.5" />
                        <div className="min-w-0">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Location</div>
                            <div className="text-sm font-medium text-zinc-900 dark:text-white">TBC</div>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Users size={14} className="shrink-0 text-zinc-400 mt-0.5" />
                        <div className="min-w-0">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">Team</div>
                            <div className="text-sm font-medium text-zinc-900 dark:text-white">See Clipboard</div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const ClipboardEventCard = ({ event, onClick }) => {
    return (
        <button
            onClick={onClick}
            className="w-full text-left px-2 py-1.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition-colors group"
        >
            <div className="text-[11px] font-medium text-zinc-900 dark:text-white truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                {event.activity}
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">{event.time}</div>
        </button>
    );
};

const ClipboardEventsInline = ({ sessions, dayStart, dayEnd, periodInfo }) => {
    const [selectedEvent, setSelectedEvent] = useState(null);

    if (!sessions || sessions.length === 0) return null;

    // Check if this is a sport period (SP{year})
    const isSportPeriod = periodInfo?.title?.toUpperCase().startsWith('SP');

    // If it's a sport period, show all clipboard events here
    // Otherwise, filter events for this time slot
    let relevantEvents = [];
    
    if (isSportPeriod) {
        // Show all events in sport period
        relevantEvents = sessions;
    } else {
        // Filter events that match this period's time
        const periodStart = dayStart;
        const periodEnd = dayEnd;
        
        relevantEvents = sessions.filter(session => {
            const eventMin = getMinutes(session.time?.split('–')[0] || session.time);
            return eventMin >= periodStart && eventMin < periodEnd;
        });
    }

    if (relevantEvents.length === 0) return null;

    return (
        <>
            <div className="mt-2 space-y-1">
                {relevantEvents.slice(0, 3).map((event, idx) => (
                    <ClipboardEventCard
                        key={idx}
                        event={event}
                        onClick={() => setSelectedEvent(event)}
                    />
                ))}
                {relevantEvents.length > 3 && (
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 px-2">
                        +{relevantEvents.length - 3} more
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selectedEvent && (
                    <EventDetailPopout event={selectedEvent} onClose={() => setSelectedEvent(null)} />
                )}
            </AnimatePresence>
        </>
    );
};

export default ClipboardEventsInline;
