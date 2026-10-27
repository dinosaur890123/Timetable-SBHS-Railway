import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, addDays, startOfWeek, isSameWeek, isSameDay, startOfMonth, endOfMonth, isToday, eachDayOfInterval } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Sparkles, X, RotateCcw } from 'lucide-react';
import { fetchCalendarEvents, fetchDateInfo, fetchAssignments } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const CalendarView = ({ user }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [termInfo, setTermInfo] = useState(null);
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showFlyout, setShowFlyout] = useState(false);
  const popupRef = useRef(null);

  // Load events for the month
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);

        const promises = [
          fetchCalendarEvents(start, end),
          fetchDateInfo(currentDate).catch(() => null),
          fetchAssignments().catch(() => ({ success: true, assignments: [] }))
        ];

        const [eventsData, daysData, assignmentsData] = await Promise.all(promises);

        let mergedEvents = eventsData ? JSON.parse(JSON.stringify(eventsData)) : [];
        const userAssignments = assignmentsData?.assignments || [];

        if (userAssignments.length > 0) {
          userAssignments.forEach(assignment => {
            const dueDate = new Date(assignment.dueDate);
            if (dueDate >= start && dueDate <= end) {
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

        let currentTerm = null;
        let currentWeek = null;

        if (eventsData && eventsData.length > 0) {
          const firstEventWithInfo = eventsData.find(d => d.info && d.info.term && d.info.week);
          if (firstEventWithInfo) {
            currentTerm = firstEventWithInfo.info.term;
            currentWeek = firstEventWithInfo.info.week;
          }
        }

        if (!currentTerm && daysData) {
          const values = Object.values(daysData);
          for (const val of values) {
            if (val && typeof val === 'object' && val.term && val.week) {
              currentTerm = val.term;
              currentWeek = val.week;
              break;
            }
          }
        }

        setTermInfo(currentTerm && currentWeek ? { term: currentTerm, week: currentWeek } : null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEvents();
  }, [currentDate, user]);

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setShowCalendarPopup(false);
      }
    };

    if (showCalendarPopup) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendarPopup]);

  // Generate calendar grid for the month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return days;
  }, [currentDate]);

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setShowFlyout(true);
  };

  const handleReset = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
    setShowFlyout(false);
  };

  const getEventsForDate = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.find(e => e.info?.date === dateStr);
  };

  // Get term/week info for a date
  const getTermWeekInfo = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const eventGroup = events.find(e => e.info?.date === dateStr);
    if (eventGroup?.info?.term && eventGroup?.info?.week) {
      return {
        term: eventGroup.info.term,
        week: eventGroup.info.week,
        weekType: eventGroup.info.weekType || ''
      };
    }
    return null;
  };

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
    <div className="max-w-7xl mx-auto w-full relative">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h2 className="text-3xl font-bold dark:text-white text-zinc-900">Synchron Calendar</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Events and important dates</p>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentDate(d => addDays(d, -30))}
            className="w-10 h-10 shrink-0 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={20} />
          </button>

          <button
            onClick={handleReset}
            className="px-3 py-2 font-semibold bg-zinc-100 dark:bg-zinc-900 rounded-lg dark:text-zinc-100 text-zinc-900 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 min-w-0"
          >
            <RotateCcw size={14} />
            {format(currentDate, 'MMMM yyyy')}
          </button>

          <button
            onClick={() => setCurrentDate(d => addDays(d, 30))}
            className="w-10 h-10 shrink-0 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
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
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Calendar Grid */}
          <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {/* Day Headers */}
              <div className="grid grid-cols-8 border-b border-zinc-200 dark:border-zinc-800">
                <div className="px-1 py-2 sm:px-2 sm:py-3 bg-zinc-50 dark:bg-zinc-950"></div>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="px-1 py-2 sm:px-2 sm:py-3 text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-8 gap-px bg-zinc-200 dark:bg-zinc-800">
                {(() => {
                  const monthStart = startOfMonth(currentDate);
                  const firstDayOfWeek = monthStart.getDay();
                  const monthEnd = endOfMonth(currentDate);
                  const totalDays = monthEnd.getDate();

                  const cells = [];

                  // Empty cells for days before the first day of the month
                  for (let i = 0; i < firstDayOfWeek; i++) {
                    cells.push(<div key={`empty-${i}`} className="bg-zinc-50 dark:bg-zinc-950 min-h-[60px] sm:min-h-[100px]" />);
                  }

                  // Days of the month
                  for (let day = 1; day <= totalDays; day++) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                    const eventsForDate = getEventsForDate(date);
                    const hasEvents = eventsForDate && eventsForDate.items && eventsForDate.items.length > 0;
                    const isTodayDate = isToday(date);
                    const isSunday = date.getDay() === 0;

                    cells.push(
                      <button
                        key={day}
                        onClick={() => handleDateClick(date)}
                        className={`relative min-h-[60px] sm:min-h-[100px] p-1 sm:p-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                          isTodayDate
                            ? 'bg-zinc-100 dark:bg-zinc-800'
                            : 'bg-white dark:bg-zinc-900'
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs sm:text-sm font-semibold ${
                          isTodayDate
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'text-zinc-900 dark:text-white'
                        }`}>
                          {day}
                        </span>
                        {hasEvents && (
                          <div className="mt-1 sm:mt-2 space-y-0.5 sm:space-y-1">
                            {eventsForDate.items.slice(0, 2).map((event, i) => (
                              <div
                                key={i}
                                className={`px-1 py-0.5 sm:px-1.5 sm:py-0.5 text-[9px] sm:text-[10px] font-medium truncate rounded ${getEventTypeColor(event.type)}`}
                              >
                                {event.title}
                              </div>
                            ))}
                            {eventsForDate.items.length > 2 && (
                              <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400">
                                +{eventsForDate.items.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  }

                  // Reorganize into rows with week indicators
                  const rows = [];
                  const numCells = firstDayOfWeek + totalDays;
                  const numRows = Math.ceil(numCells / 7);

                  for (let row = 0; row < numRows; row++) {
                    const startIdx = row * 7;
                    const endIdx = Math.min(startIdx + 7, numCells);
                    const rowCells = cells.slice(startIdx, endIdx);

                    // Get the first day of this week to determine term/week
                    let weekInfo = null;
                    for (let i = startIdx; i < endIdx; i++) {
                      const dayIndex = i - firstDayOfWeek;
                      if (dayIndex >= 0 && dayIndex < totalDays) {
                        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayIndex + 1);
                        weekInfo = getTermWeekInfo(date);
                        if (weekInfo) break;
                      }
                    }

                    rows.push(
                      <React.Fragment key={row}>
                        {/* Week indicator cell */}
                        <div className="bg-zinc-50 dark:bg-zinc-950 min-h-[60px] sm:min-h-[100px] flex flex-col items-center justify-center border-r border-zinc-200 dark:border-zinc-800 w-8 sm:w-auto">
                          {weekInfo ? (
                            <div className="text-center px-0.5">
                              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                T{weekInfo.term}
                              </div>
                              <div className="text-[10px] sm:text-xs font-semibold text-zinc-900 dark:text-white mt-0.5">
                                W{weekInfo.week}
                              </div>
                              {weekInfo.weekType && (
                                <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  {weekInfo.weekType}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-zinc-300 dark:text-zinc-700 text-[10px] sm:text-xs">—</div>
                          )}
                        </div>
                        {/* Day cells */}
                        {rowCells}
                      </React.Fragment>
                    );
                  }

                  return rows;
                })()}
              </div>
            </div>
          </div>

          {/* Right Side Flyout */}
          <AnimatePresence>
            {showFlyout && selectedDate && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="w-full lg:w-96 shrink-0 order-first lg:order-last"
              >
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden sticky top-4 lg:top-8">
                  {/* Flyout Header */}
                  <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hidden sm:block">
                          {format(selectedDate, 'EEEE')}
                        </div>
                        <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 sm:hidden">
                          {format(selectedDate, 'EEE')}
                        </div>
                        <div className="text-xl sm:text-2xl font-bold dark:text-white text-zinc-900 mt-0.5">
                          {format(selectedDate, 'd MMMM yyyy')}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowFlyout(false)}
                        className="w-8 h-8 shrink-0 grid place-items-center hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                      >
                        <X size={18} className="text-zinc-500 dark:text-zinc-400" />
                      </button>
                    </div>
                  </div>

                  {/* Events List */}
                  <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                    {(() => {
                      const eventsForDate = getEventsForDate(selectedDate);
                      if (!eventsForDate || !eventsForDate.items || eventsForDate.items.length === 0) {
                        return (
                          <div className="px-5 py-12 text-center">
                            <CalIcon size={32} className="text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm">No events</p>
                          </div>
                        );
                      }

                      return (
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                          {eventsForDate.items.map((event, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.05 }}
                              className="px-4 py-3 sm:px-5 sm:py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                            >
                              <div className="flex items-start gap-3 sm:gap-4">
                                <div className={`w-1 h-10 rounded-full shrink-0 mt-1 ${getEventTypeAccent(event.type)}`}></div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2">
                                    <h3 className={`font-semibold text-zinc-900 dark:text-zinc-100 text-sm leading-tight ${event.status === 'Completed' ? 'line-through opacity-50' : ''}`}>
                                      {event.title}
                                    </h3>
                                    <span className={`shrink-0 px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider rounded border ${getEventTypeColor(event.type)}`}>
                                      {event.type}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                                    {event.subject && (
                                      <span className="font-medium">{event.subject}</span>
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
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
