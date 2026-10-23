import React from 'react';
import { Check, Home, LayoutGrid, CalendarDays, Newspaper, Award, Clipboard, GraduationCap, ShieldCheck } from 'lucide-react';

const DefaultPagePicker = ({ defaultPage, isAdmin, onChange }) => {
    const pages = [
        { id: 'home', label: 'My Synchron', icon: Home, description: 'Your personalized dashboard with widgets' },
        { id: 'timetable', label: 'Timetable', icon: LayoutGrid, description: 'View your daily and weekly timetable' },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays, description: 'See calendar events and important dates' },
        { id: 'notices', label: 'Notices', icon: Newspaper, description: 'Daily school notices and announcements' },
        { id: 'awards', label: 'Awards', icon: Award, description: 'Award scheme, badges, and achievements' },
        { id: 'clipboard', label: 'Clipboard', icon: Clipboard, description: 'Training sessions and activities' },
        { id: 'notes', label: 'NoteFlow Lite', icon: GraduationCap, description: 'Your personal study notes' }
    ];

    if (isAdmin) {
        pages.push({ id: 'admin', label: 'Admin Panel', icon: ShieldCheck, description: 'System administration and settings' });
    }

    return (
        <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-3 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl">
            <div className="flex flex-col">
                <span className="text-sm font-bold text-zinc-900 dark:text-white font-space">Default Home Page</span>
                <span className="text-[12px] text-zinc-500 mt-0.5">Choose which page to show when you log in. This setting syncs across all your devices.</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pages.map(page => {
                    const selected = defaultPage === page.id;
                    const Icon = page.icon;
                    return (
                        <button
                            key={page.id}
                            onClick={() => onChange(page.id)}
                            aria-pressed={selected}
                            className={`group p-3 rounded-xl border-2 text-left transition-all ${selected
                                ? 'border-accent bg-accent/[0.04]'
                                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg ${selected ? 'bg-accent text-accent-contrast' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'}`}>
                                        <Icon size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-zinc-900 dark:text-white">{page.label}</span>
                                        </div>
                                        <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{page.description}</p>
                                    </div>
                                </div>
                                <span className={`mt-1 w-4 h-4 shrink-0 rounded-full grid place-items-center transition ${selected ? 'bg-accent text-accent-contrast' : 'border border-zinc-300 dark:border-zinc-700'}`}>
                                    {selected && <Check size={10} strokeWidth={3} />}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default DefaultPagePicker;
