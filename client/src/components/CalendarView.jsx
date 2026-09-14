import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, addDays, startOfWeek, isSameWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, Sparkles, X } from 'lucide-react';
import { fetchCalendarEvents, fetchDateInfo, fetchAssignments } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';

const CalendarView = ({ user }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [termInfo, setTermInfo] = useState(null);
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const popupRef = useRef(null);

  // Load events for the month/week
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const end = addDays(start, 6);
        
        const isPro = user?.role === 'Admin' || user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'pro';
        
        const promises = [
          fetchCalendarEvents(start, end),
          fetchDateInfo(addDays(start, 3)).catch(() => null)
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
            // Bounds check
            if (dueDate >= start && dueDate <= end) {
              const assignmentDateStr = format(dueDate, 'yyyy-MM-dd');
              
              // Find matching dayGroup
              let dayGroup = mergedEvents.find(group => group.info?.date === assignmentDateStr);
              if (!dayGroup) {
                // Determine day term/week info from calendar data or fallbacks
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

              // Append assignment item
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

          // Sort dayGroups chronologically
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

  // Generate weeks for calendar popup (show 12 weeks back and 12 weeks forward)
  const weekOptions = useMemo(() => {
    const weeks = [];
    const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    
    for (let i = -12; i <= 12; i++) {
      const weekStart = addDays(currentWeekStart, i * 7);
      const weekEnd = addDays(weekStart, 6);
      weeks.push({
        start: weekStart,
        end: weekEnd,
        isCurrent: i === 0
      });
    }
    
    return weeks;
  }, [currentDate]);

  const handleWeekSelect = (weekStart) => {
    setCurrentDate(weekStart);
    setShowCalendarPopup(false);
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
    <div className="max-w-5xl mx-auto w-full">
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
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentDate(d => addDays(d, -7))}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="relative" ref={popupRef}>
            <button
              onClick={() => setShowCalendarPopup(!showCalendarPopup)}
              className="px-3 py-2 font-semibold bg-zinc-100 dark:bg-zinc-900 rounded-lg dark:text-zinc-100 text-zinc-900 text-sm min-w-[140px] hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between gap-2"
            >
              <span>{termInfo ? `Term ${termInfo.term} Week ${termInfo.week}` : format(currentDate, 'MMM yyyy')}</span>
              <CalIcon size={14} className="text-zinc-500 dark:text-zinc-400" />
            </button>
            
            <AnimatePresence>
              {showCalendarPopup && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-50 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">Select Week</span>
                    <button
                      onClick={() => setShowCalendarPopup(false)}
                      className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                    >
                      <X size={14} className="text-zinc-500 dark:text-zinc-400" />
                    </button>
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto custom-scrollbar p-2">
                    <div className="space-y-1">
                      {weekOptions.map((week, idx) => {
                        const weekStart = startOfWeek(week.start, { weekStartsOn: 0 });
                        const isSelected = isSameWeek(week.start, currentDate, { weekStartsOn: 0 });
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => handleWeekSelect(week.start)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              isSelected
                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span>{format(week.start, 'd MMM')} - {format(week.end, 'd MMM yyyy')}</span>
                              {week.isCurrent && (
                                <span className="text-[10px] font-extrabold uppercase">Current</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <button 
            onClick={() => setCurrentDate(d => addDays(d, 7))}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
            aria-label="Next week"
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
       ) : events.length === 0 ? (
         <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           className="text-center py-16"
         >
           <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 mb-4">
             <CalIcon size={32} className="text-zinc-400 dark:text-zinc-600" />
           </div>
           <p className="text-zinc-500 dark:text-zinc-400 font-medium">No events found</p>
           <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Try navigating to a different week</p>
         </motion.div>
       ) : (
         <div className="space-y-3">
           {events.map((dayGroup, idx) => (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: idx * 0.05 }}
               key={dayGroup.info.date}
               className="bg-white dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all overflow-hidden"
             >
               {/* Day Header */}
               <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 backdrop-blur-sm">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                     <div className="flex flex-col">
                       <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                         {format(new Date(dayGroup.info.date), 'EEEE')}
                       </span>
                       <span className="text-2xl font-bold dark:text-white text-zinc-900 mt-0.5">
                         {format(new Date(dayGroup.info.date), 'd')}
                       </span>
                     </div>
                     <div className="pl-4 border-l border-zinc-200 dark:border-zinc-800">
                       <div className="text-xs font-extrabold uppercase tracking-wide text-zinc-900 dark:text-zinc-100 mb-1">
                         Term {dayGroup.info.term}
                       </div>
                       <div className="text-xs text-zinc-500 dark:text-zinc-400">
                         Week {dayGroup.info.week}{dayGroup.info.weekType}
                       </div>
                     </div>
                   </div>
                   <div className="text-right hidden sm:block">
                     <span className="text-xs text-zinc-500 dark:text-zinc-500">
                       {dayGroup.items.length} event{dayGroup.items.length !== 1 ? 's' : ''}
                     </span>
                   </div>
                 </div>
               </div>

              {/* Events List */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                {dayGroup.items.map((event, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: (idx * 0.05) + (i * 0.03) }}
                    className="px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      {/* Left Accent Bar */}
                      <div className={`w-1 h-10 rounded-full shrink-0 mt-1 ${getEventTypeAccent(event.type)}`}></div>
                      
                      {/* Content */}
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
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarView;
