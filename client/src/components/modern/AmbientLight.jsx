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

const toRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (from, to, t) => {
    const a = toRgb(from);
    const b = toRgb(to);
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(' ')})`;
};

// The blended colours and the name of the phase for a time of day.
export const skyAt = (date = new Date()) => {
    const hour = date.getHours() + date.getMinutes() / 60;
    const next = SKY.findIndex(([h]) => h > hour);
    const [h0, name, from] = SKY[next - 1];
    const [h1, , to] = SKY[next];
    const t = (hour - h0) / (h1 - h0);
    return { name, colours: from.map((c, i) => mix(c, to[i], t)) };
};

// Re-reads the clock each minute; the CSS eases each colour change over a few seconds.
export const useSky = () => {
    const [sky, setSky] = useState(() => skyAt());
    useEffect(() => {
        const timer = setInterval(() => setSky(skyAt()), 60 * 1000);
        return () => clearInterval(timer);
    }, []);
    return sky;
};

// Three soft, slowly drifting glows in the colours of the current time of day.
// `variant` is "panel" (top of the main panel, fading downwards) or "page" (behind everything).
const AmbientLight = ({ variant = 'panel', style }) => {
    const { colours: [a, b, c] } = useSky();
    return (
        <div aria-hidden className={`ambient ambient--${variant}`} style={style}>
            <span className="ambient__blob ambient__blob--a" style={{ '--ambient-a': a }} />
            <span className="ambient__blob ambient__blob--b" style={{ '--ambient-b': b }} />
            <span className="ambient__blob ambient__blob--c" style={{ '--ambient-c': c }} />
        </div>
    );
};

export default AmbientLight;
