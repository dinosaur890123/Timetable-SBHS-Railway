import React from 'react';
import { Check } from 'lucide-react';

// SVG thumbnails (SVG rx isn't affected by the Classic theme's global border-radius reset).
const Preview = ({ id }) => {
    const modern = id === 'modern';
    const r = modern ? 5 : 0;
    return (
        <svg viewBox="0 0 160 96" className="w-full h-auto block" aria-hidden>
            <rect width="160" height="96" rx={modern ? 8 : 0} className="fill-zinc-100 dark:fill-zinc-900" />
            {modern ? (
                <>
                    <rect x="8" y="10" width="26" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-600" />
                    {[24, 34, 44, 54].map((y, i) => (
                        <rect key={y} x="8" y={y} width={i === 0 ? 30 : 24} height="5" rx="2.5" className={i === 0 ? 'fill-accent' : 'fill-zinc-300 dark:fill-zinc-700'} />
                    ))}
                    <rect x="44" y="6" width="110" height="84" rx="7" className="fill-white dark:fill-zinc-800 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
                    <rect x="54" y="16" width="50" height="6" rx="3" className="fill-zinc-800 dark:fill-zinc-200" />
                    <rect x="54" y="30" width="90" height="22" rx={r} className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
                    <rect x="54" y="58" width="42" height="24" rx={r} className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
                    <rect x="102" y="58" width="42" height="24" rx={r} className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
                </>
            ) : (
                <>
                    <rect x="0" y="0" width="22" height="96" className="fill-white dark:fill-black stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
                    <rect x="6" y="8" width="10" height="10" className="fill-zinc-900 dark:fill-white" />
                    {[28, 42, 56, 70].map((y, i) => (
                        <rect key={y} x="5" y={y} width="12" height="9" className={i === 0 ? 'fill-zinc-900 dark:fill-white' : 'fill-zinc-300 dark:fill-zinc-700'} />
                    ))}
                    <rect x="30" y="10" width="60" height="9" className="fill-zinc-900 dark:fill-white" />
                    <rect x="30" y="28" width="122" height="26" className="fill-white dark:fill-black stroke-zinc-900 dark:stroke-zinc-300" strokeWidth="1.5" />
                    <rect x="30" y="60" width="58" height="28" className="fill-accent" />
                    <rect x="94" y="60" width="58" height="28" className="fill-white dark:fill-black stroke-zinc-900 dark:stroke-zinc-300" strokeWidth="1.5" />
                </>
            )}
        </svg>
    );
};

const InterfaceThemePicker = ({ options, value, defaultId, onChange }) => (
    <div className="border border-zinc-200 dark:border-zinc-800 p-4 text-left space-y-3 bg-zinc-50 dark:bg-zinc-950/20 select-none rounded-2xl">
        <div className="flex flex-col">
            <span className="text-sm font-bold text-zinc-900 dark:text-white font-space">Interface</span>
            <span className="text-[11px] text-zinc-500 mt-0.5">Changes layout, navigation and styling. Colours and dark mode carry over.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map(option => {
                const selected = value === option.id;
                return (
                    <button
                        key={option.id}
                        onClick={() => onChange(option.id)}
                        aria-pressed={selected}
                        className={`group p-2 rounded-xl border-2 text-left transition-all ${selected
                            ? 'border-accent bg-accent/[0.04]'
                            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950'
                            }`}
                    >
                        <Preview id={option.id} />
                        <div className="flex items-start justify-between gap-2 px-1 pt-2.5 pb-1">
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white">{option.name}</span>
                                    {option.id === defaultId && (
                                        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-px rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500">Default</span>
                                    )}
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{option.description}</p>
                            </div>
                            <span className={`mt-0.5 w-4 h-4 shrink-0 rounded-full grid place-items-center transition ${selected ? 'bg-accent text-accent-contrast' : 'border border-zinc-300 dark:border-zinc-700'}`}>
                                {selected && <Check size={10} strokeWidth={3} />}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    </div>
);

export default InterfaceThemePicker;
