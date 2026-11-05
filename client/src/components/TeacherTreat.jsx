import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { isCelebrationTeacher } from '../utils/timetable';

// A quiet hat-tip for two teachers: a small sparkle that twinkles beside their
// name. Renders nothing for anyone else.
export const TeacherTreat = ({ name, className = '' }) => (
    isCelebrationTeacher(name)
        ? <Sparkles size={11} strokeWidth={2.2} aria-hidden className={`teacher-treat inline-block shrink-0 text-amber-500/80 dark:text-amber-300/80 ${className}`} />
        : null
);

// A one-time puff of six dots when a celebration teacher's period starts.
// Mount it only when the period begins; it plays once and is pointer-transparent.
export const TreatBurst = () => {
    const particles = Array.from({ length: 6 }, (_, i) => {
        const angle = (i / 6) * Math.PI * 2 + 0.4;
        return { x: Math.cos(angle) * 16, y: Math.sin(angle) * 16 - 6, delay: i * 0.03 };
    });
    return (
        <span aria-hidden className="absolute inset-0 pointer-events-none overflow-visible">
            {particles.map((p, i) => (
                <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/3 w-1 h-1 rounded-full bg-amber-400 dark:bg-amber-300"
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
                    animate={{ x: p.x, y: p.y, opacity: [0, 0.9, 0], scale: [0.3, 1, 0.5] }}
                    transition={{ duration: 0.8, delay: p.delay, ease: [0.2, 0.8, 0.2, 1] }}
                />
            ))}
        </span>
    );
};
