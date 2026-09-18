import React, { useState, useEffect } from 'react';
import { LayoutGrid, CalendarDays, Newspaper, UserCircle, Home, ShieldCheck, Award, Clipboard, GraduationCap, Bell } from 'lucide-react';

const NavItem = ({ icon: Icon, label, isActive, onClick, isSpecialAdmin, notificationCount, useFixedHeight }) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center md:flex-col gap-1 md:gap-1 px-1 py-3 md:px-2 md:py-1.5 border transition-all ${useFixedHeight ? 'md:h-14' : 'flex-1'} md:w-full md:rounded-xl text-center relative
      ${isSpecialAdmin ? 'border-2 border-dotted border-orange-500 dark:border-orange-500 md:mt-auto' : ''}
      ${isActive 
        ? (isSpecialAdmin 
            ? 'bg-zinc-950 text-white font-bold dark:bg-white dark:text-zinc-950 shadow-none border-orange-500 dark:border-orange-500' 
            : 'bg-zinc-950 text-white border-zinc-950 font-bold dark:bg-white dark:text-zinc-950 dark:border-white shadow-none') 
        : `text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${isSpecialAdmin ? '' : 'border-transparent'}`
      }`}
  >
    <Icon size={18} className="shrink-0" />
    {notificationCount > 0 && (
      <span className="absolute top-1 right-1 md:top-0 md:right-0 bg-red-500 text-white text-[11px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
        {notificationCount > 9 ? '9+' : notificationCount}
      </span>
    )}
    <span className="hidden md:block text-[12px] font-medium leading-tight whitespace-nowrap">{label}</span>
  </button>
);

const Navigation = ({ currentView, setView, user, notificationCount }) => {
  const isAdmin = user && user.role === 'Admin';
  const [useFixedHeight, setUseFixedHeight] = useState(true);

  useEffect(() => {
    const checkScreenHeight = () => {
      // Revert to divide method (stretching) if screen height is too short
      const minHeightForFixed = 600; // pixels
      setUseFixedHeight(window.innerHeight >= minHeightForFixed);
    };

    checkScreenHeight();
    window.addEventListener('resize', checkScreenHeight);
    return () => window.removeEventListener('resize', checkScreenHeight);
  }, []);

  const items = [
    { id: 'home', icon: Home, label: 'My Synchron'},
    { id: 'timetable', icon: LayoutGrid, label: 'Timetable' },
    { id: 'calendar', icon: CalendarDays, label: 'Calendar' },
    { id: 'notices', icon: Newspaper, label: 'Notices' },
    { id: 'awards', icon: Award, label: 'Awards' },
    { id: 'clipboard', icon: Clipboard, label: 'Clipboard' },
    { id: 'notes', icon: GraduationCap, label: 'Study', showNotification: true },
  ];

  if (isAdmin) {
    items.push({ id: 'admin', icon: ShieldCheck, label: 'Admin Panel' });
  }

  return (
    <nav className="fixed bottom-0 left-0 w-full md:sticky md:top-0 md:w-24 bg-white dark:bg-zinc-950 border-t md:border-r border-zinc-200 dark:border-zinc-900 md:h-screen z-40">
       <div className="flex md:flex-col justify-around md:justify-start gap-1 md:gap-3 p-2 md:p-3 h-full w-full">
         <div className="hidden md:flex items-center justify-center py-4 mb-2 shrink-0">
             <div className="w-10 h-10 bg-black dark:bg-white flex items-center justify-center">
                 <img src="/favicon-32x32.png" alt="Synchron" className="w-6 h-6" />
             </div>
         </div>

         {items.map(item => (
            <NavItem 
                key={item.id}
                icon={item.icon}
                label={item.label}
                isActive={currentView === item.id}
                onClick={() => setView(item.id)}
                isSpecialAdmin={item.id === 'admin'}
                notificationCount={item.showNotification ? notificationCount : 0}
                useFixedHeight={useFixedHeight}
            />
         ))}
       </div>
    </nav>
  );
};

export default Navigation;
