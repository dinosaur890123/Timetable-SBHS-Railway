import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  ArrowRight,
  AlertOctagon,
  X,
  Sun,
  Moon,
  Lock,
  Info,
  Heart,
  Clock,
  Newspaper,
  CalendarDays,
  MapPin,
  User as UserIcon
} from 'lucide-react';
import { performLogin, getOauthConfig } from '../services/api';
import { BrandMark } from './modern/ModernShell';

// Mirrors the colour theme picker in Settings; swatch values match the accents in index.css.
const COLOR_THEMES = [
  { id: 'zinc', name: 'Default', swatch: 'bg-zinc-900 dark:bg-zinc-100' },
  { id: 'mint', name: 'Mint', hsl: '150 84% 37%' },
  { id: 'teal', name: 'Teal', hsl: '174 84% 41%' },
  { id: 'sky', name: 'Sky', hsl: '199 89% 48%' },
  { id: 'blue', name: 'Blue', hsl: '217 91% 60%' },
  { id: 'violet', name: 'Violet', hsl: '271 91% 65%' },
  { id: 'rose', name: 'Rose', hsl: '349 86% 60%' },
  { id: 'orange', name: 'Orange', hsl: '24 95% 53%' },
  { id: 'amber', name: 'Amber', hsl: '38 92% 50%' }
];

const FEATURES = [
  {
    icon: Clock,
    title: 'Live timetable',
    body: 'Room changes and substitutes flagged the moment they happen, with a countdown to the next bell.'
  },
  {
    icon: Newspaper,
    title: 'Notices that matter',
    body: 'Daily notices filtered to your year group, so the important ones actually stand out.'
  },
  {
    icon: CalendarDays,
    title: 'Everything else, too',
    body: 'Calendar, Award Scheme points and study tools, in one calm, fast place.'
  }
];

const ease = [0.2, 0.8, 0.2, 1];
const stagger = { show: { transition: { staggerChildren: 0.07 } } };
const rise = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } }
};


// One row of the preview, styled after PeriodCard.
const PreviewPeriod = ({ time, bell, title, teacher, room, state, change, note, progress, minutesLeft }) => {
  const isCurrent = state === 'current';
  const isPast = state === 'past';
  const strip = change === 'room' ? 'bg-amber-500' : change === 'sub' ? 'bg-blue-500' : null;

  return (
    <div className={`flex items-center gap-3 ${isPast ? 'opacity-45' : ''}`}>
      <span className={`w-11 shrink-0 text-right text-[13px] font-medium tabular-nums ${isCurrent ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'}`}>
        {time}
      </span>

      <div className={`relative flex-1 min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 ${isCurrent ? 'border-accent bg-m-card' : 'border-m-line bg-m-panel'}`}>
        {isCurrent && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-full origin-left bg-accent/[0.08] transition-transform duration-1000 ease-linear"
            style={{ transform: `scaleX(${progress})` }}
          />
        )}
        {strip && !isCurrent && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${strip}`} />}

        <div className="relative flex items-center gap-3">
          <span className={`grid place-items-center w-7 h-7 shrink-0 rounded-lg text-xs font-semibold ${isCurrent ? 'bg-accent text-accent-contrast' : 'bg-zinc-900/[0.05] dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400'}`}>
            {bell}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
              {isCurrent && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-accent">{minutesLeft}m left</span>
              )}
              {state === 'next' && (
                <span className="shrink-0 rounded-md bg-zinc-900/[0.05] dark:bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Up next
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 min-w-0">
              <span className={`inline-flex items-center gap-1 min-w-0 ${change === 'sub' ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}>
                <UserIcon size={11} className="shrink-0" />
                <span className="truncate">{teacher}</span>
              </span>
              <span className={`inline-flex items-center gap-1 shrink-0 ${change === 'room' ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
                <MapPin size={11} className="shrink-0" />
                {room}
              </span>
              {note && <span className="hidden sm:inline truncate text-zinc-400 dark:text-zinc-500">{note}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

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
      <div className="absolute inset-0 bg-zinc-950/30 dark:bg-black/60 backdrop-blur-[2px]" onClick={onDismiss} />
      <motion.div
        role="alertdialog"
        aria-labelledby="auth-error-title"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
        className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-m-line bg-m-card p-6 m-shadow-lg"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-rose-500/10 text-rose-500">
              <AlertOctagon size={18} />
            </span>
            <div>
              <h3 id="auth-error-title" className="text-base font-semibold text-zinc-900 dark:text-white">Sign-in failed</h3>
              <p className="text-xs text-zinc-500">The SBHS portal didn't accept the request.</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs text-zinc-600 dark:text-zinc-300 break-all">
          {authError}
        </div>

        <div className="mb-5">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">Things to check</div>
          <ol className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex gap-2.5">
              <span className="font-mono text-xs text-zinc-400 pt-0.5">1</span>
              <div>
                <strong className="font-medium text-zinc-900 dark:text-zinc-100">Redirect URI.</strong> The redirect URL in the SBHS developer portal must exactly match{' '}
                <code className="rounded border border-m-line bg-m-panel px-1.5 py-0.5 font-mono text-xs text-zinc-900 dark:text-zinc-100">{config.redirectUri}</code>.
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-xs text-zinc-400 pt-0.5">2</span>
              <div>
                <strong className="font-medium text-zinc-900 dark:text-zinc-100">Client secret.</strong> The developer portal client secret must match the one provided in settings.
              </div>
            </li>
            <li className="flex gap-2.5">
              <span className="font-mono text-xs text-zinc-400 pt-0.5">3</span>
              <div>
                <strong className="font-medium text-zinc-900 dark:text-zinc-100">Redeploy the client.</strong> Vite reads this config at build time, so after changing environment variables in Railway you must trigger a new frontend deployment.
              </div>
            </li>
          </ol>
        </div>

        <div className="rounded-xl border border-m-line bg-m-panel p-3.5 font-mono text-xs space-y-1.5">
          <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-zinc-400">Compiled client config</div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">Client ID</span>
            <span className="text-zinc-700 dark:text-zinc-300 truncate">{config.clientId}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">Redirect URI</span>
            <span className="text-zinc-700 dark:text-zinc-300 truncate">{config.redirectUri}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-400">Client secret</span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {config.hasClientSecret ? `Present (length ${config.clientSecretLength})` : 'Not present'}
            </span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            className="h-9 px-4 rounded-lg border border-m-line text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onDismiss();
              performLogin();
            }}
            className="h-9 px-4 rounded-lg bg-accent text-accent-contrast text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const LandingPage = ({ authError, clearAuthError, supporters, theme, toggleTheme, colorTheme, setColorTheme }) => {
  const [now, setNow] = useState(() => new Date());

  // Easter egg: three clicks on the logo bring back the original four-square mark.
  const [logoClicks, setLogoClicks] = useState(0);
  const [useOriginalMark, setUseOriginalMark] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogoClick = () => {
    setLogoClicks(prev => {
      if (prev + 1 >= 3) {
        setUseOriginalMark(true);
        return 0;
      }
      return prev + 1;
    });
  };

  // The preview's current period loops once an hour off the real clock, so its countdown is always ticking.
  const progress = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
  const minutesLeft = 60 - now.getMinutes();

  const activeTheme = COLOR_THEMES.find(t => t.id === colorTheme) || COLOR_THEMES[0];

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100dvh] overflow-x-hidden bg-m-page text-zinc-900 dark:text-zinc-100 transition-colors duration-500">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[640px] m-dots" />

        <AnimatePresence>
          {authError && <AuthErrorDialog authError={authError} onDismiss={clearAuthError} />}
        </AnimatePresence>

        {/* Header */}
        <header className="relative z-10 mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <button onClick={handleLogoClick} className="flex items-center gap-2.5" aria-label="Synchron">
            {useOriginalMark ? (
              <span className="grid grid-cols-2 gap-0.5 p-1.5 rounded-lg bg-zinc-900 dark:bg-white">
                {[0, 1, 2, 3].map(i => (
                  <span key={i} className={`w-1.5 h-1.5 rounded-[2px] ${i === 3 ? 'bg-accent' : 'bg-white dark:bg-zinc-900'}`} />
                ))}
              </span>
            ) : (
              <BrandMark />
            )}
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white">Synchron</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              aria-label="Toggle colour mode"
              className="w-8 h-8 grid place-items-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18 }}
                  className="grid place-items-center"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </motion.span>
              </AnimatePresence>
            </button>
            <button
              onClick={performLogin}
              className="h-8 px-3.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[13px] font-medium hover:opacity-90 transition-opacity"
            >
              Sign in
            </button>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-5xl px-5 sm:px-6">
          {/* Hero */}
          <motion.section variants={stagger} initial="hidden" animate="show" className="pt-14 sm:pt-24 text-center">
            <motion.div variants={rise} className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-m-line bg-m-card/70 backdrop-blur font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              For Sydney Boys High
            </motion.div>

            <motion.h1 variants={rise} className="mt-6 text-[2.75rem] sm:text-7xl font-semibold leading-[1.02] tracking-[-0.04em] text-zinc-900 dark:text-white">
              Your school day,
              <br />
              <span className="text-zinc-400 dark:text-zinc-500">in sync.</span>
            </motion.h1>

            <motion.p variants={rise} className="mx-auto mt-5 max-w-md text-[15px] sm:text-base leading-relaxed text-zinc-500 dark:text-zinc-400">
              Your timetable, room changes, substitutes and daily notices, live and in one place.
            </motion.p>

            <motion.div variants={rise} className="mt-8 flex flex-col items-center gap-3">
              <motion.button
                onClick={performLogin}
                whileTap={{ scale: 0.97 }}
                className="group inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-medium text-accent-contrast shadow-[0_10px_30px_-10px_hsl(var(--color-accent)/0.7)] hover:opacity-95 transition-opacity"
              >
                Sign in with SBHS
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </motion.button>
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                <Lock size={11} />
                Secure sign-in through the SBHS student portal
              </span>
            </motion.div>
          </motion.section>

          {/* Live preview */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3, ease }}
            className="mx-auto mt-14 sm:mt-20 max-w-xl"
            aria-label="Preview of today's timetable"
          >
            <div className="rounded-2xl border border-m-line bg-m-card p-2 sm:p-3 m-shadow-lg">
              <div className="flex items-center justify-between px-2 pt-1 pb-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                  Monday · Week A
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400">
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                    <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
              </div>
              <div className="space-y-1.5">
                <PreviewPeriod time="9:00" bell="2" title="English" teacher="Ms R" room="203" state="past" />
                <PreviewPeriod
                  time="10:05" bell="3" title="Physics" teacher="Mr H" room="307" state="current"
                  change="sub" note="for Mrs S" progress={progress} minutesLeft={minutesLeft}
                />
                <PreviewPeriod
                  time="11:25" bell="4" title="Design & Technology" teacher="Mr G" room="502" state="next"
                  change="room" note="was 102"
                />
                <PreviewPeriod time="12:30" bell="5" title="Mathematics Ext. 2" teacher="Mr J" room="105" state="later" />
              </div>
            </div>

            {/* Colour themes */}
            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="flex items-center gap-1" role="group" aria-label="Colour theme">
                {COLOR_THEMES.map(t => {
                  const selected = t.id === activeTheme.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setColorTheme(t.id)}
                      aria-label={`${t.name} colour theme`}
                      aria-pressed={selected}
                      title={t.name}
                      className="relative grid place-items-center w-8 h-8 rounded-full"
                    >
                      {selected && (
                        <motion.span
                          layoutId="landing-swatch"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                          className="absolute inset-0 rounded-full border border-zinc-900/20 dark:border-white/25"
                        />
                      )}
                      <span
                        className={`w-5 h-5 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 ${t.swatch || ''}`}
                        style={t.hsl ? { backgroundColor: `hsl(${t.hsl})` } : undefined}
                      />
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-400">
                <span className="text-zinc-600 dark:text-zinc-300">{activeTheme.name}</span>
                {' '}· nine colour themes, light and dark. Your pick carries over when you sign in.
              </p>
            </div>
          </motion.section>

          {/* Features */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease }}
            className="mt-24 sm:mt-32 grid gap-px overflow-hidden rounded-2xl border border-m-line bg-m-line sm:grid-cols-3"
          >
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-m-panel p-6">
                <Icon size={18} className="text-accent" />
                <h3 className="mt-4 text-[15px] font-medium text-zinc-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
              </div>
            ))}
          </motion.section>

          <p className="mx-auto mt-10 flex max-w-md items-start justify-center gap-2 text-center text-xs leading-relaxed text-zinc-400">
            <Info size={13} className="mt-px shrink-0 text-amber-500" />
            <span>
              When you sign in, your browser may ask for <span className="text-zinc-600 dark:text-zinc-300">Local network</span> access.
              Choose <span className="text-zinc-600 dark:text-zinc-300">Allow</span> so Synchron can sync.
            </span>
          </p>

          {supporters && supporters.length > 0 && (
            <p className="mt-16 flex items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Heart size={14} className="fill-rose-500 text-rose-500" />
              Kept running by our Synchron Pro supporters. Thank you.
            </p>
          )}
        </main>

        <footer className="relative z-10 mt-20 border-t border-m-line">
          <div className="mx-auto flex max-w-5xl flex-col gap-1.5 px-5 sm:px-6 py-8 text-xs text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
            <span>© {now.getFullYear()} Synchron</span>
            <span>Unofficially the official client for Sydney Boys High School.</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
};

export default LandingPage;
