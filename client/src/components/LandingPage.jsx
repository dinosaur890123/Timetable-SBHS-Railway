import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  ArrowRight, AlertOctagon, X, MapPin, UserRound, Home, CalendarDays, Newspaper,
  Award, Clipboard, GraduationCap
} from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark } from './modern/ModernShell';
import AmbientLight from './modern/AmbientLight';

// The landing page is always dark; the saved theme preference only applies once signed in.

const ease = [0.2, 0.8, 0.2, 1];

const Label = ({ children, className = '' }) => (
  <div className={`font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-400 ${className}`}>
    {children}
  </div>
);

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

// A period is 60 minutes; the preview counts down through the back half of one and loops.
const PERIOD_SECONDS = 60 * 60;
const START_REMAINING = 24 * 60 + 13;

const useDemoCountdown = () => {
  const [remaining, setRemaining] = useState(START_REMAINING);
  useEffect(() => {
    const timer = setInterval(() => setRemaining(r => (r <= 60 ? START_REMAINING : r - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return remaining;
};

const formatClock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

// The rail card from Home's NowCard: label, class, where, countdown, progress, next.
const PreviewNowCard = () => {
  const remaining = useDemoCountdown();
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
            {formatClock(remaining)}
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
      <AmbientLight variant="panel" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 m-dots" />

      <header className="relative mb-6">
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-white">
          Good Morning, <span className="text-accent">Sam</span>
        </h1>
        <p className="mt-1.5 text-[15px] text-zinc-500 dark:text-zinc-400">Today is TueA · 6 classes</p>
      </header>

      {/* Rail first in the DOM so it sits above the list on narrow screens, like the app */}
      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="sm:order-2"><PreviewNowCard /></div>
        <ol className="sm:order-1 -mx-3 space-y-0.5" aria-label="Example timetable">
          {PREVIEW_DAY.map(row => row.break ? (
            <li key={row.break} className="px-3 py-1.5">
              <div className="flex items-center gap-4">
                <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">{row.time}</span>
                <span className="text-[12px] text-zinc-400 dark:text-zinc-500">{row.break}</span>
                <span className="flex-1 h-px bg-zinc-900/[0.06] dark:bg-white/[0.06]" />
                <span className="text-[12px] tabular-nums text-zinc-400 dark:text-zinc-600">{row.mins}</span>
              </div>
            </li>
          ) : (
            <li key={row.bell} className={`rounded-xl border border-zinc-900/[0.06] dark:border-white/[0.06] ${row.current ? 'bg-zinc-900/[0.035] dark:bg-white/[0.045]' : ''}`}>
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
                    <span className={`truncate ${row.sub ? 'rounded-md px-1.5 py-0.5 change-highlight' : ''}`}>{row.teacher}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-[15px] font-medium tabular-nums ${row.roomChange ? 'rounded-md px-1.5 py-0.5 change-highlight' : 'text-zinc-900 dark:text-zinc-50'}`}>{row.room}</div>
                </div>
              </div>
            </li>
          ))}
          <li className="flex items-center gap-4 px-3 pt-3">
            <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">15:10</span>
            <span className="text-[12px] text-zinc-400 dark:text-zinc-500">End of day</span>
          </li>
        </ol>
      </div>
    </div>
  </div>
);

// Mirrors the signed-in sidebar, so the page doubles as a map of the app.
const SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { icon: Home, title: 'My Synchron', body: 'Today’s timetable with substitutes and room moves already applied, and a countdown to the bell.' },
      { icon: CalendarDays, title: 'Calendar', body: 'Term dates, events and which week of the cycle you’re in.' },
      { icon: Newspaper, title: 'Notices', body: 'The daily notices, readable on a phone.' }
    ]
  },
  {
    label: 'School',
    items: [
      { icon: Award, title: 'Awards', body: 'Your award scheme points and badges.' },
      { icon: Clipboard, title: 'Clipboard', body: 'Sport and training sessions from Clipboard.' },
      { icon: GraduationCap, title: 'Study', body: 'NoteFlow, the all-in-one study app with an AI tutor.' }
    ]
  }
];

const AuthErrorDialog = ({ authError, onDismiss }) => {
  const config = getOauthConfig();

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

const LandingPage = ({ authError, clearAuthError }) => {
  // Easter egg: three clicks on the logo bring back the original four-square mark.
  const [logoClicks, setLogoClicks] = useState(0);
  const [useOriginalMark, setUseOriginalMark] = useState(false);
  const [ambientOn] = useState(() => localStorage.getItem('ambient_light') !== 'off');

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      if (prev + 1 >= 3) {
        setUseOriginalMark(true);
        return 0;
      }
      return prev + 1;
    });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-[100dvh] bg-m-page md:p-2 text-zinc-900 dark:text-zinc-100">
        <AnimatePresence>
          {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
        </AnimatePresence>

        {/* The same inset panel the signed-in app lives in: fixed height, header
            outside the scroll area so content can never scroll up behind it. */}
        <div className="relative isolate flex h-[100dvh] md:h-[calc(100dvh-1rem)] flex-col [overflow:clip] bg-m-panel md:rounded-2xl md:border border-m-line">
          {ambientOn && <AmbientLight variant="panel" style={{ position: 'fixed' }} />}
          <header className="relative z-30 border-b border-m-line bg-m-panel/80 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
              <button onClick={handleLogoClick} className="flex min-w-0 items-center gap-2.5" aria-label="Synchron">
                {useOriginalMark ? (
                  <span className="grid shrink-0 grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-white">
                    {[0, 1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-[2px] bg-zinc-900" />)}
                  </span>
                ) : (
                  <BrandMark />
                )}
                <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Synchron</span>
              </button>
              <nav className="hidden items-center gap-4 sm:flex sm:gap-5" aria-label="Landing">
                <a href="#whats-inside" className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">What’s inside</a>
                <a href="/privacy" className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
              </nav>
              <button
                onClick={performLogin}
                className="h-11 shrink-0 px-4 sm:h-8 sm:px-3 rounded-lg border border-m-line bg-m-card text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Sign in
              </button>
            </div>
          </header>

          <div aria-hidden className="pointer-events-none absolute -z-10 inset-x-0 top-14 h-[28rem] m-dots" />

          <main className="flex-1 min-h-0 overflow-y-auto">
            <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pt-14 pb-16 sm:px-8 md:pt-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:pb-24">
              <motion.div
                initial={{ opacity: 1, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
              >
                <h1 className="text-[2.2rem] sm:text-6xl font-semibold leading-[1.02] tracking-[-0.035em] text-zinc-900 dark:text-white">
                  Your timetable,
                  <br />
                  <span className="text-accent">live.</span>
                </h1>
                <p className="mt-6 max-w-md text-base sm:text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  A quick, one-stop app for your day. By students, for students at Sydney Boys High School.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <button
                    onClick={performLogin}
                    className="group inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-5 text-sm font-medium text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                  >
                    Sign in with SBHS
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
                <p className="mt-6 max-w-sm text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  Your browser may ask for local network access when you sign in. Choose Allow so Synchron can sync.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 1, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease }}
              >
                <ProductPreview />
              </motion.div>
            </section>

            <section id="whats-inside" className="border-t border-m-line scroll-mt-16">
              <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 md:py-20">
                <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] md:gap-16">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">What’s inside</h2>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      The same pages you’ll see in the sidebar once you sign in.
                    </p>
                  </div>
                  <div className="grid gap-10 sm:grid-cols-2">
                    {SECTIONS.map(section => (
                      <div key={section.label}>
                        <Label className="mb-3">{section.label}</Label>
                        <ul className="divide-y divide-zinc-900/[0.06] dark:divide-white/[0.06] border-y border-m-line">
                          {section.items.map(({ icon: Icon, title, body }) => (
                            <li key={title} className="flex gap-3 py-3.5">
                              <Icon size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                              <div>
                                <div className="text-sm font-medium text-zinc-900 dark:text-white">{title}</div>
                                <p className="mt-0.5 text-base sm:text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <footer className="border-t border-m-line">
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">© Synchron {new Date().getFullYear()}</span>
                <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400" aria-label="Footer">
                  <a href="#whats-inside" className="hover:text-zinc-900 dark:hover:text-white transition-colors">What’s inside</a>
                  <a href="/privacy" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
                  <span>Built independently for SBHS</span>
                </nav>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
