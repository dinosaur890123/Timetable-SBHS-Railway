import React, { useState, useEffect } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, isToday, isSameDay, isSameMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, X, RotateCcw } from 'lucide-react';
import { calendarPage, termsPage, schoolDaysPage, closureLabel } from '../services/pageData';
import { useCachedLoad } from '../utils/pageCache';
import { motion, AnimatePresence, LayoutGroup, MotionConfig } from 'framer-motion';

// Motion follows DESIGN.md: springs for things that move, short fades for things that swap.
const SPRING = { type: 'spring', stiffness: 500, damping: 40 };
const PANEL_SPRING = { type: 'spring', stiffness: 380, damping: 38 };
const EASE = [0.2, 0.8, 0.2, 1];


// Months slide in from the side you navigated towards.
const slide = {
  enter: (dir) => ({ x: dir * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir * -48, opacity: 0 })
};

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

const getEventTypeColor = (type) => {
  switch (type) {
    case 'assessment': return 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white';
    case 'assignment': return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/30';
    case 'holiday': return 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/30';
    default: return 'bg-zinc-100 text-zinc-900 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800';
  }
};

const getEventTypeAccent = (type) => {
  switch (type) {
    case 'assessment': return 'bg-black dark:bg-white';
    case 'assignment': return 'bg-purple-600 dark:bg-purple-400';
    case 'holiday': return 'bg-sky-500 dark:bg-sky-400';
    default: return 'bg-zinc-400 dark:bg-zinc-600';
  }
};

const CELL_HEIGHT = 'min-h-[60px] sm:min-h-[100px]';

// One month: a term/week column, then the days. Pure render; the parent animates it in and out.
const MonthGrid = ({ month, events, selectedDate, onSelect, closureFor }) => {
  const groupFor = (date) => events.find(e => e.info?.date === format(date, 'yyyy-MM-dd'));

  const firstDayOfWeek = startOfMonth(month).getDay();
  const totalDays = endOfMonth(month).getDate();
  const numRows = Math.ceil((firstDayOfWeek + totalDays) / 7);

  const rows = [];
  for (let row = 0; row < numRows; row++) {
    const cells = [];
    let weekInfo = null;

    for (let col = 0; col < 7; col++) {
      const day = row * 7 + col - firstDayOfWeek + 1;
      if (day < 1 || day > totalDays) {
        cells.push(<div key={`empty-${row}-${col}`} className={`bg-zinc-50 dark:bg-zinc-950 ${CELL_HEIGHT}`} />);
        continue;
      }

      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const group = groupFor(date);
      const closure = closureFor?.(date);
      const items = group?.items || [];
      if (!weekInfo && group?.info?.term && group?.info?.week) {
        weekInfo = { term: group.info.term, week: group.info.week, weekType: group.info.weekType || '' };
      }
      const isTodayDate = isToday(date);
      const isSelected = !!selectedDate && isSameDay(date, selectedDate);

      cells.push(
        <motion.button
          key={day}
          onClick={() => onSelect(date)}
          transition={SPRING}
          aria-pressed={isSelected}
          className={`relative ${CELL_HEIGHT} p-1 sm:p-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
            isTodayDate ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-white dark:bg-zinc-900'
          }`}
        >
          {/* The selection ring glides from day to day rather than jumping. */}
          <AnimatePresence>
            {isSelected && (
              <motion.span
                layoutId="calendar-selected-day"
                aria-hidden
                className="absolute inset-0.5 rounded-lg ring-2 ring-zinc-900 dark:ring-white pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
              />
            )}
          </AnimatePresence>
          <span className={`relative inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs sm:text-sm font-semibold ${
            isTodayDate ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-zinc-900 dark:text-white'
          }`}>
            {day}
          </span>
          {closure && (
            <span
              title={closure}
              className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-blue-500"
            />
          )}
          {items.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="relative mt-1 sm:mt-2 space-y-0.5 sm:space-y-1"
            >
              {items.slice(0, 2).map((event, i) => (
                <div
                  key={i}
                  className={`px-1 py-0.5 sm:px-1.5 sm:py-0.5 text-[9px] sm:text-[10px] font-medium truncate rounded ${getEventTypeColor(event.type)}`}
                >
                  {event.title}
                </div>
              ))}
              {items.length > 2 && (
                <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400">
                  +{items.length - 2} more
                </div>
              )}
            </motion.div>
          )}
        </motion.button>
      );
    }

    rows.push(
      <React.Fragment key={row}>
        <div className={`bg-zinc-50 dark:bg-zinc-950 ${CELL_HEIGHT} flex flex-col items-center justify-center border-r border-zinc-200 dark:border-zinc-800 w-8 sm:w-auto`}>
          {weekInfo ? (
            <div className="text-center px-0.5">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">T{weekInfo.term}</div>
              <div className="text-[10px] sm:text-xs font-semibold text-zinc-900 dark:text-white mt-0.5">W{weekInfo.week}</div>
              {weekInfo.weekType && (
                <div className="text-[9px] sm:text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">{weekInfo.weekType}</div>
              )}
            </div>
          ) : (
            <div className="text-zinc-300 dark:text-zinc-700 text-[10px] sm:text-xs">—</div>
          )}
        </div>
        {cells}
      </React.Fragment>
    );
  }

  return <div className="grid grid-cols-8 gap-px bg-zinc-200 dark:bg-zinc-800">{rows}</div>;
};

const DayEvents = ({ date, group, closure }) => {
  const items = [...(closure ? [{ title: closure, type: 'holiday' }] : []), ...(group?.items || [])];
  if (items.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <CalIcon size={32} className="text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">No events</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
      {items.map((event, i) => (
        <motion.div
          key={`${format(date, 'yyyy-MM-dd')}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.24, ease: EASE }}
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
                {event.subject && <span className="font-medium">{event.subject}</span>}
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
};

const CalendarView = ({ user }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [direction, setDirection] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showFlyout, setShowFlyout] = useState(false);
  const [dayDirection, setDayDirection] = useState(1);
  const isWide = useMediaQuery('(min-width: 1024px)');

  // Months already loaded (this session, saved on the device, or fetched in the background at
  // start-up) show at once and refresh underneath.
  const monthKey = format(currentDate, 'yyyy-MM');
  const page = user?.studentId ? calendarPage(user.studentId, currentDate) : null;
  const { data: monthEvents, loading } = useCachedLoad(page?.key ?? null, page?.load);
  const events = monthEvents || [];

  // School closures: named holidays, staff development days and days outside every
  // term, marked with a blue dot. Waits for the month's days data so un-loaded days
  // don't all fall back to the term bounds at once.
  const { data: terms } = useCachedLoad(termsPage().key, termsPage().load);
  const { data: monthDays } = useCachedLoad(schoolDaysPage(currentDate).key, schoolDaysPage(currentDate).load);
  const closureFor = (date) => (monthDays ? closureLabel(date, terms, monthDays[format(date, 'yyyy-MM-dd')]) : null);

  const goToMonth = (target) => {
    const dir = Math.sign(startOfMonth(target) - startOfMonth(currentDate));
    if (dir === 0) return;
    setDirection(dir);
    setCurrentDate(target);
  };

  const handleReset = () => {
    goToMonth(new Date());
    setShowFlyout(false);
  };

  const handleDateClick = (date) => {
    if (showFlyout && selectedDate && isSameDay(date, selectedDate)) {
      setShowFlyout(false);
      return;
    }
    if (selectedDate) setDayDirection(date > selectedDate ? 1 : -1);
    setSelectedDate(date);
    setShowFlyout(true);
  };

  const selectedGroup = selectedDate && events.find(e => e.info?.date === format(selectedDate, 'yyyy-MM-dd'));
  const flyoutOpen = showFlyout && selectedDate && isSameMonth(selectedDate, currentDate);
  const selectedClosure = flyoutOpen ? closureFor(selectedDate) : null;

  // Wide screens: the panel grows sideways and the grid narrows with it. Narrow: it unfolds above.
  const panelMotion = isWide
    ? { initial: { width: 0, opacity: 0 }, animate: { width: 408, opacity: 1 }, exit: { width: 0, opacity: 0 } }
    : { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 } };

  return (
    <MotionConfig reducedMotion="user">
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
            <motion.button
              onClick={() => goToMonth(addMonths(currentDate, -1))}
              className="w-10 h-10 shrink-0 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={20} />
            </motion.button>

            <motion.button
              onClick={handleReset}
              className="relative px-3 py-2 font-semibold bg-zinc-100 dark:bg-zinc-900 rounded-lg dark:text-zinc-100 text-zinc-900 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 min-w-[10.5rem] justify-center overflow-hidden"
              title="Back to this month"
            >
              {loading
                ? <span className="w-3.5 h-3.5 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-900 dark:border-t-white animate-spin" />
                : <RotateCcw size={14} className="shrink-0" />}
              <span className="relative inline-grid">
                <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                  <motion.span
                    key={monthKey}
                    custom={direction}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: EASE }}
                    className="whitespace-nowrap"
                  >
                    {format(currentDate, 'MMMM yyyy')}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.button>

            <motion.button
              onClick={() => goToMonth(addMonths(currentDate, 1))}
              className="w-10 h-10 shrink-0 grid place-items-center rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:text-zinc-300 text-zinc-700 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={20} />
            </motion.button>
          </div>
        </motion.div>

        <div className="flex flex-col lg:flex-row">
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

              {/* Months slide; the frame eases to the new month's height (5 or 6 weeks). */}
              <motion.div layout transition={PANEL_SPRING} className="relative overflow-hidden">
                <LayoutGroup id="calendar-days">
                  <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                    <motion.div
                      key={monthKey}
                      custom={direction}
                      variants={slide}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ x: PANEL_SPRING, opacity: { duration: 0.2 } }}
                    >
                      <MonthGrid
                        month={currentDate}
                        events={events}
                        selectedDate={flyoutOpen ? selectedDate : null}
                        onSelect={handleDateClick}
                        closureFor={closureFor}
                      />
                    </motion.div>
                  </AnimatePresence>
                </LayoutGroup>
              </motion.div>
            </div>
          </div>

          {/* Day panel */}
          <AnimatePresence initial={false}>
            {flyoutOpen && (
              <motion.aside
                key="day-panel"
                {...panelMotion}
                transition={{ ...PANEL_SPRING, opacity: { duration: 0.18 } }}
                className="shrink-0 order-first lg:order-last overflow-hidden"
              >
                <div className="pb-4 lg:pb-0 lg:pl-6 lg:w-[408px]">
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden lg:sticky lg:top-8">
                    <AnimatePresence mode="popLayout" initial={false} custom={dayDirection}>
                      <motion.div
                        key={format(selectedDate, 'yyyy-MM-dd')}
                        custom={dayDirection}
                        variants={{
                          enter: (dir) => ({ y: dir * 10, opacity: 0 }),
                          center: { y: 0, opacity: 1 },
                          exit: (dir) => ({ y: dir * -10, opacity: 0 })
                        }}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.2, ease: EASE }}
                      >
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
                            <motion.button
                              onClick={() => setShowFlyout(false)}
                              aria-label="Close"
                              className="w-8 h-8 shrink-0 grid place-items-center hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                            >
                              <X size={18} className="text-zinc-500 dark:text-zinc-400" />
                            </motion.button>
                          </div>
                        </div>

                        {/* Events List */}
                        <div className="max-h-[400px] sm:max-h-[600px] overflow-y-auto">
                          <DayEvents date={selectedDate} group={selectedGroup} closure={selectedClosure} />
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
};

export default CalendarView;
