import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { Megaphone, Users, ChevronDown, ChevronUp, Search, X, SearchX } from 'lucide-react';
import { motion, MotionConfig } from 'framer-motion';

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
      <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
        Meeting
      </span>
    );
  }
  if (notice.priority >= 4) {
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
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
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-snug">
          {notice.title}
        </h3>
        <PriorityBadge notice={notice} />
      </div>

      {notice.priorityReason && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
          ✨ {notice.priorityReason}
        </p>
      )}

      <div
        ref={contentRef}
        className={`mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0 prose-ul:my-0 break-words ${expanded ? '' : 'line-clamp-3'}`}
        dangerouslySetInnerHTML={{ __html: notice.content }}
      />

      {(overflows || expanded) && (
        <button
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          className="mt-2 -ml-1 px-1 py-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 flex items-center gap-1 rounded transition-colors"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        {notice.authorName && <span className="font-medium text-zinc-600 dark:text-zinc-300">{notice.authorName}</span>}
        {notice.displayYears && (
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {notice.displayYears}
          </span>
        )}
      </div>
    </motion.article>
  );
};

const DailyNotices = ({ notices, aiBriefing, user }) => {
  const allNotices = aiBriefing && aiBriefing.sortedNotices ? aiBriefing.sortedNotices : (notices?.notices || []);
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
      <div className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-16 text-center">
        <Megaphone size={28} className="mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">No notices today</p>
        <p className="mt-1 text-sm text-zinc-500">Check back tomorrow morning.</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="w-full max-w-3xl mx-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col md:h-[calc(100dvh-9rem)]">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-lg shrink-0">
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

          <select
            value={filterView}
            onChange={(e) => setFilterView(e.target.value)}
            aria-label="Filter notices by year"
            className="shrink-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-sm font-medium h-9 px-3 rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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
            className="w-full h-10 pl-9 pr-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:hidden"
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
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
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
