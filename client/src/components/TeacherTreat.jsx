import React from 'react';
import { Sparkles } from 'lucide-react';
import { isCelebrationTeacher } from '../utils/timetable';

// A quiet hat-tip for two teachers: a tiny sparkle beside their name that only
// twinkles briefly every few seconds. Renders nothing for anyone else.
export const TeacherTreat = ({ name, className = '' }) => (
    isCelebrationTeacher(name)
        ? <Sparkles size={10} strokeWidth={2} aria-hidden className={`teacher-treat inline-block shrink-0 text-amber-500/60 dark:text-amber-300/60 ${className}`} />
        : null
);
