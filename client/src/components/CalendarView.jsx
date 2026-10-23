import React, { useState, useEffect, useMemo } from 'react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock } from 'lucide-react';
import { fetchCalendarEvents, fetchDateInfo, fetchAssignments } from '../services/api';
import { motion } from 'framer-motion';

const CalendarView = ({ user }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  // Load events for the current month
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

        const isPro = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';

        const promises = [
          fetchCalendarEvents(calendarStart, calendarEnd),
          fetchDateInfo(currentDate).catch(() => null)
        ];

        if (isPro) {
          promises.push(fetchAssignments().catch(() => ({ success: true, assignments: [] })));
        }

        const [eventsData, daysData, assignmentsData] = await Promise.all(promises);

        let mergedEvents = eventsData ? JSON.parse(JSON.stringify(eventsData)) : [];
        const userAssignments = assignmentsData?.assignments || [];

        if (isPro && userAssignments.length > 0) {
          userAssignments.forEach(assignment => {
            const dueDate = new Date(assignment.dueDate);
            if (dueDate >= calendarStart && dueDate <= calendarEnd) {
              const assignmentDateStr = format(dueDate, 'yyyy-MM-dd');

              let dayGroup = mergedEvents.find(group => group.info?.date === assignmentDateStr);
              if (!dayGroup) {
                let term = 1;
                let week = 1;
                let weekType = 'A';

                const siblingGroup = mergedEvents.find(g => g.info?.term);
                if (siblingGroup) {
                  term = siblingGroup.info.term;
                  week = siblingGroup.info.week;
                  weekType = siblingGroup.info.weekType;
                } else if (daysData) {
                  const values = Object.values(daysData);
                  for (const val of values) {
                    if (val && typeof val === 'object' && val.term && val.week) {
                      term = val.term;
                      week = val.week;
                      break;
                    }
                  }
                }

                dayGroup = {
                  info: {
                    date: assignmentDateStr,
                    term,
                    week,
                    weekType
                  },
                  items: []
                };
                mergedEvents.push(dayGroup);
              }

              dayGroup.items.push({
                title: assignment.title,
                type: 'assignment',
                subject: assignment.subject,
                time: assignment.dueDate ? format(new Date(assignment.dueDate), 'HH:mm') : '',
                status: assignment.status,
                priority: assignment.priority,
                notes: assignment.notes
              });
            }
          });

          mergedEvents.sort((a, b) => new Date(a.info.date) - new Date(b.info.date));
        }

        setEvents(mergedEvents);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEvents();
  }, [currentDate, user]);

  // Generate calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days = [];
    const current = calendarStart;

    while (current <= calendarEnd) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [currentDate]);

  // Get events for a specific date
  const getEventsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayGroup = events.find(group => group.info?.date === dateStr);
    return dayGroup?.items || [];
  };

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const getEventTypeColor = (type) => {
    switch(type) {
      case 'assessment': return 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white';
      case 'assignment': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/30';
      default: return 'bg-zinc-100 text-zinc-900 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800';
    }
  };

  const getEventTypeAccent = (type) => {
    switch(type) {
      case 'assessment': return 'bg-black dark:bg-white';
      case 'assignment': return 'bg-purple-600 dark:bg-purple-400';
      default: return 'bg-zinc-400 dark:bg-zinc-600';
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h2 className="text-3xl font-bold dark:text-white text-zinc-900">Synchron Calendar</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Events and important dates</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="px-4 py-2 font-semibold bg-zinc-100 dark:bg-zinc-900 rounded-lg dark:text-zinc-100 text-zinc-900 text-sm min-w-[140px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </div>

          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </motion.div>

      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4 mx-auto">
            <div className="w-5 h-5 rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-black dark:border-t-white animate-spin"></div>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400">Loading events...</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
            <div key={day} className="bg-zinc-50 dark:bg-zinc-900 p-3 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{day}</span>
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((date, idx) => {
            const dayEvents = getEventsForDate(date);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isTodayDate = isToday(date);
            const isSelected = selectedDate && isSameDay(date, selectedDate);

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.01 }}
                onClick={() => setSelectedDate(date)}
                className={`bg-white dark:bg-zinc-950 min-h-[100px] p-2 cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                  !isCurrentMonth ? 'opacity-40' : ''
                } ${isSelected ? 'ring-2 ring-inset ring-accent' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${
                    isTodayDate
                      ? 'bg-black text-white dark:bg-white dark:text-black w-7 h-7 flex items-center justify-center rounded-full'
                      : isCurrentMonth
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 dark:text-zinc-600'
                  }`}>
                    {format(date, 'd')}
                  </span>
                </div>

                {dayEvents.length > 0 && (
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <div
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate border ${getEventTypeColor(event.type)}`}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-zinc-500 dark:text-zinc-400 px-1.5">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Selected date detail view */}
      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {format(selectedDate, 'EEEE')}
                  </span>
                  <span className="text-2xl font-bold dark:text-white text-zinc-900 mt-0.5">
                    {format(selectedDate, 'd MMMM yyyy')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} className="text-zinc-500 dark:text-zinc-400" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {getEventsForDate(selectedDate).map((event, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-1 h-10 rounded-full shrink-0 mt-1 ${getEventTypeAccent(event.type)}`}></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className={`font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-tight ${event.status === 'Completed' ? 'line-through opacity-50' : ''}`}>
                        {event.title}
                      </h3>
                      <span className={`shrink-0 px-2 py-1 text-xs font-semibold uppercase tracking-wider rounded border ${getEventTypeColor(event.type)}`}>
                        {event.type}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {event.subject && (
                        <span className="font-medium">{event.subject}</span>
                      )}
                      {event.subject && event.time && (
                        <span className="hidden sm:inline opacity-50">•</span>
                      )}
                      {event.time && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {event.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {getEventsForDate(selectedDate).length === 0 && (
              <div className="px-5 py-8 text-center text-zinc-500 dark:text-zinc-400">
                No events on this day
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CalendarView;
