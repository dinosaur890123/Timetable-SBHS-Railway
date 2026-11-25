import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import './noteflow.css';

export const NOTEFLOW_URL = 'https://noteflow.study';

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700&family=Instrument+Serif:ital@0;1&display=swap';

export const useNoteFlowFonts = (enabled = true) => {
    useEffect(() => {
        if (!enabled || document.querySelector(`link[href="${FONTS_HREF}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = FONTS_HREF;
        document.head.appendChild(link);
    }, [enabled]);
};

export const EASE = [0.2, 0.7, 0.2, 1];
export const EASE_OUT = [0.16, 1, 0.3, 1];

export const Mark = ({ size = 22 }) => {
    const stroke = size >= 56 ? 2.4 : size >= 32 ? 2.8 : size >= 22 ? 3.3 : 3.7;
    return (
        <svg className="nf-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
                <path d="M40.24 30.14V40.74Q40.24 44.54 36.44 44.54H8.4Q3 44.54 3 39.14V13.34C3 6.58 4.6 3.54 14.68 3.54C18.84 3.54 23.64 7.06 29.24 7.06C32.64 7.06 34.16 5.9 35.12 5.26V20.54" />
                <path d="M35.12 11.74C35.12 10.14 36.16 9.26 37.68 9.26C39.28 9.26 40.16 10.22 40.16 11.9V18.74" />
                <path d="M45.04 20.7C41.6 25.1 38 25.7 34.88 25.7C27.92 25.7 23.6 19.78 19.04 19.78C11.52 19.78 8.08 23.9 8.08 34.1V39.58C9.24 37.86 12.8 35.82 16.2 35.82C21.8 35.82 23.72 39.5 29.92 39.5C31.64 39.5 34.08 38.78 35.12 37.82V30.94" />
            </g>
        </svg>
    );
};

export const Lockup = ({ size = 22 }) => (
    <span className="nf-lockup" style={{ gap: size * 0.35, fontSize: size * 0.82 }}>
        <Mark size={size} />
        <span>NoteFlow</span>
    </span>
);

export const Tick = ({ size = 18 }) => (
    <svg className="nf-doodle" width={size} height={size * 0.875} viewBox="0 0 32 28" aria-hidden="true">
        <path d="M4 15.5C7 17.5 9.5 20.5 11.5 24C15.5 15 21 8.5 28.5 3.5" />
    </svg>
);

let highlightAnimationPlayed = false;

export const hasNoteFlowHighlightAnimationPlayed = () => highlightAnimationPlayed;
export const markNoteFlowHighlightAnimationPlayed = () => { highlightAnimationPlayed = true; };

export const Hl = ({ children, delay = 0, still, display = false }) => {
    const play = !still && !hasNoteFlowHighlightAnimationPlayed();
    useEffect(() => { if (play) markNoteFlowHighlightAnimationPlayed(); }, [play]);
    return (
        <span className={`nf-hl${display ? ' nf-hl--display' : ''}`}>
            <motion.span
                aria-hidden="true"
                className="nf-hl__swipe"
                initial={still || !play ? false : { clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: 'inset(0 0% 0 0)' }}
                transition={{ delay: delay + 0.12, duration: 0.34, ease: EASE }}
            />
            {children}
        </span>
    );
};

const RING = 'M178 13C118 2 38 14 17 57C3 91 40 127 122 130.5C196 133.5 250 110 251 70C252 32 214 10 160 7C130 5.4 104 8 85 13';

export const Ring = ({ delay = 0, still }) => (
    <svg className="nf-ring" viewBox="0 0 260 140" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
            d={RING}
            initial={still ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ delay, duration: 0.7, ease: EASE }}
        />
    </svg>
);

export const Words = ({ text, delay = 0, step = 0.05, still }) => text.split(' ').map((word, i, all) => (
    <React.Fragment key={i}>
        <motion.span
            className="nf-word"
            initial={still ? false : { opacity: 0, y: 6, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: delay + i * step, duration: 0.36, ease: EASE_OUT }}
        >
            {word}
        </motion.span>
        {i < all.length - 1 && ' '}
    </React.Fragment>
));

export const Rise = ({ as = 'div', delay = 0, still, inView = false, y = 10, className, style, children }) => {
    const Tag = motion[as];
    const shown = { opacity: 1, y: 0, filter: 'blur(0px)' };
    return (
        <Tag
            className={className}
            style={style}
            initial={still ? false : { opacity: 0, y, filter: 'blur(6px)' }}
            {...(inView ? { whileInView: shown, viewport: { once: true, amount: 0.25 } } : { animate: shown })}
            transition={{ delay, duration: 0.42, ease: EASE_OUT }}
        >
            {children}
        </Tag>
    );
};
