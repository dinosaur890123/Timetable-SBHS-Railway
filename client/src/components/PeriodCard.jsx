import React from 'react';
import { MapPin, User as UserIcon, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const getSubjectStyle = (title, isCurrent) => {
    if (isCurrent) {
        return 'bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white';
    }
    return 'bg-zinc-100 text-zinc-850 dark:bg-zinc-900 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800';
};

const PeriodCard = ({ period, bell, isCurrent, isNext, routineIndex, currentMinutes, startMinutes, endMinutes }) => {
  const { title, room, fullTeacher } = period;
  const { time, endTime } = bell;

  const progress = isCurrent && startMinutes && endMinutes 
      ? Math.min(100, Math.max(0, ((currentMinutes - startMinutes) / (endMinutes - startMinutes)) * 100))
      : 0;
  
  const isBreak = bell.bell === "R" || bell.bell === "L" || bell.bell === "RC";
  const isPast = currentMinutes !== -1 && currentMinutes >= endMinutes;

  // Dot styling based on state
  let dotClass = "bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700";
  if (isCurrent) dotClass = "bg-black dark:bg-white border-2 border-white dark:border-zinc-900 ring-4 ring-black/10 dark:ring-white/10";
  else if (isPast) dotClass = "bg-zinc-400 dark:bg-zinc-600 border border-zinc-200 dark:border-zinc-800";
  
  // Icon/Dot size
  const dotSize = isCurrent ? "w-4 h-4" : "w-3 h-3";

  // Break Variant
  if (isBreak) {
     return (
        <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: routineIndex * 0.05 }}
           className={`relative flex items-center gap-6 py-2 ${isPast ? 'opacity-40' : 'opacity-100'}`}
        >
            <div className="w-[60px] md:w-[90px] text-right shrink-0">
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-400">{time}</span>
            </div>
            
            {/* Timeline Dot */}
            <div className="relative z-10 flex items-center justify-center shrink-0 w-6">
                <div className={`transition-all duration-300 rounded-full ${dotSize} ${dotClass}`} />
            </div>

            <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 px-4 py-2 border border-zinc-200 dark:border-zinc-800">
                <span className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                    {bell.bellDisplay}
                </span>
            </div>
        </motion.div>
     );
  }

  const subjectStyle = getSubjectStyle(title, isCurrent);

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: routineIndex * 0.05 }}
      className={`relative flex items-stretch gap-6 py-1 group ${isPast ? 'opacity-65 hover:opacity-100 transition-opacity' : ''}`}
    >
        {/* Time Column */}
        <div className="w-[60px] md:w-[90px] text-right shrink-0 flex flex-col justify-center pt-3">
            <span className={`text-sm font-bold ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-600 dark:text-zinc-400'}`}>{time}</span>
            <span className="text-[10px] font-medium text-zinc-400 mt-0.5">{endTime}</span>
        </div>
        
        {/* Timeline Dot */}
        <div className="relative z-10 flex flex-col items-center shrink-0 w-6 pt-4">
            <div className={`transition-all duration-300 rounded-full ${dotSize} ${dotClass}`} />
        </div>

        {/* Card Content */}
        <div className={`
          flex-1 flex flex-col justify-center relative p-4 border transition-all duration-300 overflow-hidden
          ${isCurrent 
            ? "bg-white dark:bg-zinc-900 border-2 border-black dark:border-white scale-[1.01] z-20" 
            : "bg-white dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/80" 
          }
        `}>
           
           {/* Progress Bar Background for Current */}
           {isCurrent && (
              <div className="absolute top-0 left-0 bottom-0 bg-zinc-100 dark:bg-zinc-800/30 pointer-events-none transition-all duration-1000 ease-linear" style={{ width: `${progress}%` }} />
           )}

           <div className="flex items-center justify-between relative z-10">
               <div className="flex items-center gap-4">
                   {/* Subject Icon / Period Bubble */}
                   <div className={`
                      flex items-center justify-center w-10 h-10 font-bold shrink-0
                      ${subjectStyle}
                      ${!isCurrent && isPast ? 'opacity-60' : ''}
                   `}>
                      {bell.bell}
                   </div>

                   <div className="flex flex-col min-w-0">
                      <h3 className={`text-base font-bold truncate ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-800 dark:text-zinc-200'}`}>
                         {title || "Free Period"}
                      </h3>
                      
                      {/* Details Row */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                         {(room || fullTeacher) && (
                             <>
                                  {room && (
                                       <span className={`flex items-center gap-1 text-xs font-semibold ${isCurrent ? 'text-black dark:text-white' : 'text-zinc-500'}`}>
                                           <MapPin size={12} /> {room}
                                       </span>
                                  )}
                                  {fullTeacher && (
                                       <span className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                                           <UserIcon size={12} /> {fullTeacher}
                                       </span>
                                  )}
                             </>
                         )}
                      </div>
                   </div>
               </div>

               {/* Right Indicators */}
               <div className="flex flex-col items-end gap-2 shrink-0">
                   {isNext && (
                       <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-850 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 animate-pulse">
                           Up Next
                       </span>
                   )}
                   {isCurrent && (
                        <span className="text-xs font-bold text-black dark:text-white flex items-center gap-1 bg-zinc-100 dark:bg-black/50 px-2 py-1 border border-zinc-300 dark:border-zinc-700">
                            <Clock size={12} className="animate-pulse" /> {Math.max(0, endMinutes - currentMinutes)}m left
                        </span>
                   )}
               </div>
           </div>

        </div>
    </motion.div>
  );
};

export default PeriodCard;