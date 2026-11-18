import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import CanvasLinkSuggestionToast from './CanvasLinkSuggestionToast';

const SHOW_DELAY_MS = 2500;
const MAX_PER_SESSION = 3;

const CanvasLinkSuggestions = ({ disabled = false }) => {
    const { prompts, vote, snooze } = useCanvasLinks();
    const [ready, setReady] = useState(false);
    const [asked, setAsked] = useState(0);
    const current = prompts[0];

    useEffect(() => {
        if (!current || ready) return undefined;
        const timer = setTimeout(() => setReady(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [current, ready]);

    const done = () => {
        setReady(false);
        setAsked(n => n + 1);
    };

    const handleVote = async (value) => {
        const result = await vote(current.id, value);
        if (result.ok) done();
        return result;
    };

    const handleDismiss = () => {
        snooze(current.id);
        done();
    };

    const show = !disabled && ready && current && asked < MAX_PER_SESSION;

    return (
        <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[9999] pointer-events-none">
            <AnimatePresence>
                {show && (
                    <CanvasLinkSuggestionToast
                        key={current.id}
                        suggestion={current}
                        onVote={handleVote}
                        onDismiss={handleDismiss}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default CanvasLinkSuggestions;
