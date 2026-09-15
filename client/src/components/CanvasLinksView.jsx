import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Link as LinkIcon, Info, ExternalLink, Lock, Flag, CheckCircle2, X } from 'lucide-react';
import { fetchCanvasCourses, setCanvasCourse, reportCanvasCourse } from '../services/api';

const CanvasLinksView = ({ onBack, timetableData, completeTimetable }) => {
  const [courses, setCourses] = useState({}); // className -> { courseId, url, setBy, updatedAt }
  const [drafts, setDrafts] = useState({}); // className -> input value (for unset classes)
  const [savingClass, setSavingClass] = useState(null);
  const [errors, setErrors] = useState({}); // className -> error string
  const [reportingClass, setReportingClass] = useState(null); // className being reported
  const [reportDraft, setReportDraft] = useState({ courseId: '', justification: '' });
  const [reportError, setReportError] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const getClasses = useCallback(() => {
    const classes = new Set();
    
    // Try to get classes from complete timetable first (has all days)
    if (completeTimetable) {
      const timetableStructure = completeTimetable.timetable || completeTimetable;
      
      // Handle different possible structures
      if (timetableStructure?.days) {
        // Structure with days array
        Object.values(timetableStructure.days).forEach(dayData => {
          if (dayData?.periods) {
            Object.values(dayData.periods).forEach(period => {
              if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
                classes.add(period.title);
              }
            });
          }
        });
      } else if (timetableStructure?.periods) {
        // Structure with direct periods
        Object.values(timetableStructure.periods).forEach(period => {
          if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
            classes.add(period.title);
          }
        });
      }
    }
    
    // Fallback to daily timetable if complete timetable didn't yield classes
    if (classes.size === 0 && timetableData) {
      const timetable = timetableData?.timetable;
      const innerTimetable = timetable?.timetable || timetable;
      
      if (innerTimetable?.periods) {
        const periods = innerTimetable.periods;
        Object.values(periods).forEach(period => {
          if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
            classes.add(period.title);
          }
        });
      }
    }
    
    return Array.from(classes).sort();
  }, [timetableData, completeTimetable]);

  const loadCourses = useCallback(async () => {
    try {
      const data = await fetchCanvasCourses();
      setCourses(data?.courses || {});
    } catch (e) {
      console.warn('Failed to load Canvas courses:', e);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSet = async (className) => {
    const value = (drafts[className] || '').trim();
    if (!value) {
      setErrors(prev => ({ ...prev, [className]: 'Enter the Canvas course number' }));
      return;
    }
    setSavingClass(className);
    setErrors(prev => ({ ...prev, [className]: '' }));
    const res = await setCanvasCourse(className, value);
    setSavingClass(null);
    if (res.ok) {
      setCourses(prev => ({ ...prev, [className]: res.course }));
      setDrafts(prev => ({ ...prev, [className]: '' }));
      showToast(`Saved Canvas link for ${className}`);
    } else {
      if (res.alreadySet) {
        // Someone set it just before us — refresh to show the canonical value.
        await loadCourses();
      }
      setErrors(prev => ({ ...prev, [className]: res.error }));
    }
  };

  const openReport = (className) => {
    setReportingClass(className);
    setReportDraft({ courseId: '', justification: '' });
    setReportError('');
  };

  const submitReport = async () => {
    if (!reportingClass) return;
    setReportSubmitting(true);
    setReportError('');
    const res = await reportCanvasCourse(reportingClass, reportDraft.courseId, reportDraft.justification);
    setReportSubmitting(false);
    if (res.ok) {
      setReportingClass(null);
      showToast('Report sent to the developers. Thanks!');
    } else {
      setReportError(res.error);
    }
  };

  const classes = getClasses();

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
            Each class has one shared Canvas course number used by everyone at school. If a class
            has no link yet, you can add it. Once set, it&apos;s locked — if it&apos;s wrong, report it
            and the developers will fix it.
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            Just enter the course number from the Canvas URL —
            e.g. for <code className="font-mono">.../courses/12345</code> enter <code className="font-mono">12345</code>.
          </p>
        </div>

        {classes.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No classes found in your timetable.
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map(className => {
              const course = courses[className];
              const isSet = Boolean(course?.courseId);
              return (
                <div key={className} className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <label className="font-semibold text-zinc-900 dark:text-white">{className}</label>
                    {isSet && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <Lock size={12} /> Shared
                      </span>
                    )}
                  </div>

                  {isSet ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <a
                        href={course.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate"
                      >
                        <ExternalLink size={15} className="shrink-0" />
                        <span className="truncate">Course {course.courseId}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => openReport(className)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors"
                      >
                        <Flag size={14} /> Report wrong link
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={drafts[className] || ''}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [className]: e.target.value }))}
                          placeholder="Canvas course number, e.g. 12345"
                          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleSet(className)}
                          disabled={savingClass === className}
                          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {savingClass === className ? 'Saving...' : 'Set link'}
                        </button>
                      </div>
                      {errors[className] && (
                        <p className="text-sm text-red-600 dark:text-red-400">{errors[className]}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report modal */}
      {reportingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Report wrong link</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{reportingClass}</p>
              </div>
              <button onClick={() => setReportingClass(null)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Correct course number</label>
              <input
                type="text"
                inputMode="numeric"
                value={reportDraft.courseId}
                onChange={(e) => setReportDraft(prev => ({ ...prev, courseId: e.target.value }))}
                placeholder="e.g. 12345"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Why is the current link wrong?</label>
              <textarea
                rows={3}
                value={reportDraft.justification}
                onChange={(e) => setReportDraft(prev => ({ ...prev, justification: e.target.value }))}
                placeholder="e.g. The current link opens last year's course; this one matches our class."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
            </div>

            {reportError && <p className="text-sm text-red-600 dark:text-red-400">{reportError}</p>}

            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setReportingClass(null)}
                className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={reportSubmitting}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                <Flag size={15} /> {reportSubmitting ? 'Sending...' : 'Send report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black text-sm font-semibold shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 size={16} /> {toast}
        </div>
      )}
    </div>
  );
};

export default CanvasLinksView;
