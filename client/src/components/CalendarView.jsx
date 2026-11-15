import React, { useState, useEffect, useRef } from 'react';
import { format, addMonths, startOfMonth, endOfMonth, isToday, isSameDay, isSameMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, X, RotateCcw } from 'lucide-react';
import { calendarPage, termsPage, closureLabel } from '../services/pageData';
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

// Soft tinted chips for the grid; filled badges are kept for the day panel.
const getEventChipColor = (type) => {
  switch (type) {
    case 'assessment': return 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-950 dark:border-white';
    case 'assignment': return 'bg-purple-100/80 text-purple-800 border-purple-200 dark:bg-purple-400/10 dark:text-purple-300 dark:border-purple-400/20';
    case 'holiday': return 'bg-sky-100/80 text-sky-800 border-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:border-sky-400/20';
    default: return 'bg-zinc-100/80 text-zinc-600 border-zinc-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:border-white/10';
  }
};

const getEventDotColor = (type) => {
  switch (type) {
    case 'assessment': return 'bg-zinc-900 dark:bg-white';
    case 'assignment': return 'bg-purple-500 dark:bg-purple-400';
    case 'holiday': return 'bg-sky-500 dark:bg-sky-400';
    default: return 'bg-zinc-400 dark:bg-zinc-500';
  }
};

const CELL_HEIGHT = 'min-h-[56px] sm:min-h-[92px]';
// Week/term column, then seven day columns.
const GRID_COLS = 'grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] sm:grid-cols-[4rem_repeat(7,minmax(0,1fr))]';

const weekIndexForDate = (month, date) => {
  const firstDay = startOfMonth(month).getDay();
  return Math.floor((firstDay + date.getDate() - 1) / 7);
};

const isSameMonthDate = (a, b) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

// One day cell, shared by the month grid and the mobile week view.
const DayButton = ({ date, day, outOfMonth = false, group, closure, isSelected, onSelect, minHeight = CELL_HEIGHT }) => {
  const items = group?.items || [];
  const isTodayDate = isToday(date);

  return (
    <motion.button
      onClick={() => onSelect(date)}
      transition={SPRING}
      aria-pressed={isSelected}
      className={`relative ${minHeight} px-1 pt-1.5 pb-1 sm:px-1.5 sm:pt-2 flex flex-col text-left transition-colors ${
        outOfMonth ? 'opacity-45 ' : ''
      }${
        isSelected
          ? 'bg-accent/10 dark:bg-accent/15'
          : isTodayDate
            ? 'bg-accent/5 dark:bg-accent/10'
            : 'bg-m-card hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04]'
      }`}
    >
      {/* The selection ring glides from day to day rather than jumping. */}
      <AnimatePresence>
        {isSelected && (
          <motion.span
            layoutId="calendar-selected-day"
            aria-hidden
            className="absolute inset-0.5 rounded-md ring-2 ring-accent pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
          />
        )}
      </AnimatePresence>
      <div className="relative flex items-center gap-1.5">
        <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[13px] sm:text-sm font-medium ${
          isTodayDate
            ? 'bg-accent text-accent-contrast'
            : isSelected
              ? 'text-accent'
              : 'text-zinc-800 dark:text-zinc-200'
        }`}>
          {day}
        </span>
        {closure && (
          <span title={closure} className="h-1 w-1 rounded-full bg-sky-500 shrink-0" />
        )}
      </div>
      {items.length > 0 && (
        <div className="relative mt-auto pt-1">
          {/* Narrow screens get colour dots; wider ones get named chips. */}
          <div className="flex items-center gap-1 sm:hidden">
            {items.slice(0, 3).map((event, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${getEventDotColor(event.type)}`} />
            ))}
            {items.length > 3 && (
              <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">+{items.length - 3}</span>
            )}
          </div>
          <div className="hidden sm:block space-y-1">
            {items.slice(0, 2).map((event, i) => (
              <div
                key={i}
                className={`px-1.5 py-0.5 text-[10px] font-medium truncate rounded-md border ${getEventChipColor(event.type)}`}
              >
                {event.title}
              </div>
            ))}
            {items.length > 2 && (
              <div className="px-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                +{items.length - 2} more
              </div>
            )}
          </div>
        </div>
      )}
    </motion.button>
  );
};

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
        cells.push(<div key={`empty-${row}-${col}`} className={`bg-m-panel ${CELL_HEIGHT}`} />);
        continue;
      }

      const date = new Date(month.getFullYear(), month.getMonth(), day);
      const group = groupFor(date);
      const closure = closureFor?.(date);
      if (!weekInfo && group?.info?.term && group?.info?.week) {
        weekInfo = { term: group.info.term, week: group.info.week, weekType: group.info.weekType || '' };
      }
      const isSelected = !!selectedDate && isSameDay(date, selectedDate);

      cells.push(
        <DayButton
          key={day}
          date={date}
          day={day}
          group={group}
          closure={closure}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      );
    }

    rows.push(
      <React.Fragment key={row}>
        <div className={`bg-m-panel ${CELL_HEIGHT} flex flex-col items-center justify-center px-0.5`}>
          {weekInfo ? (
            <div className="text-center">
              <div className="font-mono text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">T{weekInfo.term}</div>
              <div className="text-[11px] sm:text-xs font-semibold text-zinc-900 dark:text-white mt-0.5">W{weekInfo.week}</div>
              {weekInfo.weekType && (
                <div className="hidden sm:block text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{weekInfo.weekType}</div>
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

  return <div className={`grid ${GRID_COLS} gap-px bg-m-line`}>{rows}</div>;
};

// Mobile: one week at a time. Days from neighbouring months stay visible but dimmed;
// tapping one jumps to its month.
const WeekGrid = ({ month, weekIndex, numWeeks, events, selectedDate, onSelect, closureFor, onWeekChange }) => {
  const firstDayOfWeek = startOfMonth(month).getDay();
  const startDay = weekIndex * 7 - firstDayOfWeek + 1;
  const dates = Array.from({ length: 7 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), startDay + i));

  const groupFor = (date) => events.find(e => e.info?.date === format(date, 'yyyy-MM-dd'));

  let weekInfo = null;
  for (const d of dates) {
    const group = groupFor(d);
    if (group?.info?.term && group?.info?.week) {
      weekInfo = { term: group.info.term, week: group.info.week, weekType: group.info.weekType || '' };
      break;
    }
  }

  const rangeLabel = isSameMonthDate(dates[0], dates[6])
    ? `${format(dates[0], 'd')} – ${format(dates[6], 'd MMM')}`
    : `${format(dates[0], 'd MMM')} – ${format(dates[6], 'd MMM')}`;

  const navBtn = 'w-8 h-8 shrink-0 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.05] dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:pointer-events-none';

  return (
    <div className="bg-m-card rounded-xl border border-m-line overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-m-line bg-m-panel">
        <button onClick={() => onWeekChange(w => Math.max(0, w - 1))} disabled={weekIndex === 0} className={navBtn} aria-label="Previous week">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center min-w-0">
          <div className="text-[13px] font-semibold text-zinc-900 dark:text-white truncate">{rangeLabel}</div>
          {weekInfo && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              T{weekInfo.term} · W{weekInfo.week}{weekInfo.weekType ? ` · ${weekInfo.weekType}` : ''}
            </div>
          )}
        </div>
        <button onClick={() => onWeekChange(w => Math.min(numWeeks - 1, w + 1))} disabled={weekIndex >= numWeeks - 1} className={navBtn} aria-label="Next week">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-m-line border-b border-m-line">
        {dates.map(d => (
          <div key={format(d, 'yyyy-MM-dd')} className="bg-m-panel py-1.5 text-center font-mono text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
            {format(d, 'E')[0]}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-m-line">
        {dates.map(d => (
          <DayButton
            key={format(d, 'yyyy-MM-dd')}
            date={d}
            day={d.getDate()}
            outOfMonth={!isSameMonthDate(d, month)}
            group={groupFor(d)}
            closure={closureFor?.(d)}
            isSelected={!!selectedDate && isSameDay(d, selectedDate)}
            onSelect={onSelect}
            minHeight="min-h-[72px]"
          />
        ))}
      </div>
    </div>
  );
};

const DayEvents = ({ date, group, closure }) => {
  const items = [...(closure ? [{ title: closure, type: 'holiday' }] : []), ...(group?.items || [])];
  if (items.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <CalIcon size={28} className="text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 dark:text-zinc-500">No events</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-m-line">
      {items.map((event, i) => (
        <motion.div
          key={`${format(date, 'yyyy-MM-dd')}-${i}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.24, ease: EASE }}
          className="px-4 py-3 sm:px-5 sm:py-4 hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] transition-colors"
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
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const panelRef = useRef(null);
  const [weekIndex, setWeekIndex] = useState(() => weekIndexForDate(new Date(), new Date()));

  // Months already loaded (this session, saved on the device, or fetched in the background at
  // start-up) show at once and refresh underneath.
  const monthKey = format(currentDate, 'yyyy-MM');
  const page = user?.studentId ? calendarPage(user.studentId, currentDate) : null;
  const { data: monthEvents, loading } = useCachedLoad(page?.key ?? null, page?.load);
  const events = monthEvents || [];

  // School closures: named holidays, staff development days and days outside every
  // term, marked with a blue dot on the day.
  const { data: terms } = useCachedLoad(termsPage().key, termsPage().load);
  const closureFor = (date) => closureLabel(date, terms, events);

  const numWeeks = Math.ceil((startOfMonth(currentDate).getDay() + endOfMonth(currentDate).getDate()) / 7);

  const goToMonth = (target) => {
    const dir = Math.sign(startOfMonth(target) - startOfMonth(currentDate));
    if (dir === 0) return;
    setDirection(dir);
    setCurrentDate(target);
    // Land on today's week when going back to the current month, otherwise the first week.
    const now = new Date();
    setWeekIndex(isSameMonthDate(startOfMonth(target), startOfMonth(now)) ? weekIndexForDate(startOfMonth(target), now) : 0);
  };

  const handleReset = () => {
    goToMonth(new Date());
    setWeekIndex(weekIndexForDate(new Date(), new Date()));
    setShowFlyout(false);
  };

  const handleDateClick = (date) => {
    // Tapping a dimmed day from a neighbouring month jumps to its month and selects it.
    if (!isSameMonthDate(date, currentDate)) {
      setDirection(Math.sign(startOfMonth(date) - startOfMonth(currentDate)));
      setCurrentDate(startOfMonth(date));
      setWeekIndex(weekIndexForDate(startOfMonth(date), date));
      setSelectedDate(date);
      setShowFlyout(true);
      return;
    }
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

  // On narrow screens the day panel unfolds below the grid, so bring it into view.
  useEffect(() => {
    if (flyoutOpen && !isWide) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [flyoutOpen, selectedDate, isWide]);

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
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight dark:text-white text-zinc-900">Calendar</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Events and important dates</p>
          </div>

          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => goToMonth(addMonths(currentDate, -1))}
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.05] dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </motion.button>

            <motion.button
              onClick={handleReset}
              className="relative px-3 py-2 font-medium bg-zinc-100 dark:bg-zinc-900 rounded-lg dark:text-zinc-100 text-zinc-900 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 min-w-[10.5rem] justify-center overflow-hidden"
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
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/[0.05] dark:hover:text-white dark:hover:bg-white/[0.06] transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </motion.button>
          </div>
        </motion.div>

        <div className="flex flex-col lg:flex-row">
          {/* Calendar Grid */}
          <div className="flex-1 min-w-0">
            <div className="bg-m-card rounded-xl border border-m-line overflow-hidden">
              {/* Day Headers */}
              <div className={`grid ${GRID_COLS} gap-px bg-m-line border-b border-m-line`}>
                <div className="bg-m-panel py-2"></div>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="bg-m-panel px-1 py-2 sm:py-2.5 text-center">
                    <span className="sm:hidden font-mono text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">{day[0]}</span>
                    <span className="hidden sm:inline font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">{day}</span>
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
                      {isNarrow ? (
                        <WeekGrid
                          month={currentDate}
                          weekIndex={Math.min(weekIndex, numWeeks - 1)}
                          numWeeks={numWeeks}
                          events={events}
                          selectedDate={flyoutOpen ? selectedDate : null}
                          onSelect={handleDateClick}
                          closureFor={closureFor}
                          onWeekChange={setWeekIndex}
                        />
                      ) : (
                        <MonthGrid
                          month={currentDate}
                          events={events}
                          selectedDate={flyoutOpen ? selectedDate : null}
                          onSelect={handleDateClick}
                          closureFor={closureFor}
                        />
                      )}
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
                ref={panelRef}
                {...panelMotion}
                transition={{ ...PANEL_SPRING, opacity: { duration: 0.18 } }}
                className="shrink-0 overflow-hidden"
              >
                <div className="pb-4 lg:pb-0 lg:pl-6 lg:w-[408px]">
                  <div className="bg-m-card rounded-xl border border-m-line overflow-hidden lg:sticky lg:top-8">
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
                        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-m-line bg-m-panel">
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
                              className="w-8 h-8 shrink-0 grid place-items-center hover:bg-zinc-900/[0.06] dark:hover:bg-white/[0.08] rounded-lg transition-colors"
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
