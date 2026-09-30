import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Bell, BookOpen, Zap, Clock, LayoutGrid, Sparkles } from 'lucide-react';

const WelcomeModal = ({ isOpen, onClose }) => {
    const features = [
        {
            icon: <Calendar size={20} />,
            title: 'Live Timetable',
            description: 'Real-time class schedules with room changes and substitutions'
        },
        {
            icon: <Bell size={20} />,
            title: 'Daily Notices',
            description: 'Filtered school notices tailored to your year group'
        },
        {
            icon: <BookOpen size={20} />,
            title: 'Canvas Links',
            description: 'Quick access to your class Canvas pages directly from timetable'
        },
        {
            icon: <Zap size={20} />,
            title: 'AI Briefing',
            description: 'Smart daily summary powered by artificial intelligence'
        },
        {
            icon: <Clock size={20} />,
            title: 'Transit Widget',
            description: 'Live public transport departures from your chosen stop'
        },
        {
            icon: <LayoutGrid size={20} />,
            title: 'Custom Dashboard',
            description: 'Personalize your home screen with draggable widgets'
        }
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Blurred background overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Central card */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div
                            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="p-8 pb-6">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-violet-100 dark:bg-violet-900/30 rounded-xl">
                                            <Sparkles className="text-violet-600 dark:text-violet-400" size={24} />
                                        </div>
                                        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                            Welcome to your <span className="underline decoration-violet-500 decoration-2 underline-offset-4">Synchro</span>tron.
                                        </h2>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded-lg"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed mb-8">
                                    Your personalized dashboard is ready. Here's what you can do with Synchron:
                                </p>

                                {/* Features Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                                    {features.map((feature, index) => (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className="flex items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                                        >
                                            <div className="p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shrink-0">
                                                <div className="text-violet-600 dark:text-violet-400">
                                                    {feature.icon}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-zinc-900 dark:text-white text-sm mb-1">
                                                    {feature.title}
                                                </h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                                    {feature.description}
                                                </p>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Action button */}
                                <div className="flex justify-end">
                                    <button
                                        onClick={onClose}
                                        className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors text-sm"
                                    >
                                        Get Started
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default WelcomeModal;
