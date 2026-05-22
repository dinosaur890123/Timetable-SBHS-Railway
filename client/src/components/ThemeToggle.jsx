import React from 'react';
import { Sun, Moon } from 'lucide-react';

const ThemeToggle = ({ isDark, toggleTheme }) => {
  return (
    <button
      onClick={toggleTheme}
      className="p-2 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-850 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-all hover:border-black dark:hover:border-white"
      title="Toggle Theme"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
};

export default ThemeToggle;
