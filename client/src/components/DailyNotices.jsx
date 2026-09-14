import React, { useState, useMemo } from 'react';
import { Megaphone, Calendar, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { motion } from 'framer-motion';

const DailyNotices = ({ notices, aiBriefing, user }) => {
  const allNotices = aiBriefing && aiBriefing.sortedNotices ? aiBriefing.sortedNotices : (notices?.notices || []);
  const [expandedNotices, setExpandedNotices] = useState({});
  const [filterView, setFilterView] = useState('curated');
  
  // Available filter options
  const filterOptions = [
    { value: 'curated', label: 'For You', description: 'Notices relevant to your year' },
    { value: 'all', label: 'All Notices', description: 'View all daily notices' },
    { value: '7', label: 'Year 7', description: 'Year 7 notices' },
    { value: '8', label: 'Year 8', description: 'Year 8 notices' },
    { value: '9', label: 'Year 9', description: 'Year 9 notices' },
    { value: '10', label: 'Year 10', description: 'Year 10 notices' },
    { value: '11', label: 'Year 11', description: 'Year 11 notices' },
    { value: '12', label: 'Year 12', description: 'Year 12 notices' },
  ];

  // Filter notices based on selected view
  const filteredNotices = useMemo(() => {
    if (filterView === 'all') {
      return allNotices;
    }
    
    if (filterView === 'curated') {
      const userYear = user?.yearGroup;
      if (!userYear) return allNotices;
      return allNotices.filter(notice => 
        notice.years?.includes('All') || notice.years?.includes(userYear)
      );
    }
    
    // Filter by specific year
    return allNotices.filter(notice => 
      notice.years?.includes('All') || notice.years?.includes(filterView)
    );
  }, [allNotices, filterView, user]);

  const displayNotices = filteredNotices;
  
  if (allNotices.length === 0) return null;

  const toggleNoticeExpansion = (idx) => {
    setExpandedNotices(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const getPriorityBadge = (notice) => {
    if (notice.isMeeting === 1) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
          Meeting
        </span>
      );
    }
    if (notice.priority >= 4) {
      return (
        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          High Priority
        </span>
      );
    }
    return null;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden h-fit"
    >
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-white rounded-lg">
              <Megaphone size={16} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">Daily Notices</h2>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                {displayNotices.length} of {allNotices.length} notice{allNotices.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="relative">
            <select
              value={filterView}
              onChange={(e) => setFilterView(e.target.value)}
              className="appearance-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-xs font-semibold px-3 py-2 pr-8 rounded-lg cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 dark:focus:ring-zinc-400 transition-all"
            >
              {filterOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <Filter size={12} className="text-zinc-500 dark:text-zinc-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {displayNotices.map((notice, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug flex-1">
                  {notice.title}
                </h3>
                {getPriorityBadge(notice)}
              </div>

              {notice.priorityReason && (
                <div className="mb-2">
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    ✨ {notice.priorityReason}
                  </span>
                </div>
              )}

              <div 
                className={`text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed prose dark:prose-invert prose-p:my-0 prose-ul:my-0 ${expandedNotices[idx] ? '' : 'line-clamp-3'}`}
                dangerouslySetInnerHTML={{ __html: notice.content }}
              />

              <button
                onClick={() => toggleNoticeExpansion(idx)}
                className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mt-2 flex items-center gap-1 transition-colors"
              >
                {expandedNotices[idx] ? (
                  <>
                    <ChevronUp size={12} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    Show more
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-500 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{notice.authorName}</span>
                <span className="flex items-center gap-1 opacity-70">
                  <Calendar size={10} />
                  {notice.displayYears}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default DailyNotices;
