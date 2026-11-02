import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, Users, X, Calendar } from 'lucide-react';

const getMinutes = (timeStr) => {
    if (!timeStr) return 0;
    // Handle formats like "9:00 AM – 10:30 AM" or "9:00"
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

const ClipboardEvents = ({ sessions, dayStart, dayEnd, nowMin }) => {
    const [selectedEvent, setSelectedEvent] = useState(null);

    if (!sessions || sessions.length === 0) return null;

    // Group events by time of day
    const beforeSchool = [];
    const duringSchool = [];
    const afterSchool = [];

    sessions.forEach(session => {
        const eventMin = getMinutes(session.time?.split('–')[0] || session.time);
        if (eventMin < dayStart) {
            beforeSchool.push(session);
        } else if (eventMin >= dayEnd) {
            afterSchool.push(session);
        } else {
            duringSchool.push(session);
        }
    });

    const hasEvents = beforeSchool.length > 0 || duringSchool.length > 0 || afterSchool.length > 0;
    if (!hasEvents) return null;

    return (
        <>
            <div className="space-y-2">
                {beforeSchool.length > 0 && (
                    <div className="rounded-xl border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
                        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400 mb-2">
                            Before school
                        </div>
                        <div className="space-y-1.5">
                            {beforeSchool.slice(0, 2).map((event, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedEvent(event)}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors group"
                                >
                                    <div className="text-[12px] font-medium text-zinc-900 dark:text-white truncate group-hover:text-amber-700 dark:group-hover:text-amber-300">
                                        {event.activity}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{event.time}</div>
                                </button>
                            ))}
                            {beforeSchool.length > 2 && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 px-2">
                                    +{beforeSchool.length - 2} more
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {duringSchool.length > 0 && (
                    <div className="rounded-xl border border-sky-200/50 dark:border-sky-900/30 bg-sky-50/50 dark:bg-sky-950/20 p-2.5">
                        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-sky-700 dark:text-sky-400 mb-2">
                            During school
                        </div>
                        <div className="space-y-1.5">
                            {duringSchool.slice(0, 2).map((event, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedEvent(event)}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-sky-100/50 dark:hover:bg-sky-900/30 transition-colors group"
                                >
                                    <div className="text-[12px] font-medium text-zinc-900 dark:text-white truncate group-hover:text-sky-700 dark:group-hover:text-sky-300">
                                        {event.activity}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{event.time}</div>
                                </button>
                            ))}
                            {duringSchool.length > 2 && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 px-2">
                                    +{duringSchool.length - 2} more
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {afterSchool.length > 0 && (
                    <div className="rounded-xl border border-violet-200/50 dark:border-violet-900/30 bg-violet-50/50 dark:bg-violet-950/20 p-2.5">
                        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-violet-700 dark:text-violet-400 mb-2">
                            After school
                        </div>
                        <div className="space-y-1.5">
                            {afterSchool.slice(0, 2).map((event, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedEvent(event)}
                                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-colors group"
                                >
                                    <div className="text-[12px] font-medium text-zinc-900 dark:text-white truncate group-hover:text-violet-700 dark:group-hover:text-violet-300">
                                        {event.activity}
                                    </div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{event.time}</div>
                                </button>
                            ))}
                            {afterSchool.length > 2 && (
                                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 px-2">
                                    +{afterSchool.length - 2} more
                                </div>
                            )}
                        </div>
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

export default ClipboardEvents;
