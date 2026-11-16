import React, { useEffect, useState } from 'react';

// The light through a day, as [hour, name, three colours]. Between keyframes the colours
// blend, so the glow drifts from one phase to the next rather than switching.
const SKY = [
    [0, 'night', ['#2f4bd1', '#6d4ef0', '#2aa3c9']],
    [5, 'before dawn', ['#3a4fc4', '#8a5cf0', '#3fa3d6']],
    [6.5, 'dawn', ['#ff9eb5', '#ffbf8a', '#b9a4ff']],
    [9, 'morning', ['#7cc8ff', '#8fe8c8', '#ffe08a']],
    [12.5, 'midday', ['#6fb8ff', '#7fe3dc', '#fff0a0']],
    [15.5, 'afternoon', ['#ffb066', '#ff8f7a', '#ffd27a']],
    [18, 'sunset', ['#ff7aa8', '#ff9a57', '#a88bff']],
    [20, 'evening', ['#6a78ff', '#b183ff', '#4fc8c0']],
    [24, 'night', ['#2f4bd1', '#6d4ef0', '#2aa3c9']]
];

// Festive palettes, enabled by admins from December 1: Christmas red & green
// through the 26th, then a New Year's Eve mix of gold, hot pink, silver and
// electric blue through January 6. Same [hour, name, three colours] shape.
const CHRISTMAS_SKY = [
    [0, 'christmas night', ['#7f1d1d', '#14532d', '#991b1b']],
    [5, 'before dawn', ['#9f1239', '#166534', '#b91c1c']],
    [6.5, 'dawn', ['#f87171', '#4ade80', '#dc2626']],
    [9, 'morning', ['#fca5a5', '#86efac', '#ef4444']],
    [12.5, 'midday', ['#ef4444', '#22c55e', '#b91c1c']],
    [15.5, 'afternoon', ['#fb7185', '#34d399', '#dc2626']],
    [18, 'sunset', ['#f43f5e', '#4ade80', '#7f1d1d']],
    [20, 'evening', ['#be123c', '#16a34a', '#991b1b']],
    [24, 'christmas night', ['#7f1d1d', '#14532d', '#991b1b']]
];

const NYE_SKY = [
    [0, 'nye night', ['#1d4ed8', '#db2777', '#92400e']],
    [5, 'before dawn', ['#2563eb', '#ec4899', '#b45309']],
    [6.5, 'dawn', ['#60a5fa', '#f472b6', '#fbbf24']],
    [9, 'morning', ['#38bdf8', '#ff5da2', '#fde047']],
    [12.5, 'midday', ['#0ea5e9', '#ff2e88', '#ffd700']],
    [15.5, 'afternoon', ['#22d3ee', '#ff4fa3', '#facc15']],
    [18, 'sunset', ['#3b82f6', '#ff77b7', '#ffe066']],
    [20, 'evening', ['#2563eb', '#ec489a', '#f59e0b']],
    [24, 'nye night', ['#1d4ed8', '#db2777', '#92400e']]
];

// Which festive palette the calendar calls for right now, if any: Christmas
// Dec 1–26, New Year's Eve Dec 27–Jan 6. The admin's toggle can force the glow
// on outside these dates (see skyAt).
export const festiveThemeAt = (date = new Date()) => {
    const month = date.getMonth();
    const day = date.getDate();
    if (month === 11 && day >= 1 && day <= 26) return 'christmas';
    if ((month === 11 && day >= 27) || (month === 0 && day <= 6)) return 'nye';
    return null;
};

const toRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (from, to, t) => {
    const a = toRgb(from);
    const b = toRgb(to);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`;
};

// The blended colours and the name of the phase for a time of day. Festive
// palettes switch on automatically Dec 1–Jan 6; `festive` (the admin toggle)
// forces them on at any other time, defaulting to the Christmas palette.
export const skyAt = (date = new Date(), festive = false) => {
    const theme = festiveThemeAt(date) || (festive ? 'christmas' : null);
    const table = theme === 'christmas' ? CHRISTMAS_SKY : theme === 'nye' ? NYE_SKY : SKY;
    const hour = date.getHours() + date.getMinutes() / 60;
    const next = table.findIndex(([h]) => h > hour);
    const [h0, name, from] = table[next - 1];
    const [h1, , to] = table[next];
    const t = (hour - h0) / (h1 - h0);
    return { name, colours: from.map((c, i) => mix(c, to[i], t)) };
};

// Re-reads the clock each minute; the CSS eases each colour change over a few seconds.
export const useSky = (festive = false) => {
    const [sky, setSky] = useState(() => skyAt(new Date(), festive));
    useEffect(() => {
        const timer = setInterval(() => setSky(skyAt(new Date(), festive)), 60 * 1000);
        return () => clearInterval(timer);
    }, [festive]);
    return sky;
};

// Three soft, slowly drifting glows in the colours of the current time of day.
// `variant` is "panel" (top of the main panel, fading downwards) or "page" (behind everything).
// `festive` is the admin toggle that forces the seasonal palettes on outside
// their automatic dates (Christmas Dec 1–26, NYE Dec 27–Jan 6).
const AmbientLight = ({ variant = 'panel', style, festive = false }) => {
    const { colours: [a, b, c] } = useSky(festive);
    return (
        <div aria-hidden className={`ambient ambient--${variant}`} style={style}>
            <span className="ambient__blob ambient__blob--a" style={{ '--ambient-a': a }} />
            <span className="ambient__blob ambient__blob--b" style={{ '--ambient-b': b }} />
            <span className="ambient__blob ambient__blob--c" style={{ '--ambient-c': c }} />
        </div>
    );
};

export default AmbientLight;
