import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ArrowLeft, Link as LinkIcon, Info, ExternalLink, CheckCircle2, Edit2, Save, X, Users, Trash2, Flag, Check, WifiOff } from 'lucide-react';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { describeClass, indexSubjects, subjectInk } from '../utils/timetable';

const SAVED_MESSAGES = {
  shared: 'Saved, and shared with your class',
  not_canvas: 'Saved. Only Canvas or Wellio course links are shared with classmates'
};

const buttonPrimary = 'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const buttonQuiet = 'inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-50';

const LinkField = ({ url, children }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex w-full min-w-0 sm:flex-1 items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
  >
    <ExternalLink size={15} className="shrink-0" />
    <span className="truncate">{url}</span>
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
      <div className="flex flex-col sm:flex-row gap-3">
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
          className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
        />
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className={`${buttonPrimary} flex-1 sm:flex-none`}>
            <Save size={14} />
            {saving ? 'Saving…' : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
};

const CanvasLinksView = ({ onBack, timetableData, completeTimetable }) => {
  const { links, community, classes, canvasHost, status, saveLink, removeLink, vote } = useCanvasLinks();
  const [editing, setEditing] = useState(null); // class key being edited
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
    showToast(SAVED_MESSAGES[result.shared] || 'Saved');
  });

  const handleRemove = (row) => run(row.key, () => removeLink(row.title), () => showToast('Link removed'));

  const handleVote = (row, id, value, message) => run(row.key, () => vote(id, value), () => {
    setEditing(null);
    showToast(message);
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to Settings
      </button>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-xs font-bold uppercase tracking-widest">
            <LinkIcon size={14} /> Canvas Links
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Canvas course links</h1>
          <p className="max-w-2xl text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Link each class to its Canvas course, and its name opens Canvas from anywhere in the app.
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed space-y-1">
            <p>
              Open the course in Canvas or Wellio and paste its address, e.g. <code className="font-mono break-all">https://{canvasHost}/courses/12345</code> or <code className="font-mono break-all">https://app.wellioeducation.com/schools/12345</code>, or just the course number.
            </p>
            <p>
              Canvas and Wellio course links are shared anonymously with others in the same class, and used for everyone once a classmate confirms them. Other links stay private to you.
            </p>
          </div>
        </div>

        {status === 'offline' && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-sm text-amber-800 dark:text-amber-300">
            <WifiOff size={18} className="shrink-0 mt-0.5" />
            <p>Couldn’t reach the server, so these are the links saved on this device. Changes may not save until you’re back online.</p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No classes found in your timetable.
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => {
              const personal = links[row.title];
              const entry = community[row.key];
              const classLink = entry?.link && entry.link.myVote !== -1 ? entry.link : null;
              const backed = !classLink ? entry?.suggestions?.find(s => s.myVote === 1) : null;
              const shared = classLink || backed;
              const others = (entry?.suggestions || []).filter(s => s !== backed && s.myVote !== -1);
              const isEditing = editing === row.key;
              const isBusy = busy === row.key;
              const error = errors[row.key];

              return (
                <li key={row.key} className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white min-w-0">
                      {row.colour && <span aria-hidden className="w-2.5 h-2.5 shrink-0 rounded-full subject-fill" {...subjectInk(row.colour)} />}
                      <span className="truncate">{row.name}</span>
                      {row.name !== row.title && <span className="font-mono text-[11px] font-normal text-zinc-400">{row.title}</span>}
                    </div>
                    {!isEditing && (personal || shared) && (
                      <div className="flex items-center gap-4 shrink-0">
                        <button type="button" disabled={isBusy} aria-label={personal ? 'Edit' : 'Use my own'} title={personal ? 'Edit' : 'Use my own link'} onClick={() => { setEditing(row.key); setErrors(prev => ({ ...prev, [row.key]: '' })); }} className={buttonQuiet}>
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

                  {isEditing || (!personal && !shared) ? (
                    <div className="space-y-3">
                      <LinkForm
                        key={isEditing ? 'edit' : 'add'}
                        initial={isEditing ? (personal || '') : undefined}
                        canvasHost={canvasHost}
                        saving={isBusy}
                        error={error}
                        submitLabel={isEditing ? 'Save' : 'Add link'}
                        onSave={(value) => handleSave(row, value)}
                        onCancel={isEditing ? () => { setEditing(null); setErrors(prev => ({ ...prev, [row.key]: '' })); } : null}
                      />
                      {!personal && others.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Suggested by classmates</p>
                          {others.map(s => (
                            <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <LinkField url={s.canvasUrl}>
                                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">{s.confirmations} {s.confirmations === 1 ? 'vote' : 'votes'}</span>
                              </LinkField>
                              <div className="flex gap-4 sm:pl-2">
                                <button type="button" disabled={isBusy} onClick={() => handleVote(row, s.id, 1, 'Thanks! Using that link')} className={buttonQuiet}>
                                  <Check size={12} /> Use this
                                </button>
                                <button type="button" disabled={isBusy} onClick={() => handleVote(row, s.id, -1, 'Thanks for letting us know')} className={buttonQuiet}>
                                  <Flag size={12} /> Wrong
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : personal ? (
                    <div className="space-y-2">
                      <LinkField url={personal} />
                      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <LinkField url={shared.canvasUrl} />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1.5">
                          <Users size={12} />
                          {classLink
                            ? (shared.pinned ? 'Set for your class' : `Confirmed by ${shared.confirmations} classmates`)
                            : 'You backed this link. It’s used for your class once a classmate confirms it'}
                        </span>
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
                      </div>
                      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-semibold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}
    </div>
  );
};

export default CanvasLinksView;
