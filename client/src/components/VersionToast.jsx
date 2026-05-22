import React from 'react';
import { RefreshCw, X } from 'lucide-react';

const VersionToast = ({ onUpdate, onClose }) => {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-black text-white px-4 py-3 flex items-center gap-4 border-2 border-white backdrop-blur-md dark:bg-white dark:text-black dark:border-black">
        <div className="bg-zinc-800 p-2 dark:bg-zinc-200">
          <RefreshCw size={20} className="animate-spin-slow" />
        </div>
        <div>
          <p className="font-extrabold text-sm leading-none mb-1 uppercase tracking-wider">New Update Available</p>
          <p className="text-xs text-zinc-300 dark:text-zinc-700 italic">Click update to sync with latest backend</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <button 
            onClick={onUpdate}
            className="bg-white text-black px-4 py-2 text-sm font-extrabold hover:bg-zinc-200 transition-colors border border-black dark:bg-black dark:text-white dark:border-white dark:hover:bg-zinc-800"
          >
            Update
          </button>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 dark:hover:bg-zinc-250 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VersionToast;
