import React from 'react';
import { Megaphone, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const DailyNotices = ({ notices, aiBriefing }) => {
  const displayNotices = aiBriefing && aiBriefing.sortedNotices ? aiBriefing.sortedNotices : (notices?.notices || []);
  if (displayNotices.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 p-0 h-fit sticky top-24 overflow-hidden"
    >
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-900/20 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-zinc-900 dark:text-zinc-100">
            <div className="p-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-white">
                <Megaphone size={18} />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight">Daily Notices</h2>
        </div>
      </div>

      <div className="max-h-[calc(100vh-250px)] overflow-y-auto px-2 custom-scrollbar">
        <div className="space-y-3 p-4">
            {displayNotices.map((notice, idx) => (
            <motion.div 
                key={idx} 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className="group p-4 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all border border-zinc-200 dark:border-zinc-850"
            >
                <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-black dark:group-hover:text-white transition-colors leading-snug">
                            {notice.title}
                        </h3>
                        {notice.priorityReason && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                ✨ AI Priority Reason: {notice.priorityReason}
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                        {notice.isMeeting === 1 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white">
                                Meeting
                            </span>
                        )}
                        {notice.priority >= 4 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                High Priority
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="text-xs text-zinc-650 dark:text-zinc-400 leading-relaxed max-w-none line-clamp-4 prose dark:prose-invert prose-p:my-0 prose-ul:my-0" 
                    dangerouslySetInnerHTML={{ __html: notice.content }} 
                />
                
                <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-500 mt-3 pt-3 border-t border-zinc-150 dark:border-zinc-850">
                    <span className="font-semibold text-zinc-600 dark:text-zinc-400">{notice.authorName}</span>
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
