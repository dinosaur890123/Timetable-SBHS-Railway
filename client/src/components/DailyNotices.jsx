import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { Megaphone, ChevronDown, ChevronUp, Search, X, SearchX, FileText, ExternalLink } from 'lucide-react';
import { motion, MotionConfig } from 'framer-motion';
import { useNoteFlowFonts } from './study/noteflow';

const FILTER_OPTIONS = [
  { value: 'curated', label: 'For you' },
  { value: 'all', label: 'All' },
  { value: '7', label: 'Year 7' },
  { value: '8', label: 'Year 8' },
  { value: '9', label: 'Year 9' },
  { value: '10', label: 'Year 10' },
  { value: '11', label: 'Year 11' },
  { value: '12', label: 'Year 12' },
];

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, ' ');

const PriorityBadge = ({ notice }) => {
  if (notice.isMeeting === 1) {
    return (
      <span className="nf-serif shrink-0 px-2.5 py-1 rounded-md text-[13px] leading-none bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
        Meeting
      </span>
    );
  }
  if (notice.priority >= 4) {
    return (
      <span className="nf-serif shrink-0 px-2.5 py-1 rounded-md text-[13px] leading-none bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
        High priority
      </span>
    );
  }
  return null;
};

const NoticeItem = ({ notice, index }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const contentRef = useRef(null);

  // Only offer "Show more" when the clamp is actually hiding text.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight - el.clientHeight > 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [notice.content, expanded]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03 }}
      className="px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-snug min-w-0">
          {notice.title}
        </h3>
        <PriorityBadge notice={notice} />
      </div>

      <div
        ref={contentRef}
        className={`mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-0 break-words ${expanded ? '' : 'line-clamp-3'}`}
        dangerouslySetInnerHTML={{ __html: notice.content }}
      />

      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="mt-3 h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-m-line bg-m-card text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.04] transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {notice.authorName && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">{notice.authorName}</span>
        </div>
      )}
    </motion.article>
  );
};

const DailyNotices = ({ notices, aiBriefing, user }) => {
  useNoteFlowFonts();
  const baseNotices = notices?.notices || [];
  // The server only returns the AI's ranking ([{index, priority}]); the notices
  // themselves stay client-side. Indices refer to the original array order.
  const allNotices = useMemo(() => {
    const prios = aiBriefing?.priorities;
    const byIndex = Array.isArray(prios) && prios.length > 0
      ? new Map(prios.map(p => [p.index, p.priority ?? 1]))
      : null;
    if (!byIndex) {
      return [...baseNotices].sort((a, b) => (b.isMeeting || 0) - (a.isMeeting || 0));
    }
    return baseNotices
      .map((n, i) => ({ ...n, priority: byIndex.get(i) ?? 1 }))
      .sort((a, b) => b.priority - a.priority);
  }, [baseNotices, aiBriefing]);
  const [filterView, setFilterView] = useState('curated');
  const [query, setQuery] = useState('');

  const displayNotices = useMemo(() => {
    let list = allNotices;
    const year = filterView === 'curated' ? user?.yearGroup : filterView === 'all' ? null : filterView;
    if (year) {
      list = list.filter(n => n.years?.includes('All') || n.years?.includes(String(year)));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(n => `${n.title} ${n.authorName || ''} ${stripHtml(n.content)}`.toLowerCase().includes(q));
    }
    return list;
  }, [allNotices, filterView, user, query]);

  if (allNotices.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-m-line bg-m-card px-6 py-16 text-center">
        <Megaphone size={28} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">No notices today</p>
        <p className="mt-1 text-sm text-zinc-500">Check back tomorrow morning.</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="w-full max-w-3xl mx-auto bg-m-card border border-m-line rounded-2xl overflow-hidden flex flex-col md:h-[calc(100dvh-9rem)]">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-m-line bg-m-panel shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-m-card border border-m-line text-zinc-900 dark:text-white rounded-lg shrink-0">
              <Megaphone size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-white leading-tight">Daily notices</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {displayNotices.length === allNotices.length
                  ? `${allNotices.length} notice${allNotices.length !== 1 ? 's' : ''}`
                  : `Showing ${displayNotices.length} of ${allNotices.length}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href="https://sbhs.co/hnpdf"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-lg bg-m-card border border-m-line text-zinc-700 dark:text-zinc-200 text-xs font-medium hover:bg-zinc-900/[0.03] transition-colors"
              title="View latest High Notes PDF"
            >
              <FileText size={14} />
              <span className="hidden sm:inline">High Notes</span>
              <ExternalLink size={12} className="opacity-60" />
            </a>
            <select
              value={filterView}
              onChange={(e) => setFilterView(e.target.value)}
              aria-label="Filter notices by year"
              className="flex-1 min-w-0 sm:flex-none sm:shrink-0 bg-m-card border border-m-line text-zinc-900 dark:text-white text-sm font-medium h-9 px-3 rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {FILTER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="relative block">
          <span className="sr-only">Search notices</span>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            data-bare
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notices"
            className="w-full h-10 pl-9 pr-9 rounded-lg bg-m-card border border-m-line text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      <div className="flex-1 md:overflow-y-auto custom-scrollbar">
        {displayNotices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <SearchX size={28} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">No matching notices</p>
            <button
              onClick={() => { setQuery(''); setFilterView('all'); }}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              Show all notices
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900/[0.05] dark:divide-white/[0.05]">
            {displayNotices.map((notice, idx) => (
              <NoticeItem key={notice.id ?? `${notice.title}-${idx}`} notice={notice} index={idx} />
            ))}
          </div>
        )}
      </div>
    </div>
    </MotionConfig>
  );
};

export default DailyNotices;
