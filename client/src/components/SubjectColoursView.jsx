import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Palette, RotateCcw } from 'lucide-react';
import {
    SUBJECT_COLOUR_PRESETS,
    applySubjectColourPreset,
    getCustomSubjectColours,
    getKnownSubjectColours,
    setCustomSubjectColour,
} from '../utils/timetable';

const hexToHsl = (hex) => {
    let raw = String(hex || '#3b82f6').replace('#', '');
    if (raw.length === 3) raw = raw.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(raw)) return { h: 217, s: 91, l: 60 };
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hslToHex = (h, s, l) => {
    const sn = s / 100;
    const ln = l / 100;
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    const hn = h / 360;
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(hue2rgb(p, q, hn + 1 / 3))}${toHex(hue2rgb(p, q, hn))}${toHex(hue2rgb(p, q, hn - 1 / 3))}`;
};

const GradientWheel = ({ value, onChange }) => {
    const canvasRef = useRef(null);
    const size = 196;
    const radius = size / 2;
    const hsl = useMemo(() => hexToHsl(value), [value]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        const data = img.data;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - radius;
                const dy = y - radius;
                const dist = Math.hypot(dx, dy);
                const idx = (y * size + x) * 4;
                if (dist > radius) {
                    data[idx + 3] = 0;
                    continue;
                }
                const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                const h = (angle + 360) % 360;
                const s = (dist / radius) * 100;
                const hex = hslToHex(h, s, 55);
                data[idx] = parseInt(hex.slice(1, 3), 16);
                data[idx + 1] = parseInt(hex.slice(3, 5), 16);
                data[idx + 2] = parseInt(hex.slice(5, 7), 16);
                data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }, []);

    const pickAt = (clientX, clientY) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = clientX - rect.left - radius;
        const dy = clientY - rect.top - radius;
        const dist = Math.min(radius, Math.hypot(dx, dy));
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const h = (angle + 360) % 360;
        const s = (dist / radius) * 100;
        onChange(hslToHex(h, s, hsl.l || 55));
    };

    const rad = (hsl.h * Math.PI) / 180;
    const thumbR = (hsl.s / 100) * (radius - 6);
    const thumbX = radius + Math.cos(rad) * thumbR;
    const thumbY = radius + Math.sin(rad) * thumbR;

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative select-none touch-none" style={{ width: size, height: size }}>
                <canvas
                    ref={canvasRef}
                    width={size}
                    height={size}
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        pickAt(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                        if (e.buttons === 1) pickAt(e.clientX, e.clientY);
                    }}
                    className="rounded-full cursor-crosshair block"
                />
                <div
                    className="pointer-events-none absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white shadow-sm ring-1 ring-black/20"
                    style={{ left: thumbX, top: thumbY, backgroundColor: value }}
                />
            </div>
            <div className="w-full max-w-[220px] flex items-center gap-2.5">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Lightness</span>
                <input
                    type="range"
                    min={20}
                    max={88}
                    value={hsl.l}
                    onChange={(e) => onChange(hslToHex(hsl.h, hsl.s, Number(e.target.value)))}
                    aria-label="Colour lightness"
                    className="flex-1 accent-accent cursor-pointer"
                />
            </div>
        </div>
    );
};

const SubjectColoursView = ({ onBack, onColoursChange }) => {
    const [customColours, setCustomColours] = useState(() => getCustomSubjectColours());
    const knownColours = useMemo(() => getKnownSubjectColours(), []);
    const subjectKeys = useMemo(() => Object.keys(knownColours).sort(), [knownColours]);
    const [selectedKey, setSelectedKey] = useState(() => Object.keys(getKnownSubjectColours()).sort()[0] || null);

    const updateAndSync = (next) => {
        setCustomColours(next);
        onColoursChange?.(next);
    };

    const activeColour = selectedKey
        ? (customColours[selectedKey] || knownColours[selectedKey] || '#3b82f6')
        : '#3b82f6';

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
                <ArrowLeft size={14} /> Back to Settings
            </button>

            <div className="space-y-1">
                <div className="flex items-center gap-2 text-accent mb-2">
                    <Palette size={20} strokeWidth={1.6} />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Subject colours</h1>
            </div>

            <section className="rounded-xl border border-zinc-900/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/40 p-4 space-y-3">
                <div className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Presets</div>
                <div className="flex flex-wrap gap-2">
                    {SUBJECT_COLOUR_PRESETS.map(preset => (
                        <button
                            key={preset.id}
                            type="button"
                            onClick={() => updateAndSync(applySubjectColourPreset(preset.id, subjectKeys))}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-zinc-900/10 dark:border-white/10 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.05] text-zinc-800 dark:text-zinc-200 transition"
                        >
                            <span>{preset.name}</span>
                            {preset.colours.length > 0 && (
                                <span className="flex items-center -space-x-1">
                                    {preset.colours.slice(0, 4).map((c, idx) => (
                                        <span
                                            key={idx}
                                            className="w-3 h-3 rounded-full border border-white dark:border-zinc-900"
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </section>

            {subjectKeys.length > 0 ? (
                <section className="rounded-xl border border-zinc-900/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/40 p-4 grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 items-start">
                    <div className="flex flex-col items-center gap-2">
                        <GradientWheel
                            value={activeColour}
                            onChange={(hex) => {
                                if (!selectedKey) return;
                                updateAndSync(setCustomSubjectColour(selectedKey, hex));
                            }}
                        />
                        {selectedKey && (
                            <div className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                                {selectedKey} · {activeColour.toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                        {subjectKeys.map(key => {
                            const colour = customColours[key] || knownColours[key] || '#3b82f6';
                            const isCustom = Boolean(customColours[key]);
                            const isSelected = selectedKey === key;
                            return (
                                <div
                                    key={key}
                                    onClick={() => setSelectedKey(key)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && setSelectedKey(key)}
                                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                                        isSelected
                                            ? 'border-accent bg-accent/[0.06]'
                                            : 'border-zinc-900/[0.06] dark:border-white/[0.06] hover:bg-zinc-900/[0.03] dark:hover:bg-white/[0.03]'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: colour }} />
                                        <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">{key}</span>
                                    </div>
                                    {isCustom && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateAndSync(setCustomSubjectColour(key, null));
                                            }}
                                            title={`Reset ${key} to default`}
                                            aria-label={`Reset ${key} to default`}
                                            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : (
                <div className="rounded-xl border border-zinc-900/[0.08] dark:border-white/[0.08] p-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
                    Open your timetable first so your subjects are loaded.
                </div>
            )}
        </div>
    );
};

export default SubjectColoursView;
