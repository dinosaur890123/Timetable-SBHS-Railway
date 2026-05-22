import React from 'react';
import { LayoutGrid, CalendarDays, Newspaper, UserCircle, Settings, Home } from 'lucide-react';

const NavItem = ({ icon: Icon, label, isActive, onClick, isSpecialAdmin }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 border transition-all w-full text-left
      ${isSpecialAdmin ? 'border-2 border-dotted border-orange-500 dark:border-orange-500' : ''}
      ${isActive 
        ? (isSpecialAdmin 
            ? 'bg-zinc-950 text-white font-bold dark:bg-white dark:text-zinc-950 shadow-none' 
            : 'bg-zinc-950 text-white border-zinc-950 font-bold dark:bg-white dark:text-zinc-950 dark:border-white shadow-none') 
        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-transparent'
      }`}
  >
    <Icon size={20} />
    <span className="hidden md:inline">{label}</span>
  </button>
);

const Navigation = ({ currentView, setView, user }) => {
  const isAdmin = user && user.role === 'Admin';

  const items = [
    { id: 'home', icon: Home, label: 'My Synchron'},
    { id: 'timetable', icon: LayoutGrid, label: 'Timetable' },
    { id: 'calendar', icon: CalendarDays, label: 'Calendar' },
    { id: 'notices', icon: Newspaper, label: 'Notices' },
    { id: 'profile', icon: UserCircle, label: 'Profile' },
  ];

  if (isAdmin) {
    items.push({ id: 'admin', icon: Settings, label: 'Admin Panel' });
  }

  return (
    <nav className="fixed bottom-0 left-0 w-full md:relative md:w-64 bg-white dark:bg-zinc-950 border-t md:border-r border-zinc-200 dark:border-zinc-900 md:h-screen z-40">
       <div className="flex md:flex-col justify-around md:justify-start md:gap-2 p-2 md:p-4 h-full">
         <div className="hidden md:flex items-center gap-3 px-4 py-4 mb-4">
             <div className="w-8 h-8 bg-black dark:bg-white flex items-center justify-center">
                 <span className="text-white dark:text-black font-extrabold">S</span>
             </div>
             <span className="text-xl font-bold tracking-tight dark:text-white">Synchron</span>
         </div>

         {items.map(item => (
            <NavItem 
                key={item.id}
                icon={item.icon}
                label={item.label}
                isActive={currentView === item.id}
                onClick={() => setView(item.id)}
                isSpecialAdmin={item.id === 'admin'}
            />
         ))}
       </div>
    </nav>
  );
};

export default Navigation;
