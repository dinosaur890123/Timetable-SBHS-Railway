import React, { useState, useEffect } from 'react';
import { ArrowLeft, Link as LinkIcon, Save, CheckCircle2, Info } from 'lucide-react';
import { fetchCanvasLinks, saveCanvasLinks, fetchSharedCanvasLink } from '../services/api';

const CanvasLinksView = ({ onBack, timetableData }) => {
  const [links, setLinks] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const getClasses = () => {
    if (!timetableData?.timetable?.timetable?.[0]?.periods) return [];
    const periods = timetableData.timetable.timetable[0].periods;
    const classes = new Set();
    Object.values(periods).forEach(period => {
      if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
        classes.add(period.title);
      }
    });
    return Array.from(classes).sort();
  };

  useEffect(() => {
    const initializeLinks = async () => {
      const classes = getClasses();
      const linksMap = {};

      const data = await fetchCanvasLinks();
      if (data && data.links) {
        data.links.forEach(link => {
          linksMap[link.className] = link.canvasUrl;
        });
      }

      for (const className of classes) {
        if (linksMap[className]) continue;
        const shared = await fetchSharedCanvasLink(className);
        if (shared?.link?.canvasUrl) {
          linksMap[className] = shared.link.canvasUrl;
        }
      }

      setLinks(linksMap);
    };

    initializeLinks();
  }, [timetableData]);

  const handleSave = async () => {
    setIsSaving(true);
    await saveCanvasLinks(links);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setIsSaving(false);
  };

  const handlePrefill = async (className) => {
    const data = await fetchSharedCanvasLink(className);
    if (data?.link?.canvasUrl) {
      setLinks(prev => ({ ...prev, [className]: data.link.canvasUrl }));
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
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Add your Canvas links</h1>
          <p className="max-w-2xl text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Enter Canvas URLs for your classes. Links are shared with classmates who have the same class name.
          </p>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            Links are automatically prefilled if a classmate has already added a link for the same class. You can also click "Autofill" to manually fetch shared links.
          </p>
        </div>

        {classes.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No classes found in your timetable.
          </div>
        ) : (
          <div className="space-y-4">
            {classes.map(className => (
              <div key={className} className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 bg-zinc-50 dark:bg-zinc-950/30">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <label className="font-semibold text-zinc-900 dark:text-white">{className}</label>
                  <button
                    type="button"
                    onClick={() => handlePrefill(className)}
                    className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                  >
                    Autofill from shared
                  </button>
                </div>
                <input
                  type="url"
                  value={links[className] || ''}
                  onChange={(e) => setLinks(prev => ({ ...prev, [className]: e.target.value }))}
                  placeholder="https://canvas.instructure.com/courses/..."
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-violet-400"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saved ? <><CheckCircle2 size={16} /> Saved</> : isSaving ? 'Saving...' : <><Save size={16} /> Save Links</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasLinksView;
