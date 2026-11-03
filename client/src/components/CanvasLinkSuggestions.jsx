import React, { useEffect, useState } from 'react';
import { useCanvasLinks } from '../context/CanvasLinksContext';
import CanvasLinkSuggestionToast from './CanvasLinkSuggestionToast';

const CanvasLinkSuggestions = () => {
    const { suggestions, fetchSuggestions, verifySuggestion, rejectSuggestion, dismissSuggestion, mergeVerifiedLinks } = useCanvasLinks();
    const [userClasses, setUserClasses] = useState([]);
    const [currentSuggestion, setCurrentSuggestion] = useState(null);
    const [hasFetched, setHasFetched] = useState(false);

    // Extract user's classes from localStorage cached timetable
    useEffect(() => {
        try {
            const cachedTimetable = localStorage.getItem('cached_timetable');
            const cachedCompleteTimetable = localStorage.getItem('cached_complete_timetable');

            const classes = new Set();

            if (cachedCompleteTimetable) {
                const completeTimetable = JSON.parse(cachedCompleteTimetable);
                if (completeTimetable?.timetable?.days) {
                    Object.values(completeTimetable.timetable.days).forEach(dayData => {
                        if (dayData?.periods) {
                            Object.values(dayData.periods).forEach(period => {
                                if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
                                    classes.add(period.title);
                                }
                            });
                        }
                    });
                }
            }

            if (cachedTimetable) {
                const timetable = JSON.parse(cachedTimetable);
                if (timetable?.timetable?.timetable?.periods) {
                    Object.values(timetable.timetable.timetable.periods).forEach(period => {
                        if (period.title && period.title !== 'Free Period' && !period.title.toLowerCase().includes('roll call')) {
                            classes.add(period.title);
                        }
                    });
                }
            }

            setUserClasses(Array.from(classes));
        } catch (e) {
            console.warn('Failed to extract classes from cache:', e);
        }
    }, []);

    // Fetch suggestions when we have user classes
    useEffect(() => {
        if (userClasses.length > 0 && !hasFetched) {
            fetchSuggestions(userClasses);
            setHasFetched(true);
        }
    }, [userClasses, hasFetched, fetchSuggestions]);

    // Show first suggestion
    useEffect(() => {
        if (suggestions.length > 0 && !currentSuggestion) {
            setCurrentSuggestion(suggestions[0]);
        }
    }, [suggestions, currentSuggestion]);

    // Handle verification
    const handleVerify = async (suggestionId) => {
        const result = await verifySuggestion(suggestionId);
        if (result.success) {
            setCurrentSuggestion(null);

            // If auto-adopted, merge verified links
            if (result.autoAdopted) {
                await mergeVerifiedLinks(userClasses);
            }
        }
    };

    // Handle rejection
    const handleReject = async (suggestionId) => {
        await rejectSuggestion(suggestionId);
        setCurrentSuggestion(null);
    };

    // Handle dismissal
    const handleDismiss = (suggestionId) => {
        dismissSuggestion(suggestionId);
        setCurrentSuggestion(null);
    };

    if (!currentSuggestion) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] pointer-events-none">
            <CanvasLinkSuggestionToast
                suggestion={currentSuggestion}
                onConfirm={handleVerify}
                onReject={handleReject}
                onDismiss={handleDismiss}
            />
        </div>
    );
};

export default CanvasLinkSuggestions;
