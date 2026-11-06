import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Last line of defence for a page that throws while rendering (a failed chunk
// fetch, bad data, a component bug): shows a retry card instead of blanking the app.
// `resetKey` should identify the page, so switching views starts with a clean slate.
class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('View crashed:', error, info?.componentStack);
    }

    componentDidUpdate(prevProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <AlertTriangle size={22} strokeWidth={1.8} className="text-zinc-400" />
                <p className="text-[15px] font-medium text-zinc-900 dark:text-white">This page didn't load</p>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Something went wrong showing it. Trying again usually fixes it.</p>
                <button
                    type="button"
                    onClick={() => this.setState({ error: null })}
                    className="mt-1 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[13px] font-medium hover:opacity-90 transition-opacity"
                >
                    <RotateCcw size={14} />
                    Try again
                </button>
            </div>
        );
    }
}

export default ErrorBoundary;
