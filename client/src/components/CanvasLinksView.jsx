import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Link as LinkIcon, Info, ExternalLink, CheckCircle2, Edit2, Save, X, Users, Trash2, Flag, Check, WifiOff } from 'lucide-react';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { describeClass, indexSubjects, subjectInk } from '../utils/timetable';

const SAVED_MESSAGES = {
  shared: 'Saved, and shared with your class',
  not_canvas: 'Saved. Only Canvas or Wellio course links are shared with classmates'
};

const buttonPrimary = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const buttonQuiet = 'inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50';
const buttonFix = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-semibold transition-colors disabled:opacity-50';

const Section = ({ icon: Icon, title, children }) => (
    <section className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2.5">
            <Icon size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
            <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-white">{title}</h2>
        </div>
        <div className="px-5 py-4">
            {children}
        </div>
    </section>
);

const DuplicateBadge = () => (
  <span title="Shared under more than one class" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-semibold tracking-wide">
    <AlertTriangle size={11} /> Duplicate
  </span>
);

const LinkField = ({ url, children }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] px-4 py-2.5 text-zinc-900 dark:text-white hover:border-accent/50 transition-colors"
  >
    <ExternalLink size={14} className="shrink-0 text-zinc-400" />
    <span className="truncate text-[13px]">{url}</span>
    {children}
  </a>
);

const LinkForm = ({ initial, canvasHost, saving, error, onSave, onCancel, submitLabel }) => {
  const [value, setValue] = useState(initial || '');
  const inputRef = useRef(null);
  useEffect(() => { if (initial !== undefined) inputRef.current?.focus(); }, [initial]);

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); onSave(value); }}
      className="space-y-2"
    >
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`https://${canvasHost}/courses/12345`}
          aria-invalid={Boolean(error)}
          className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] px-4 py-2.5 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/60"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={`${buttonPrimary} flex-1 sm:flex-none`}>
            <Save size={13} />
            {saving ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel"
              className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
};

const CanvasLinksView = ({ onBack, timetableData, completeTimetable }) => {
  const { links, community, classes, canvasHost, status, saveLink, removeLink, removeAllLinks, vote } = useCanvasLinks();
  const [editing, setEditing] = useState(null); // class key being edited
  const [fix, setFix] = useState(null); // { key, url } — duplicated link being corrected
  const [busy, setBusy] = useState(null); // class key with a request in flight
  const [errors, setErrors] = useState({}); // class key -> message
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const rows = useMemo(() => {
    const daySubjects = timetableData?.timetable?.subjects;
    const subjectIndex = indexSubjects(completeTimetable);
    return Array.from(classes, ([key, period]) => ({
      key,
      title: period.title,
      year: period.year,
      ...describeClass(period, daySubjects, subjectIndex)
    })).sort((a, b) => a.name.localeCompare(b.name) || String(a.year).localeCompare(String(b.year)));
  }, [classes, timetableData, completeTimetable]);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  const run = async (key, action, onDone) => {
    setBusy(key);
    setErrors(prev => ({ ...prev, [key]: '' }));
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setErrors(prev => ({ ...prev, [key]: result.error }));
      return;
    }
    onDone?.(result);
  };

  const handleSave = (row, value) => run(row.key, () => saveLink(row.title, value, row.year), (result) => {
    setEditing(null);
    setFix(null);
    showToast(SAVED_MESSAGES[result.shared] || 'Saved');
  });

  const handleRemove = (row) => run(row.key, () => removeLink(row.title), () => showToast('Link removed'));

  const savedCount = Object.keys(links).length;
  const handleClearAll = () => {
    if (!window.confirm(`Remove all ${savedCount} saved link${savedCount === 1 ? '' : 's'}? Links classmates shared are not affected.`)) return;
    run('clear-all', () => removeAllLinks(), () => showToast('All links removed'));
  };

  const handleVote = (row, id, value, message) => run(row.key, () => vote(id, value), () => {
    setEditing(null);
    showToast(message);
  });

  // Opens the link form seeded with the duplicated link's URL; saving it
  // shares the corrected course and the server drops the faulty duplicate.
  const handleFix = (row, item) => {
    setFix({ key: row.key, url: item.canvasUrl });
    setEditing(null);
    setErrors(prev => ({ ...prev, [row.key]: '' }));
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to Settings
      </button>

      {/* Hero */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-accent mb-2">
            <LinkIcon size={20} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Canvas links</h1>
        <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Link each class to its Canvas course, and its name opens Canvas from anywhere in the app.
        </p>
      </div>

      <Section icon={Info} title="How it works">
        <div className="space-y-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          <p>
            Open the course in Canvas or Wellio and paste its address, e.g. <code className="font-mono text-[12px] break-all">https://{canvasHost}/courses/12345</code> or <code className="font-mono text-[12px] break-all">https://app.wellioeducation.com/schools/12345</code>, or just the course number.
          </p>
          <p>
            Canvas and Wellio course links are shared anonymously with others in the same class, and used for everyone once a classmate confirms them. Other links stay private to you.
          </p>
        </div>
      </Section>

      {status === 'offline' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-300">
          <WifiOff size={16} className="shrink-0 mt-0.5" />
          <p>Couldn’t reach the server, so these are the links saved on this device. Changes may not save until you’re back online.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <Section icon={LinkIcon} title="Your classes">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">No classes found in your timetable.</p>
        </Section>
      ) : (
        <Section icon={LinkIcon} title="Your classes">
          <ul className="divide-y divide-zinc-900/[0.16] dark:divide-white/[0.16] -mx-5 -my-4">
            {rows.map((row) => {
              // Use the canonical key (year+shortTitle) for all lookups and display.
              const canonicalKey = row.key;
              const personal = links[canonicalKey];
              const entry = community[canonicalKey];
              const classLink = entry?.link && entry.link.myVote !== -1 ? entry.link : null;
              const backed = !classLink ? entry?.suggestions?.find(s => s.myVote === 1) : null;
              const shared = classLink || backed;
              const others = (entry?.suggestions || []).filter(s => s !== backed && s.myVote !== -1);
              const isEditing = editing === canonicalKey;
              const isFixing = fix?.key === canonicalKey;
              const isBusy = busy === canonicalKey;
              const error = errors[canonicalKey];
              // Track which link is active: 'community' or 'personal'
              const [activeSource, setActiveSource] = useState(shared ? 'community' : personal ? 'personal' : null);

              return (
                <li key={row.key} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900 dark:text-white min-w-0">
                      {row.colour && <span aria-hidden className="w-2 h-2 shrink-0 rounded-full subject-fill" {...subjectInk(row.colour)} />}
                      <span className="truncate">{row.key}</span>
                    </div>
                    {!(isEditing || isFixing) && (personal || shared) && (
                      <div className="flex items-center gap-4 shrink-0">
                        <button type="button" disabled={isBusy} aria-label={personal ? 'Edit' : 'Use my own'} title={personal ? 'Edit' : 'Use my own link'} onClick={() => { setFix(null); setEditing(canonicalKey); setErrors(prev => ({ ...prev, [canonicalKey]: '' })); }} className={buttonQuiet}>
                          <Edit2 size={12} /> <span className="hidden sm:inline">{personal ? 'Edit' : 'Use my own'}</span>
                        </button>
                        {personal && (
                          <button type="button" disabled={isBusy} aria-label="Remove" title="Remove" onClick={() => handleRemove(row)} className={buttonQuiet}>
                            <Trash2 size={12} /> <span className="hidden sm:inline">Remove</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing || isFixing || (!personal && !shared) ? (
                    <div className="space-y-3">
                      {isFixing && (
                        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={13} /> This link is shared under another class — paste the right course link to fix it.
                        </p>
                      )}
                      <LinkForm
                        key={isFixing ? 'fix' : isEditing ? 'edit' : 'add'}
                        initial={isFixing ? fix.url : isEditing ? (personal || '') : undefined}
                        canvasHost={canvasHost}
                        saving={isBusy}
                        error={error}
                        submitLabel={isFixing ? 'Fix link' : isEditing ? 'Save' : 'Add link'}
                        onSave={(value) => handleSave(row, value)}
                        onCancel={isEditing || isFixing ? () => { setEditing(null); setFix(null); setErrors(prev => ({ ...prev, [canonicalKey]: '' })); } : null}
                      />
                      {!personal && others.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500">Suggested by classmates</p>
                          {others.map(s => (
                            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <LinkField url={s.canvasUrl}>
                                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{s.confirmations} {s.confirmations === 1 ? 'vote' : 'votes'}</span>
                              </LinkField>
                              <div className="flex flex-wrap items-center gap-3 sm:pl-2">
                                {s.duplicate && <DuplicateBadge />}
                                <button type="button" disabled={isBusy} onClick={() => handleVote(row, s.id, 1, 'Thanks! Using that link')} className={buttonQuiet}>
                                  <Check size={12} /> Use this
                                </button>
                                <button type="button" disabled={isBusy} onClick={() => handleVote(row, s.id, -1, 'Thanks for letting us know')} className={buttonQuiet}>
                                  <Flag size={12} /> Wrong
                                </button>
                                {s.canFixDuplicate && (
                                  <button type="button" disabled={isBusy} onClick={() => handleFix(row, s)} className={buttonFix} title="This link is shared under another class — fix it">
                                    <Edit2 size={12} /> Fix link
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Source toggle when both exist */}
                      {personal && shared && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSource('community')}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                              activeSource === 'community'
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            <Users size={12} className="inline mr-1" /> Community
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveSource('personal')}
                            className={`flex-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                              activeSource === 'personal'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            <Edit2 size={12} className="inline mr-1" /> Your link
                          </button>
                        </div>
                      )}

                      {/* Community link */}
                      {shared && (activeSource === 'community' || !personal) && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-[12px] text-violet-600 dark:text-violet-400 font-semibold">
                            <Users size={12} />
                            Community link
                            {shared.duplicate && <DuplicateBadge />}
                          </div>
                          <LinkField url={shared.canvasUrl} />
                          {shared.canFixDuplicate && (
                            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle size={13} /> This link is shared under another class — it may be in the wrong class. Tap Fix link to correct it.
                            </p>
                          )}
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-zinc-500 dark:text-zinc-400">
                            <span className="inline-flex items-center gap-1.5">
                              {classLink
                                ? (shared.pinned ? 'Set for your class' : `Confirmed by ${shared.confirmations} classmates`)
                                : 'You backed this link. It’s used for your class once a classmate confirms it'}
                            </span>
                            <span className="flex items-center gap-4">
                              {shared.canFixDuplicate && (
                                <button type="button" disabled={isBusy} onClick={() => handleFix(row, shared)} className={buttonFix}>
                                  <Edit2 size={12} /> Fix link
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => (classLink
                                  ? handleVote(row, shared.id, -1, 'Thanks for letting us know')
                                  : handleVote(row, shared.id, 0, 'Removed your vote'))}
                                className={buttonQuiet}
                              >
                                {classLink ? <><Flag size={12} /> Wrong link?</> : <><X size={12} /> Not this one</>}
                              </button>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Personal link */}
                      {personal && (activeSource === 'personal' || !shared) && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[12px] text-blue-600 dark:text-blue-400 font-semibold">
                            <Edit2 size={12} />
                            Your link
                          </div>
                          <LinkField url={personal} />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => { setEditing(canonicalKey); setErrors(prev => ({ ...prev, [canonicalKey]: '' })); }}
                              className={buttonQuiet}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          </div>
                        </div>
                      )}

                      {error && <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {savedCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{savedCount} link{savedCount === 1 ? '' : 's'} saved to your account.</p>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={busy === 'clear-all'}
            className="self-start sm:self-auto text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          >
            {busy === 'clear-all' ? 'Removing…' : 'Remove all links'}
          </button>
        </div>
      )}
      {errors['clear-all'] && <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{errors['clear-all']}</p>}

      {/* Footer */}
      <p className="text-center font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-600">
        Synchron BETA · build {typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__.sha : 'latest'}
      </p>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[13px] font-semibold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}
    </div>
  );
};

export default CanvasLinksView;
