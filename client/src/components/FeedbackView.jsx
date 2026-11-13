import React, { useState } from 'react';
import { ArrowLeft, Bug, Lightbulb, Mail, Send, MessageSquare, CheckCircle2 } from 'lucide-react';
import { submitFeedback } from '../services/feedbackApi';

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
    description: 'An improvement, feature idea, or workflow request.',
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

const FeedbackView = ({ onBack }) => {
  const [category, setCategory] = useState('error');
  const [severity, setSeverity] = useState(3);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedDetails = details.trim();

    if (trimmedDetails.length < 20) {
      setError('Please describe the issue in more detail. Include what happened, what you expected, and any steps to reproduce.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await submitFeedback({
        category,
        severity,
        details: trimmedDetails
      });

      setSubmittedTicket(response.ticket || response.feedback?.ticketNumber || null);
      setDetails('');
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

        {/* Hero */}
        <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 mb-2">
                <CheckCircle2 size={20} strokeWidth={1.6} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Feedback submitted</h1>
            <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Your report has been received. Use the ticket number below if you need to follow up.
            </p>
        </div>

        <Section icon={Mail} title="Ticket details">
            <div>
                <FieldLabel>Ticket number</FieldLabel>
                <p className="font-mono text-[15px] font-semibold text-zinc-900 dark:text-white">{submittedTicket}</p>
            </div>
            <div>
                <FieldLabel>Attaching media?</FieldLabel>
                <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Email <span className="font-semibold text-zinc-800 dark:text-zinc-200">synchron.work@gmail.com</span> and include your ticket number in the subject line.
                </p>
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

      {/* Hero */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-accent mb-2">
            <MessageSquare size={20} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Feedback</h1>
        <p className="text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Report a bug, a rough edge, or a feature idea. The more detail you include — what happened, what you expected, and the steps to reproduce — the faster it can be understood and fixed.
        </p>
      </div>

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
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="Tell us exactly what happened, what you expected, and any steps to reproduce it…"
                    className="w-full min-h-[160px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-white/[0.03] px-4 py-3 text-[13px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/60 resize-y"
                    required
                />
            </div>
        </Section>

        <Section icon={Mail} title="Media uploads">
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                If you need to send screenshots or video, submit the form first, then email <span className="font-semibold text-zinc-800 dark:text-zinc-200">synchron.work@gmail.com</span> with your ticket number in the subject.
            </p>
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
