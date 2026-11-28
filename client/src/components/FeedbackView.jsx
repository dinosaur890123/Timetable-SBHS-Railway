import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Bug, Lightbulb, Mail, Send, MessageSquare, CheckCircle2, Paperclip, X } from 'lucide-react';
import { fetchMyFeedback, submitFeedback } from '../services/feedbackApi';

const categoryOptions = [
  {
    value: 'error',
    label: 'Error',
    description: 'Something is broken, misleading, or not working as expected.',
    icon: Bug
  },
  {
    value: 'suggestion',
    label: 'Suggestion',
    description: 'An improvement, feature idea, or other request.',
    icon: Lightbulb
  }
];

const severityLabels = {
  1: 'Low',
  2: 'Minor',
  3: 'Moderate',
  4: 'High',
  5: 'Critical'
};

const Section = ({ icon: Icon, title, children }) => (
    <section className="rounded-2xl border border-zinc-900/[0.07] dark:border-white/[0.07] bg-white/70 dark:bg-white/[0.025] overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-900/[0.06] dark:border-white/[0.06] flex items-center gap-2.5">
            <Icon size={15} strokeWidth={1.8} className="shrink-0 text-accent" />
            <h2 className="text-[13px] font-semibold text-zinc-900 dark:text-white">{title}</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
            {children}
        </div>
    </section>
);

const FieldLabel = ({ children }) => (
    <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 mb-1.5">
        {children}
    </div>
);

const buttonPrimary = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50';
const buttonQuiet = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] text-[13px] font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors';

const feedbackStatus = (status) => {
  if (status === 'implemented' || status === 'resolved') return { label: 'Implemented', colour: 'bg-emerald-500' };
  if (status === 'rejected') return { label: 'Rejected', colour: 'bg-red-500' };
  if (status === 'considering' || status === 'open') return { label: 'Under consideration', colour: 'bg-amber-400' };
  if (status === 'archived') return { label: 'Archived', colour: 'bg-zinc-400' };
  return { label: 'Received', colour: 'bg-zinc-400' };
};

const FEEDBACK_DRAFT_KEY = 'synchron_feedback_draft';

const loadFeedbackDraft = () => {
  try {
    const raw = localStorage.getItem(FEEDBACK_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      category: parsed.category === 'suggestion' ? 'suggestion' : 'error',
      severity: typeof parsed.severity === 'number' && parsed.severity >= 1 && parsed.severity <= 5 ? parsed.severity : 3,
      details: typeof parsed.details === 'string' ? parsed.details : ''
    };
  } catch {
    return null;
  }
};

const FeedbackView = ({ onBack }) => {
  const [initialDraft] = useState(() => loadFeedbackDraft());
  const [category, setCategory] = useState(initialDraft?.category ?? 'error');
  const [severity, setSeverity] = useState(initialDraft?.severity ?? 3);
  const [details, setDetails] = useState(initialDraft?.details ?? '');
  const [attachment, setAttachment] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      if (!details && category === 'error' && severity === 3) {
        localStorage.removeItem(FEEDBACK_DRAFT_KEY);
      } else {
        localStorage.setItem(FEEDBACK_DRAFT_KEY, JSON.stringify({ category, severity, details }));
      }
    } catch {
      // Ignore storage quota or access errors
    }
  }, [category, severity, details]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const [activeTab, setActiveTab] = useState('submit');
  const [myFeedback, setMyFeedback] = useState([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  const openMyFeedback = async () => {
    setActiveTab('mine');
    setFeedbackLoading(true);
    setFeedbackError(null);
    try { setMyFeedback(await fetchMyFeedback()); }
    catch (err) { setFeedbackError(err.message || 'Failed to load your feedback'); }
    finally { setFeedbackLoading(false); }
  };

  const tabs = (
    <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
      <button type="button" onClick={() => setActiveTab('submit')} className={`${buttonQuiet} ${activeTab === 'submit' ? 'border-zinc-900 dark:border-white' : ''}`}>Send feedback</button>
      <button type="button" onClick={openMyFeedback} className={`${buttonQuiet} ${activeTab === 'mine' ? 'border-zinc-900 dark:border-white' : ''}`}>My feedback</button>
    </div>
  );

  if (activeTab === 'mine') {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"><ArrowLeft size={14} /> Back to Settings</button>
        <div className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">My feedback</h1></div>
        {tabs}
        {feedbackError && <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">{feedbackError}</div>}
        {feedbackLoading ? <p className="text-sm text-zinc-500">Loading your feedback...</p> : myFeedback.length ? (
          <div className="space-y-4">{myFeedback.map(entry => {
            const status = feedbackStatus(entry.status);
            return <article key={entry.id} className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.02]">
              <div className={`h-1.5 ${status.colour}`} />
              <div className="p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-900 dark:text-white capitalize">{entry.category}</h2><p className="mt-1 text-xs text-zinc-500">{entry.ticketNumber} | Submitted {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : 'date unavailable'}</p></div><span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{status.label}</span></div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{entry.details}</p>
                {entry.updatedAt && entry.updatedAt !== entry.createdAt && <p className="text-xs text-zinc-500">Updated {new Date(entry.updatedAt).toLocaleDateString()}</p>}
              </div>
            </article>;
          })}</div>
        ) : <p className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-5 py-8 text-center text-sm text-zinc-500">You have not submitted any feedback yet.</p>}
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedDetails = details.trim();

    if (trimmedDetails.length < 20) {
      setDetailsError('Please describe the issue in more detail — include what happened, what you expected, and steps to reproduce.');
      return;
    }

    setDetailsError(null);

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await submitFeedback({
        category,
        severity,
        details: trimmedDetails,
        attachment: attachment instanceof File ? attachment : null
      });

      setSubmittedTicket(response.ticket || response.feedback?.ticketNumber || null);
      setDetails('');
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submittedTicket) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Back to Settings
        </button>

        <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 mb-2">
                <CheckCircle2 size={20} strokeWidth={1.6} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Feedback submitted</h1>
            <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Your report has been received. Use the ticket number below if you need to follow up.
            </p>
        </div>
        {tabs}

        <Section icon={Mail} title="Ticket details">
            <div>
                <FieldLabel>Ticket number</FieldLabel>
                <p className="font-mono text-[15px] font-semibold text-zinc-900 dark:text-white">{submittedTicket}</p>
            </div>
        </Section>

        <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={onBack} className={buttonQuiet}>
                Return to Settings
            </button>
            <button
                onClick={() => {
                    setSubmittedTicket(null);
                    setCategory('error');
                    setSeverity(3);
                    setDetails('');
                }}
                className={buttonPrimary}
            >
                Submit Another
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
      >
        <ArrowLeft size={14} /> Back to Settings
      </button>

      <div className="space-y-1">
        <div className="flex items-center gap-2 text-accent mb-2">
            <MessageSquare size={20} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Feedback</h1>
      </div>
      {tabs}

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
            {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section icon={Bug} title="Category">
            <div className="grid gap-3 sm:grid-cols-2">
                {categoryOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = category === option.value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setCategory(option.value)}
                            className={`text-left rounded-xl border px-4 py-3 transition-colors ${selected
                                ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-white/[0.04]'
                                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.02] hover:border-zinc-400 dark:hover:border-zinc-600'
                            }`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                                    <Icon size={15} strokeWidth={1.8} />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-[13px] font-semibold text-zinc-900 dark:text-white">{option.label}</div>
                                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5">{option.description}</div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </Section>

        <Section icon={Lightbulb} title="Severity">
            <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] font-semibold text-zinc-900 dark:text-white">{severityLabels[severity]}</span>
            </div>
            <input
                type="range"
                min="1"
                max="5"
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
                className="w-full accent-zinc-900 dark:accent-white"
                aria-label="Severity"
            />
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                <span>Low</span>
                <span>Critical</span>
            </div>
        </Section>

        <Section icon={Send} title="Details">
            <div>
                <FieldLabel>Feedback details</FieldLabel>
                <textarea
                    value={details}
                    onChange={(e) => { setDetails(e.target.value); if (detailsError) setDetailsError(null); }}
                    placeholder="Tell us exactly what happened, what you expected, and any steps to reproduce it…"
                    className={`w-full min-h-[160px] rounded-xl border ${detailsError ? 'border-red-400 dark:border-red-600' : 'border-zinc-200 dark:border-zinc-800'} bg-white dark:bg-white/[0.03] px-4 py-3 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/60 resize-y`}
                    required
                />
                {detailsError && (
                    <p className="mt-2 text-[12px] text-red-600 dark:text-red-400 leading-snug">{detailsError}</p>
                )}
            </div>
        </Section>

        <Section icon={Paperclip} title="Attachment (optional)">
            <div>
                <FieldLabel>Screenshot or video — max 10 MB</FieldLabel>
                {attachment ? (
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] px-4 py-3">
                        <Paperclip size={14} className="shrink-0 text-zinc-400" />
                        <span className="text-[13px] text-zinc-700 dark:text-zinc-300 truncate flex-1">{attachment.name}</span>
                        <span className="text-[11px] text-zinc-400 shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
                        <button
                            type="button"
                            onClick={() => { setAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                            aria-label="Remove attachment"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : attachment === 'toobig' ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-[13px] text-zinc-500 space-y-1">
                        <p>File too large to attach. Send it to <span className="font-semibold text-zinc-800 dark:text-zinc-200">synchron.work@gmail.com</span> with your ticket number once submitted.</p>
                        <button type="button" onClick={() => setAttachment(null)} className="text-xs underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Try a different file</button>
                    </div>
                ) : (
                    <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-[13px] text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                        <Paperclip size={14} className="shrink-0" />
                        <span>Choose file…</span>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                            className="sr-only"
                            onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (file && file.size > 10 * 1024 * 1024) {
                                    setAttachment('toobig');
                                    e.target.value = '';
                                    return;
                                }
                                setAttachment(file);
                            }}
                        />
                    </label>
                )}
            </div>
        </Section>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <button type="button" onClick={onBack} className={buttonQuiet}>
                Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className={buttonPrimary}>
                {isSubmitting ? 'Submitting…' : <><Send size={14} /> Submit feedback</>}
            </button>
        </div>
      </form>
    </div>
  );
};

export default FeedbackView;
