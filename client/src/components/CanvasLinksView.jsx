import React, { useState, useCallback } from 'react';
import { ArrowLeft, Link as LinkIcon, Info, ExternalLink, CheckCircle2, Edit2, Save, X } from 'lucide-react';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import { describeClass, indexSubjects, subjectInk } from '../utils/timetable';

const CanvasLinksView = ({ onBack, timetableData, completeTimetable }) => {
  const { canvasLinks, saveLinks, getLink } = useCanvasLinks();
  const [drafts, setDrafts] = useState({}); // className -> input value
  const [editingClass, setEditingClass] = useState(null); // className being edited
  const [savingClass, setSavingClass] = useState(null);
  const [errors, setErrors] = useState({}); // className -> error string
  const [toast, setToast] = useState('');

  const getClasses = useCallback(() => {
    // Short class code -> one of its periods, so each class can be named and coloured.
    const classes = new Map();
    
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
                if (!classes.has(period.title)) classes.set(period.title, period);
              }
            });
          }
        });
      } else if (timetableStructure?.periods) {
        // Structure with direct periods
        Object.values(timetableStructure.periods).forEach(period => {
          if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
            if (!classes.has(period.title)) classes.set(period.title, period);
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
            if (!classes.has(period.title)) classes.set(period.title, period);
          }
        });
      }
    }
    
    const daySubjects = timetableData?.timetable?.subjects;
    const subjectIndex = indexSubjects(completeTimetable);
    return Array.from(classes, ([title, period]) => ({ title, ...describeClass(period, daySubjects, subjectIndex) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [timetableData, completeTimetable]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSet = async (className) => {
    let value = (drafts[className] || '').trim();
    if (!value) {
      setErrors(prev => ({ ...prev, [className]: 'Enter the Canvas URL' }));
      return;
    }

    // Ensure the link is an absolute URL with protocol so it doesn't navigate relative to synchron.work
    if (!/^https?:\/\//i.test(value)) {
      if (/^(courses\/\d+|\d+$)/i.test(value)) {
        const id = value.replace(/\D/g, '');
        value = `https://canvas.instructure.com/courses/${id}`;
      } else {
        value = `https://${value.replace(/^\/+/, '')}`;
      }
    }

    setSavingClass(className);
    setErrors(prev => ({ ...prev, [className]: '' }));

    try {
      const updatedCourses = { ...canvasLinks, [className]: { url: value } };
      await saveLinks(updatedCourses);
      setDrafts(prev => ({ ...prev, [className]: '' }));
      setEditingClass(null);
      setSavingClass(null);
      showToast(`Saved Canvas link for ${className}`);
    } catch (error) {
      setSavingClass(null);
      console.error('Error setting canvas course:', error);
      setErrors(prev => ({ ...prev, [className]: 'Failed to save link. Please try again.' }));
    }
  };

  const startEdit = (className) => {
    const currentUrl = getLink(className) || '';
    setDrafts(prev => ({ ...prev, [className]: currentUrl }));
    setEditingClass(className);
    setErrors(prev => ({ ...prev, [className]: '' }));
  };

  const cancelEdit = (className) => {
    setEditingClass(null);
    setDrafts(prev => ({ ...prev, [className]: '' }));
    setErrors(prev => ({ ...prev, [className]: '' }));
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
            Add Canvas links for your classes. These links are saved to your account and will be used to
            hyperlink class names throughout the app.
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            Enter the full Canvas URL for each class —
            e.g. <code className="font-mono">https://canvas.instructure.com/courses/12345</code>.
          </p>
        </div>

        {classes.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No classes found in your timetable.
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map(({ title: className, name, colour }) => {
              const hasLink = Boolean(getLink(className));
              const isEditing = editingClass === className;

              return (
                <div key={className} className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <label className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white">
                      {colour && <span aria-hidden className="w-2.5 h-2.5 shrink-0 rounded-full subject-fill" {...subjectInk(colour)} />}
                      {name}
                      {name !== className && <span className="font-mono text-[11px] font-normal text-zinc-400">{className}</span>}
                    </label>
                    {hasLink && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(className)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="url"
                          value={drafts[className] || ''}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [className]: e.target.value }))}
                          placeholder="https://canvas.instructure.com/courses/12345"
                          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleSet(className)}
                          disabled={savingClass === className}
                          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          <Save size={14} />
                          {savingClass === className ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEdit(className)}
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {errors[className] && (
                        <p className="text-sm text-red-600 dark:text-red-400">{errors[className]}</p>
                      )}
                    </div>
                  ) : hasLink ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <a
                        href={getLink(className)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white hover:text-violet-600 dark:hover:text-violet-400 transition-colors truncate"
                      >
                        <ExternalLink size={15} className="shrink-0" />
                        <span className="truncate">{getLink(className)}</span>
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="url"
                          value={drafts[className] || ''}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [className]: e.target.value }))}
                          placeholder="https://canvas.instructure.com/courses/12345"
                          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleSet(className)}
                          disabled={savingClass === className}
                          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          <Save size={14} />
                          {savingClass === className ? 'Saving...' : 'Add link'}
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
