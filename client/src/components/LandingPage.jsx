import React, { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence, motion, MotionConfig, useInView, useMotionValue, useMotionValueEvent, useScroll, useTransform
} from 'framer-motion';
import { ArrowRight, ArrowDown, AlertOctagon, X, MapPin, UserRound } from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark } from './modern/ModernShell';
import { skyAt } from './modern/AmbientLight';

// The landing page is always dark; the saved theme preference only applies once signed in.
//
// The page is one ordinary document scroll. The middle of it is a school day: scrolling
// moves a clock from before school to the last bell, the day's rail fills in beside it,
// and the ambient light behind the page follows that clock instead of the real one.

const ease = [0.2, 0.8, 0.2, 1];

const Label = ({ children, className = '' }) => (
  <div className={`font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-400 ${className}`}>
    {children}
  </div>
);

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const formatMin = (min) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// Mirrors the day's PeriodCard rows: time and bell, subject, teacher line and room.
// `past` dims a finished class, `current` gets the accent edge and "Now", and
// `sub`/`roomChange` wear the same change-highlight the real rows use.
const PREVIEW_DAY = [
  { time: '9:00', bell: '1', title: 'English', teacher: 'Ms Reid', room: '203', past: true },
  { time: '10:05', bell: '2', title: 'Physics', teacher: 'Mr Hall', room: '307', current: true, sub: true },
  { break: 'Recess', time: '11:05', mins: '17 min' },
  { time: '11:25', bell: '3', title: 'Design & Technology', teacher: 'Mr Gray', room: '502', roomChange: true },
  { time: '12:30', bell: '4', title: 'Mathematics Ext. 2', teacher: 'Mr Jones', room: '105' },
  { break: 'Lunch', time: '13:30', mins: '37 min' },
  { time: '14:10', bell: '5', title: 'History', teacher: 'Mr Smith', room: '105' }
];

// The same Tuesday as a rail of slots, for the scrolled day. Each slot runs until the next one starts.
const RAIL = [
  { time: '8:00', label: 'Before school' },
  { time: '9:00', label: 'English', bell: 'P1' },
  { time: '10:05', label: 'Physics', bell: 'P2' },
  { time: '11:05', label: 'Recess' },
  { time: '11:25', label: 'Design & Technology', bell: 'P3' },
  { time: '12:30', label: 'Mathematics Ext. 2', bell: 'P4' },
  { time: '13:30', label: 'Lunch' },
  { time: '14:10', label: 'History', bell: 'P5' },
  { time: '15:10', label: 'End of day' }
].map(slot => ({ ...slot, start: toMin(slot.time) }));

const DAY_START = toMin('8:00');
const DAY_END = toMin('15:20');

const slotAt = (min) => {
  let index = 0;
  RAIL.forEach((slot, i) => { if (slot.start <= min) index = i; });
  return index;
};

// Digits roll like an odometer, as in Home's countdown. Keyed from the right so the
// minutes keep their place when the hour gains a digit.
const RollingText = ({ text, direction = 1 }) => (
  <span className="inline-flex">
    {text.split('').map((ch, i, all) => {
      const slot = all.length - i;
      if (!/\d/.test(ch)) return <span key={slot}>{ch}</span>;
      return (
        <span key={slot} className="relative inline-block overflow-hidden">
          <span className="invisible">{ch}</span>
          <AnimatePresence initial={false} custom={direction}>
            <motion.span
              key={ch}
              custom={direction}
              className="absolute inset-0"
              variants={{
                enter: d => ({ y: d > 0 ? '80%' : '-80%', opacity: 0 }),
                rest: { y: '0%', opacity: 1 },
                leave: d => ({ y: d > 0 ? '-80%' : '80%', opacity: 0 })
              }}
              initial="enter"
              animate="rest"
              exit="leave"
              transition={{ type: 'spring', stiffness: 380, damping: 30, opacity: { duration: 0.2 } }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      );
    })}
  </span>
);

// A period is 60 minutes; the preview counts down through the back half of one and loops.
const PERIOD_SECONDS = 60 * 60;

const useDemoCountdown = (startRemaining) => {
  const [remaining, setRemaining] = useState(startRemaining);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(r => (r <= 60 ? startRemaining : r - 1)), 1000);
    return () => clearInterval(timer);
  }, [startRemaining]);
  return remaining;
};

// The rail card from Home's NowCard: label, class, where, countdown, progress, next.
const PreviewNowCard = ({ startRemaining = 24 * 60 + 13, rolling = false }) => {
  const remaining = useDemoCountdown(startRemaining);
  const progress = ((PERIOD_SECONDS - remaining) / PERIOD_SECONDS) * 100;

  return (
    <section className="rounded-2xl border border-m-line bg-m-card m-shadow p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
        <Label>Now · P2</Label>
        <span className="text-[12px] text-zinc-400 tabular-nums">5h 48m left today</span>
      </div>
      <div className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900 dark:text-white truncate">Physics</div>
      <div className="mt-1 flex items-center gap-2 sm:gap-3 text-xs sm:text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <span className="tabular-nums shrink-0">10:05–11:05</span>
        <span className="inline-flex items-center gap-1 shrink-0"><MapPin size={12} />307</span>
        <span className="inline-flex items-center gap-1 min-w-0"><UserRound size={12} className="shrink-0" /><span className="truncate">Mr Hall</span></span>
      </div>
      <div className="mt-2 sm:mt-4">
        <div className="flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-[26px] sm:text-[30px] leading-none font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-white">
            <span className="sr-only">{formatClock(remaining)}</span>
            <span aria-hidden>{rolling ? <RollingText text={formatClock(remaining)} direction={-1} /> : formatClock(remaining)}</span>
          </span>
          <span className="text-xs sm:text-[13px] text-zinc-500">left</span>
        </div>
      </div>
      <div className="mt-2 sm:mt-4 h-1 rounded-full bg-zinc-900/[0.06] dark:bg-white/[0.07] overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400 min-w-0">
        <ArrowRight size={12} className="shrink-0" />
        <span className="shrink-0">Next</span>
        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">Recess</span>
        <span className="ml-auto shrink-0 tabular-nums">11:05</span>
      </div>
    </section>
  );
};

const PeriodRow = ({ row, teacher = row.teacher, teacherHighlight = row.sub, roomHighlight = row.roomChange }) => (
  <li className={`rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06] ${row.current ? 'bg-zinc-900/[0.035] dark:bg-white/[0.045]' : ''}`}>
    <div className={`relative flex items-center gap-4 px-3 py-3 ${row.past ? 'opacity-50' : ''}`}>
      {row.current && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-accent" />}
      <div className="w-11 shrink-0 text-right leading-tight">
        <div className={`text-[13px] tabular-nums ${row.current ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>{row.time}</div>
        <div className="mt-0.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-500">P{row.bell}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-50">{row.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
          {row.current && <span className="shrink-0 font-medium text-accent">Now</span>}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={teacher}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className={`truncate ${teacherHighlight ? 'rounded-md px-1.5 py-0.5 change-highlight' : ''}`}
            >
              {teacher}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`text-[15px] font-medium tabular-nums transition-colors duration-300 ${roomHighlight ? 'rounded-md px-1.5 py-0.5 change-highlight' : 'px-1.5 py-0.5 text-zinc-900 dark:text-zinc-50'}`}>{row.room}</div>
      </div>
    </div>
  </li>
);

const BreakRow = ({ time, label, mins }) => (
  <li className="px-3 py-1.5">
    <div className="flex items-center gap-4">
      <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">{time}</span>
      <span className="text-[12px] text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className="flex-1 h-px bg-zinc-900/[0.06] dark:bg-white/[0.06]" />
      <span className="text-[12px] tabular-nums text-zinc-400 dark:text-zinc-600">{mins}</span>
    </div>
  </li>
);

// A faithful miniature of the signed-in home page — same topbar, greeting, day rows
// and countdown rail — always in dark mode since signed-out visitors only see dark.
const ProductPreview = () => (
  <div className="relative rounded-2xl border border-m-line bg-m-panel m-shadow-lg overflow-hidden" aria-label="Preview of the Synchron home page">
    <div className="flex items-center justify-between gap-3 h-11 px-4 border-b border-m-line">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[15px] font-medium tracking-tight text-zinc-900 dark:text-white truncate">My Synchron</span>
        <span className="hidden sm:flex items-center p-0.5 rounded-lg bg-zinc-900/[0.05] dark:bg-white/[0.06]">
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm">Daily</span>
          <span className="px-2 py-0.5 text-[11px] font-medium rounded-md text-zinc-500 dark:text-zinc-400">Cycle</span>
        </span>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Synced
      </span>
    </div>

    <div className="relative isolate p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 m-dots" />

      <header className="relative mb-6">
        <div className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-white">
          Good Morning, <span className="text-accent">Sam</span>
        </div>
        <p className="mt-1.5 text-[15px] text-zinc-500 dark:text-zinc-400">Today is TueA · 6 classes</p>
      </header>

      {/* Rail first in the DOM so it sits above the list on narrow screens, like the app */}
      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="sm:order-2"><PreviewNowCard /></div>
        <ol className="sm:order-1 -mx-3 space-y-0.5" aria-label="Example timetable">
          {PREVIEW_DAY.map(row => row.break
            ? <BreakRow key={row.break} time={row.time} label={row.break} mins={row.mins} />
            : <PeriodRow key={row.bell} row={row} />)}
          <li className="flex items-center gap-4 px-3 pt-3">
            <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">15:10</span>
            <span className="text-[12px] text-zinc-400 dark:text-zinc-500">End of day</span>
          </li>
        </ol>
      </div>
    </div>
  </div>
);

/* ---------- The scrolled day ---------- */

// Plays its change once the reader has had a moment to see the "before".
const useDelayedInView = (delay = 700) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (!inView) return undefined;
    const timer = setTimeout(() => setFired(true), delay);
    return () => clearTimeout(timer);
  }, [inView, delay]);
  return [ref, fired];
};

const Fragment = ({ children, className = '' }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.4 }}
    transition={{ duration: 0.6, ease }}
    className={className}
  >
    {children}
  </motion.div>
);

const NOTICES = [
  { title: 'Debating Meeting', years: 'Years 11, 12', when: 'Lunch', body: 'All senior debaters please meet in Room 101 at lunch.', author: 'Ms K Smith' },
  { title: 'Basketball Trials', years: 'All students', body: 'Opens basketball trials are on Thursday after school in the Gym.', author: 'Mr J Doe' }
];

const NoticesFragment = () => (
  <div className="space-y-2.5">
    <div className="flex items-center gap-2">
      <span className="flex items-center p-0.5 rounded-lg bg-white/[0.06]">
        {['All', 'Year 10', 'Year 11', 'Year 12'].map(year => (
          <span
            key={year}
            className={`px-2.5 py-1 text-[12px] font-medium rounded-md ${year === 'Year 11' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500'}`}
          >
            {year}
          </span>
        ))}
      </span>
    </div>
    {NOTICES.map((notice, i) => (
      <motion.article
        key={notice.title}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5, delay: 0.15 + i * 0.12, ease }}
        className="rounded-2xl border border-m-line bg-m-card m-shadow p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-[15px] font-medium text-white">{notice.title}</h4>
          {notice.when && (
            <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400">{notice.when}</span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{notice.body}</p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-zinc-500">
          <span>{notice.author}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-zinc-600" />
          <span>{notice.years}</span>
        </div>
      </motion.article>
    ))}
  </div>
);

// Mr Hall is away: once the rows are on screen, the substitute and the room move land in place.
const ChangesFragment = () => {
  const [ref, changed] = useDelayedInView(800);
  const physics = PREVIEW_DAY[1];
  const design = PREVIEW_DAY[3];
  return (
    <div ref={ref}>
      <ol className="space-y-1">
        <PeriodRow
          row={{ ...physics, current: false }}
          teacher={changed ? 'Ms Patel' : physics.teacher}
          teacherHighlight={changed}
          roomHighlight={false}
        />
        <BreakRow time="11:05" label="Recess" mins="17 min" />
        <PeriodRow
          row={{ ...design, room: changed ? '502' : '204' }}
          teacherHighlight={false}
          roomHighlight={changed}
        />
      </ol>
      <div className="mt-3 flex items-center gap-2 px-1 text-[12px] text-zinc-500" aria-live="polite">
        <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${changed ? 'bg-amber-500' : 'bg-zinc-600'}`} />
        {changed ? 'Mr Hall is away · D&T moved to 502' : 'Checking today’s changes…'}
      </div>
    </div>
  );
};

const CountdownFragment = () => (
  <div className="max-w-xs">
    <PreviewNowCard startRemaining={23 * 60 + 41} rolling />
  </div>
);

// A Clipboard session sits in the day as one line, laid out like a break row.
const LunchFragment = () => (
  <ol className="space-y-1">
    <PeriodRow row={{ ...PREVIEW_DAY[4], past: true }} />
    <BreakRow time="13:30" label="Lunch" mins="37 min" />
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 0.5, delay: 0.25, ease }}
      className="px-3 py-1.5"
    >
      <div className="flex items-center gap-4">
        <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-300">13:35</span>
        <span className="flex items-center gap-2 text-[13px] font-medium text-zinc-200">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          Basketball training
        </span>
        <span className="flex-1 h-px bg-white/[0.08]" />
        <span className="text-[12px] text-zinc-400">Gym</span>
      </div>
    </motion.li>
    <PeriodRow row={PREVIEW_DAY[6]} />
  </ol>
);

const TomorrowFragment = () => (
  <div className="rounded-2xl border border-m-line bg-m-card m-shadow p-4">
    <div className="flex items-center justify-between gap-3">
      <Label>Tomorrow · WedA</Label>
      <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        Saved on this device
      </span>
    </div>
    <ol className="mt-3 -mx-3 space-y-0.5">
      <PeriodRow row={{ time: '9:00', bell: '1', title: 'Mathematics Ext. 2', teacher: 'Mr Jones', room: '105' }} />
      <PeriodRow row={{ time: '10:05', bell: '2', title: 'Physics', teacher: 'Mr Hall', room: '307' }} />
    </ol>
    <div className="mt-3 pt-3 border-t border-white/[0.06] text-[13px] text-zinc-500">
      Week 6 · Term 4
    </div>
  </div>
);

const CHAPTERS = [
  {
    at: '8:20',
    kicker: 'Before school',
    title: 'The notices, before roll call.',
    body: 'The day’s notices, filtered to your year and easy to read on a phone. Meetings say when they’re on.',
    Visual: NoticesFragment
  },
  {
    at: '10:05',
    kicker: 'Period 2',
    title: 'Changes are already in.',
    body: 'When a teacher is away or a class moves rooms, the substitute and the new room show up in your timetable, highlighted so you can’t miss them.',
    Visual: ChangesFragment
  },
  {
    at: '10:41',
    kicker: 'Halfway through',
    title: 'Know exactly when the bell goes.',
    body: 'A countdown to the end of the period, to the second, with what’s on next and where.',
    Visual: CountdownFragment
  },
  {
    at: '13:30',
    kicker: 'Lunch',
    title: 'Sport sits in the same day.',
    body: 'Training and sessions from Clipboard slot in by start time, between your classes, instead of living in another tab.',
    Visual: LunchFragment
  },
  {
    at: '15:10',
    kicker: 'Last bell',
    title: 'Tomorrow is already loaded.',
    body: 'Synchron keeps your timetable on the device, so it opens on the bus with no signal. It knows which week of the cycle it is, too.',
    Visual: TomorrowFragment
  }
].map(chapter => ({ ...chapter, min: toMin(chapter.at) }));

// Where you read: a line a little below the middle of the viewport.
const READING_LINE = 0.6;

// The scrolled clock. It reads DAY_START as the first chapter reaches the reading line, each
// chapter's time as its middle crosses it, and DAY_END as the last one leaves.
//
// Measured with getBoundingClientRect rather than framer's useScroll target tracking: the app
// zooms <body> by --ui-scale on big screens, and offsetTop (which useScroll sums) ignores that
// zoom while scroll positions don't, so the clock would run ahead of the page.
const useReadingClock = (ref) => {
  const minutes = useMotionValue(DAY_START);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const chapters = ref.current ? Array.from(ref.current.children) : [];
      if (!chapters.length) return;
      const line = window.innerHeight * READING_LINE;
      const rects = chapters.map(el => el.getBoundingClientRect());
      const points = [
        [rects[0].top, DAY_START],
        ...rects.map((r, i) => [r.top + r.height / 2, CHAPTERS[i].min]),
        [rects[rects.length - 1].bottom, DAY_END]
      ];
      if (line <= points[0][0]) { minutes.set(DAY_START); return; }
      for (let i = 1; i < points.length; i++) {
        const [y1, m1] = points[i];
        if (line < y1) {
          const [y0, m0] = points[i - 1];
          minutes.set(m0 + ((line - y0) / (y1 - y0)) * (m1 - m0));
          return;
        }
      }
      minutes.set(DAY_END);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, [ref, minutes]);
  return minutes;
};

// The ambient light, driven by the scrolled clock. Same blobs as AmbientLight, but the colours
// ease over a second instead of four so they keep up with a scroll.
const ScrollSky = ({ minutes, festive }) => {
  const [colours, setColours] = useState(() => skyAt(atMinute(DAY_START), festive).colours);
  const last = useRef(-1);
  useMotionValueEvent(minutes, 'change', (value) => {
    const rounded = Math.round(value / 5) * 5;
    if (rounded === last.current) return;
    last.current = rounded;
    setColours(skyAt(atMinute(rounded), festive).colours);
  });
  const [a, b, c] = colours;
  const transition = '--ambient-a 1.2s linear, --ambient-b 1.2s linear, --ambient-c 1.2s linear';
  return (
    <div aria-hidden className="ambient ambient--page" style={{ position: 'fixed', opacity: 0.22 }}>
      <span className="ambient__blob ambient__blob--a" style={{ '--ambient-a': a, transition }} />
      <span className="ambient__blob ambient__blob--b" style={{ '--ambient-b': b, transition }} />
      <span className="ambient__blob ambient__blob--c" style={{ '--ambient-c': c, transition }} />
    </div>
  );
};

// Today's date at a given minute of the day, so the festive palettes still apply in December.
const atMinute = (min) => {
  const date = new Date();
  date.setHours(Math.floor(min / 60), Math.floor(min % 60), 0, 0);
  return date;
};

const useClock = (minutes) => {
  const [state, setState] = useState({ min: DAY_START, direction: 1 });
  useMotionValueEvent(minutes, 'change', (value) => {
    const min = Math.round(value);
    setState(prev => (prev.min === min ? prev : { min, direction: min > prev.min ? 1 : -1 }));
  });
  return state;
};

// The sticky side of the day: a big clock and the day's rail, which dims what's past
// and marks what's on, exactly as the timetable does.
const DayClock = ({ minutes, fill }) => {
  const { min, direction } = useClock(minutes);
  const current = slotAt(min);
  const slot = RAIL[current];

  return (
    <>
      {/* Phones: a slim bar under the header */}
      <div className="lg:hidden -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 border-b border-m-line bg-m-panel/80 backdrop-blur-xl">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-white">
            <RollingText text={formatMin(min)} direction={direction} />
          </span>
          <span className="truncate text-[13px] text-zinc-400">
            {slot.bell && <span className="font-mono text-[11px] text-zinc-500 mr-1.5">{slot.bell}</span>}
            {slot.label}
          </span>
        </div>
        <div className="mt-2 h-0.5 rounded-full bg-white/[0.07] overflow-hidden">
          <motion.div className="h-full origin-left rounded-full bg-accent" style={{ scaleX: fill }} />
        </div>
      </div>

      {/* Desktop: the clock and the full rail */}
      <div className="hidden lg:block">
        <Label>A Tuesday, scrolled</Label>
        <div className="mt-4 text-[5.5rem] xl:text-[6.5rem] leading-none font-semibold tracking-[-0.045em] tabular-nums text-white">
          <span className="sr-only">{formatMin(min)}</span>
          <span aria-hidden><RollingText text={formatMin(min)} direction={direction} /></span>
        </div>
        <div className="mt-3 h-6 text-[15px] text-zinc-400">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={slot.label}
              className="inline-block"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {slot.bell ? `${slot.bell} · ` : ''}{slot.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <ol className="relative mt-10 space-y-0.5" aria-label="The day">
          <span aria-hidden className="absolute left-14 top-2 bottom-2 w-px bg-white/[0.07]" />
          <motion.span
            aria-hidden
            className="absolute left-14 top-2 bottom-2 w-[2px] -translate-x-[0.5px] origin-top rounded-full bg-accent"
            style={{ scaleY: fill }}
          />
          {RAIL.map((item, i) => {
            const past = i < current;
            const now = i === current;
            return (
              <li key={item.time} className={`relative flex items-center gap-4 py-1 transition-opacity duration-300 ${past ? 'opacity-40' : ''}`}>
                <span className={`w-10 shrink-0 text-right text-[12px] tabular-nums ${now ? 'text-white font-medium' : 'text-zinc-500'}`}>{item.time}</span>
                <span className={`relative z-10 w-[7px] h-[7px] shrink-0 -ml-[3px] rounded-full ring-4 ring-m-panel transition-colors duration-300 ${now ? 'bg-accent' : past ? 'bg-zinc-500' : 'bg-zinc-700'}`} />
                <span className={`truncate text-[13px] transition-colors duration-300 ${now ? 'text-white font-medium' : item.bell ? 'text-zinc-400' : 'text-zinc-500'}`}>{item.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
};

const Chapter = ({ chapter }) => {
  const { Visual } = chapter;
  return (
    <article className="flex min-h-[64svh] lg:min-h-[80vh] flex-col justify-center py-12 lg:py-14">
      <Fragment>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tabular-nums text-accent">{chapter.at}</span>
          <span className="h-px w-6 bg-white/[0.12]" />
          <Label>{chapter.kicker}</Label>
        </div>
        <h3 className="mt-4 max-w-md text-[1.75rem] sm:text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
          {chapter.title}
        </h3>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-400">{chapter.body}</p>
      </Fragment>
      <Fragment className="mt-8 max-w-md">
        <Visual />
      </Fragment>
    </article>
  );
};

/* ---------- Everything else ---------- */

// The rest of the sidebar, as an index rather than a grid of cards.
const INDEX = [
  { title: 'Calendar', body: 'Term dates, events and which week of the cycle you’re in.' },
  { title: 'Notices', body: 'Every notice, filterable by year.' },
  { title: 'Awards', body: 'Your award scheme points and badges.' },
  { title: 'Clipboard', body: 'Sport and training sessions, with times, places and opponents.' },
  { title: 'Study', body: 'NoteFlow, the all-in-one study app with an AI tutor.' },
  { title: 'Canvas & Portal', body: 'Your Canvas courses and the Student Portal, a click away.' }
];

const AuthErrorDialog = ({ authError, onDismiss }) => {
  const config = getOauthConfig();
  const isNetworkFailure = /failed to fetch|load failed|network|connection|timed out|abort|local network|permission|ERR_LOCAL_NETWORK|ERR_BLOCKED_BY|ERR_FAILED/i.test(authError);
  const isConfigFailure = /invalid_client|unauthorized_client|redirect.?uri|client secret|missing client id/i.test(authError);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="absolute inset-0 bg-black/70" onClick={onDismiss} />
      <motion.div
        role="alertdialog"
        aria-labelledby="auth-error-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-m-line bg-m-card p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <AlertOctagon size={18} className="text-rose-500 dark:text-rose-400 shrink-0" />
            <h3 id="auth-error-title" className="text-base font-semibold text-zinc-900 dark:text-white">Sign-in failed</h3>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all">
          {authError}
        </div>

        {isNetworkFailure ? (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Check this site’s network permission</p>
            <p className="mt-1.5">
              If you previously blocked a browser prompt for local network access, open this site’s controls beside the address bar, find its permissions, and change <span className="font-medium text-zinc-900 dark:text-zinc-100">Local network access</span> to Allow. The setting name may vary by browser. Then reload this page and sign in again.
            </p>
          </div>
        ) : isConfigFailure ? (
          <>
            <ol className="mb-5 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400 list-decimal pl-5 marker:text-zinc-400 dark:marker:text-zinc-600">
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Redirect URI.</span> The redirect URL in the SBHS developer portal must exactly match{' '}
                <code className="rounded bg-m-panel px-1.5 py-0.5 font-mono text-xs text-zinc-800 dark:text-zinc-100">{config.redirectUri}</code>.
              </li>
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Client secret.</span> The developer portal client secret must match the one provided in settings.
              </li>
              <li>
                <span className="text-zinc-900 dark:text-zinc-100">Redeploy the client.</span> Vite reads this config at build time, so after changing environment variables in Railway you must trigger a new frontend deployment.
              </li>
            </ol>

            <dl className="rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs space-y-1.5">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Client ID</dt>
                <dd className="text-zinc-700 dark:text-zinc-300 truncate">{config.clientId}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Redirect URI</dt>
                <dd className="text-zinc-700 dark:text-zinc-300 truncate">{config.redirectUri}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Client secret</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  Kept on the server (<code className="font-mono text-xs">SBHS_CLIENT_SECRET</code>)
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mb-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Try signing in again. If it keeps returning here, share this error with the Synchron team.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="h-9 px-4 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onDismiss();
              performLogin();
            }}
            className="h-9 px-4 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const SignInButton = ({ className = '' }) => (
  <button
    onClick={performLogin}
    className={`group inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 transition-colors ${className}`}
  >
    Sign in with SBHS
    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
  </button>
);

const NavLink = ({ href, children }) => (
  <a href={href} className="text-[13px] font-medium text-zinc-400 hover:text-white transition-colors">{children}</a>
);

const LandingPage = ({ authError, clearAuthError, festiveAmbient = false }) => {
  // Easter egg: three clicks on the logo bring back the original four-square mark.
  const [logoClicks, setLogoClicks] = useState(0);
  const [useOriginalMark, setUseOriginalMark] = useState(false);
  const [ambientOn] = useState(() => {
    try { return localStorage.getItem('ambient_light') !== 'off'; } catch { return true; }
  });

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      if (prev + 1 >= 3) {
        setUseOriginalMark(true);
        return 0;
      }
      return prev + 1;
    });
  };

  // The header gains its hairline once the page has moved.
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', y => setScrolled(y > 8));

  // The hero preview eases back as the day takes over.
  const previewScale = useTransform(scrollY, [0, 800], [1, 0.94]);
  const previewOpacity = useTransform(scrollY, [300, 900], [1, 0.35]);

  const dayRef = useRef(null);
  const minutes = useReadingClock(dayRef);
  const dayFill = useTransform(minutes, [DAY_START, RAIL[RAIL.length - 1].start], [0, 1]);

  // In-page links glide unless the reader prefers less motion.
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'smooth';
    return () => { root.style.scrollBehavior = previous; };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate min-h-[100dvh] bg-m-panel text-zinc-100">
        <AnimatePresence>
          {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
        </AnimatePresence>

        {ambientOn && <ScrollSky minutes={minutes} festive={festiveAmbient} />}

        <header className={`sticky top-0 z-40 border-b bg-m-panel/75 backdrop-blur-xl transition-colors duration-300 ${scrolled ? 'border-m-line' : 'border-transparent'}`}>
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
            <button onClick={handleLogoClick} className="flex min-w-0 items-center gap-2.5" aria-label="Synchron">
              {useOriginalMark ? (
                <span className="grid shrink-0 grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white">
                  {[0, 1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-[2px] bg-zinc-900" />)}
                </span>
              ) : (
                <BrandMark />
              )}
              <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-white">Synchron</span>
            </button>
            <nav className="hidden items-center gap-5 sm:flex" aria-label="Landing">
              <NavLink href="#the-day">The day</NavLink>
              <NavLink href="#whats-inside">What’s inside</NavLink>
              <NavLink href="/privacy">Privacy</NavLink>
            </nav>
            <button
              onClick={performLogin}
              className="h-11 shrink-0 px-4 sm:h-8 sm:px-3 rounded-lg border border-m-line bg-m-card text-[13px] font-medium text-zinc-200 hover:text-white transition-colors"
            >
              Sign in
            </button>
          </div>
        </header>

        <main>
          {/* Hero */}
          <section className="relative">
            <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-0 h-[28rem] m-dots" />
            <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-12 pb-10 sm:px-8 md:pt-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:pb-16">
              <motion.div
                initial={{ opacity: 1, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
              >
                <h1 className="text-[2.6rem] sm:text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-white">
                  Your timetable,
                  <br />
                  <span className="text-accent">live.</span>
                </h1>
                <p className="mt-6 max-w-md text-base sm:text-[15px] leading-relaxed text-zinc-400">
                  A quick, one-stop app for your day at Sydney Boys High School. By students, for students.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <SignInButton />
                  <a href="#the-day" className="group inline-flex h-11 items-center gap-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                    See a day in it
                    <ArrowDown size={15} className="transition-transform group-hover:translate-y-0.5" />
                  </a>
                </div>
                <p className="mt-6 max-w-sm text-xs leading-relaxed text-zinc-500">
                  Your browser may ask for local network access when you sign in. Choose Allow so Synchron can sync.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 1, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease }}
                style={{ scale: previewScale, opacity: previewOpacity }}
                className="origin-top"
              >
                <ProductPreview />
              </motion.div>
            </div>
          </section>

          {/* The day */}
          <section id="the-day" className="relative scroll-mt-14 border-t border-m-line">
            <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
              <aside className="sticky top-14 z-20 self-start lg:flex lg:h-[calc(100dvh/var(--ui-scale)-3.5rem)] lg:flex-col lg:justify-center lg:py-10">
                <DayClock minutes={minutes} fill={dayFill} />
              </aside>
              <div ref={dayRef}>
                {CHAPTERS.map(chapter => <Chapter key={chapter.at} chapter={chapter} />)}
              </div>
            </div>
          </section>

          {/* Everything else */}
          <section id="whats-inside" className="scroll-mt-14 border-t border-m-line">
            <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 md:py-24">
              <div className="grid gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-16">
                <div>
                  <Label>What’s inside</Label>
                  <h2 className="mt-4 text-[1.75rem] sm:text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white">
                    The rest of the sidebar.
                  </h2>
                  <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-zinc-400">
                    Every page is a keystroke away: press <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-m-line text-zinc-300">Ctrl K</kbd> and type where you want to go.
                  </p>
                </div>
                <ol className="border-t border-m-line">
                  {INDEX.map((item, i) => (
                    <motion.li
                      key={item.title}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.8 }}
                      transition={{ duration: 0.45, delay: i * 0.05, ease }}
                      className="group grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-m-line py-5 sm:grid-cols-[2rem_minmax(0,11rem)_minmax(0,1fr)] sm:items-baseline"
                    >
                      <span className="font-mono text-[11px] tabular-nums text-zinc-600 transition-colors group-hover:text-accent">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-lg font-medium tracking-tight text-white">{item.title}</span>
                      <span className="col-start-2 sm:col-start-auto text-[14px] leading-relaxed text-zinc-400">{item.body}</span>
                    </motion.li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          {/* Close */}
          <section className="relative border-t border-m-line overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-0 h-80 m-dots" />
            <div className="mx-auto w-full max-w-6xl px-5 pt-20 pb-24 sm:px-8 md:pt-28 md:pb-32">
              <Label>Tomorrow · 9:00</Label>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.6, ease }}
                className="mt-5 max-w-3xl text-[2.4rem] sm:text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-white"
              >
                Sign in once.
                <br />
                <span className="text-zinc-500">It’s ready every morning.</span>
              </motion.h2>
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
                <SignInButton />
                <span className="text-[13px] text-zinc-500">Uses your SBHS account. Works in the browser, or install it as an app.</span>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-m-line">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500">© Synchron {new Date().getFullYear()}</span>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500" aria-label="Footer">
              <a href="#the-day" className="hover:text-white transition-colors">The day</a>
              <a href="#whats-inside" className="hover:text-white transition-colors">What’s inside</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
              <span>Built independently for SBHS</span>
            </nav>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
