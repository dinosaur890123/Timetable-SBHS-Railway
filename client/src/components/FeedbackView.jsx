import React, { useState } from 'react';
import { ArrowLeft, Bug, Lightbulb, Mail, Send, Sparkles, CheckCircle2 } from 'lucide-react';
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
      <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
          <ArrowLeft size={14} /> Back to Settings
        </button>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center">
            <CheckCircle2 size={30} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Submitted</p>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mt-2">Thanks for the feedback</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
              Your report has been received. Use the ticket number below if you need to follow up by email or reference this submission later.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ticket Number</p>
              <p className="mt-2 font-mono text-lg font-bold text-zinc-900 dark:text-white">{submittedTicket}</p>
            </div>
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Need to attach media?</p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Email <span className="font-semibold text-zinc-900 dark:text-white">synchron.work@gmail.com</span> and include your ticket number in the subject line.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onBack}
              className="px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              Return to Settings
            </button>
            <button
              onClick={() => {
                setSubmittedTicket(null);
                setCategory('error');
                setSeverity(3);
                setDetails('');
              }}
              className="px-5 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity"
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors">
        <ArrowLeft size={14} /> Back to Settings
      </button>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-widest">
              <Sparkles size={14} /> Feedback
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Tell us what needs attention</h1>
            <p className="max-w-2xl text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Use this form for bugs, rough edges, or feature ideas. Please be detailed: describe what happened, what you expected, the steps that led to it, and anything else that would help reproduce or understand the issue.
            </p>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30 max-w-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              <Mail size={16} className="text-blue-500" />
              Media uploads
            </div>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              If you need to send screenshots or video, submit the form first, then email <span className="font-semibold text-zinc-900 dark:text-white">synchron.work@gmail.com</span> with your ticket number in the subject.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-zinc-900 dark:text-white mb-3">Category</label>
            <div className="grid gap-3 md:grid-cols-2">
              {categoryOptions.map((option) => {
                const Icon = option.icon;
                const selected = category === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    className={`text-left rounded-2xl border p-4 transition-all ${selected
                      ? 'border-black bg-zinc-50 dark:bg-zinc-950 dark:border-white'
                      : 'border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selected ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'}`}>
                        <Icon size={18} />
                      </div>
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-white">{option.label}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{option.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <label className="block text-sm font-semibold text-zinc-900 dark:text-white">Severity</label>
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{severityLabels[severity]}</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
              className="w-full accent-black dark:accent-white"
            />
            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <span>Low</span>
              <span>Critical</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-900 dark:text-white mb-3">Feedback details</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Tell us exactly what happened, what you expected, and any steps to reproduce it..."
              className="w-full min-h-[220px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y"
              required
            />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              The more detail you include, the faster this can be understood and fixed.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-2">
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : <><Send size={16} /> Submit Feedback</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackView;