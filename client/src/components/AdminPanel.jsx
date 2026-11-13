import React, { useState, useEffect, useRef } from 'react';
import { Link as LinkIcon, Lock, ShieldCheck, AlertCircle, Users, Activity, Settings, Search, MoreVertical, RefreshCw, Trash2, Eye, Edit2, X, Terminal, Radio, MessageSquare, Zap, Info, Database, BarChart3, Sparkles, Brain, MessageCircle, EyeOff, FileCode, Plus, Check, Pin, ExternalLink, Flag, TrendingUp, UserX, CalendarDays, Bell } from 'lucide-react';
import { fetchUsers, fetchAdminStats, deleteUser, clearServerCache, updateUser, fetchLogs, setBroadcast, setMaintenanceMode, promoteUserToAdmin, pruneOldLogs, updateAiConfig, setAiDisabled, fetchAiLogs, clearAiCache, fetchAdminFeedback, updateFeedbackStatus, deleteFeedback, bulkUpdateFeedbackStatus, bulkDeleteFeedback, toggleUserBlacklist, updateHiddenPages, fetchAdminBuildNotes, saveAdminBuildNote, deleteAdminBuildNote, fetchDeletionRequests, updateDeletionRequest, fetchAdminCanvasLinks, setAdminCanvasLinkStatus, deleteAdminCanvasLink, resetAdminCanvasLinkReports, fetchBroadcastHistory } from '../services/adminApi';
import { fetchSystemStatus, isAuthenticated as isSignedIn, performLogin, fetchTimetableQa } from '../services/api';
import AdminCanvasLinks from './AdminCanvasLinks';

const YEAR_GROUPS = ['7', '8', '9', '10', '11', '12', 'Staff', 'Unknown'];

const computeYearRows = (dist = {}) => {
    let maxCount = 1;
    const rows = YEAR_GROUPS.map(yr => {
        let count = 0;
        Object.entries(dist).forEach(([k, v]) => {
            const cleanKey = String(k).toLowerCase().replace(/^0+/, '');
            const cleanYr = yr.toLowerCase();
            if (cleanKey === cleanYr || (yr === 'Staff' && (cleanKey.includes('staff') || cleanKey.includes('admin') || cleanKey === 'st'))) {
                count += v;
            } else if (yr === 'Unknown' && (cleanKey === 'unknown' || cleanKey === 'null' || cleanKey === '')) {
                count += v;
            }
        });
        maxCount = Math.max(maxCount, count);
        return { label: yr, count };
    });
    return rows.map(r => ({ ...r, pct: (r.count / maxCount) * 100 }));
};

const yearLabel = (yr) => yr === 'Staff' ? 'Staff' : yr === 'Unknown' ? 'Unknown' : `Year ${yr}`;

const YearDistribution = ({ dist }) => (
    <div className="space-y-3">
        {computeYearRows(dist).map(({ label, count, pct }) => (
            <div key={label} className="flex items-center gap-3 text-xs font-mono">
                <span className="w-16 shrink-0 text-zinc-500 dark:text-zinc-400">{yearLabel(label)}</span>
                <div className="flex-1 bg-zinc-100 dark:bg-zinc-800/50 h-2.5 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${count > 0 ? Math.max(2, pct) : 0}%` }}
                    />
                </div>
                <span className="w-8 text-right font-bold text-zinc-900 dark:text-white tabular-nums">{count}</span>
            </div>
        ))}
    </div>
);

const PanelHeader = ({ icon: Icon, tone, title, subtitle, children }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4 mb-6">
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${tone}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <h4 className="text-base font-bold text-zinc-900 dark:text-white">{title}</h4>
                {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
            </div>
        </div>
        {children}
    </div>
);

const StatCard = ({ label, value, description, icon: Icon, iconClass, ratio }) => (
    <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
                <p className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1.5 tabular-nums leading-none">{value}</p>
            </div>
            <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconClass}`}>
                <Icon size={18} />
            </div>
        </div>
        {description && <p className="text-xs text-zinc-500 mt-3">{description}</p>}
        {ratio && (
            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 mb-1.5">
                    <span>{ratio.label}</span>
                    <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{ratio.value}</span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, ratio.pct))}%` }}
                    />
                </div>
            </div>
        )}
    </div>
);

const AdminPanel = ({ user, setView, hiddenPages: propHiddenPages, setHiddenPages, timetable, completeTimetable, initialTab = null }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data States
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [aiLogs, setAiLogs] = useState([]);
    const [feedback, setFeedback] = useState([]);
    const [deletionRequests, setDeletionRequests] = useState([]);
    const [canvasReports, setCanvasReports] = useState([]);
    const [canvasReportBusy, setCanvasReportBusy] = useState(null);
    const [currentBroadcast, setCurrentBroadcast] = useState(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState(null);
    const [sessionExpired, setSessionExpired] = useState(false);

    // Broadcast State
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastType, setBroadcastType] = useState('info');
    const [broadcastHistory, setBroadcastHistory] = useState([]);

    const handleToggleMaintenance = async () => {
        if (!stats) return;
        const currentMode = stats.systemStatus === 'Maintenance';
        const targetMode = !currentMode;
        try {
            await setMaintenanceMode(targetMode);
            setStats(prev => prev ? { ...prev, systemStatus: targetMode ? 'Maintenance' : 'Operational' } : null);
            loadData(); // Refresh logs
        } catch (err) {
            alert("Failed to toggle maintenance mode");
        }
    };

    // UI States
    const [activeTab, setActiveTab] = useState('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [logSearchTerm, setLogSearchTerm] = useState('');
    const [aiLogSearchTerm, setAiLogSearchTerm] = useState('');
    const [feedbackSearchTerm, setFeedbackSearchTerm] = useState('');
    const [feedbackStatusFilter, setFeedbackStatusFilter] = useState('open');
    const [deletionStatusFilter, setDeletionStatusFilter] = useState('pending');
    const [resolvingDeletionId, setResolvingDeletionId] = useState(null);
    const [roleFilter, setRoleFilter] = useState('All');
    const [viewingAiLog, setViewingAiLog] = useState(null); // Full log object for modal
    const [viewingFeedback, setViewingFeedback] = useState(null); // Feedback object for detail modal
    const [editingUser, setEditingUser] = useState(null); // User object for edit modal
    const [selectedUsers, setSelectedUsers] = useState(new Set()); // For bulk actions
    const [selectedFeedback, setSelectedFeedback] = useState(new Set()); // For bulk feedback actions
    const [promoteId, setPromoteId] = useState('');
    const [promoting, setPromoting] = useState(false);
    const [isPruningLogs, setIsPruningLogs] = useState(false);
    const [clearingAiCache, setClearingAiCache] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(null);

    // Close user menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            const target = event.target;
            // Check if click is outside all user menu dropdowns
            const menuButton = target.closest('[data-user-menu-button]');
            const menuDropdown = target.closest('[data-user-menu-dropdown]');
            
            if (!menuButton && !menuDropdown) {
                setUserMenuOpen(null);
            }
        };

        if (userMenuOpen !== null) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [userMenuOpen]);

    // Build Notes State
    const [buildNotes, setBuildNotes] = useState([]);
    const [loadingBuildNotes, setLoadingBuildNotes] = useState(false);
    const [noteForm, setNoteForm] = useState({
        id: null,
        version: '',
        title: '',
        content: '',
        author: ''
    });
    const [savingNote, setSavingNote] = useState(false);
    const [noteSuccessMsg, setNoteSuccessMsg] = useState('');

    useEffect(() => {
        if (user && user.role === 'Admin') {
            setIsAuthenticated(true);
        } else {
            setIsAuthenticated(false);
        }
    }, [user]);

    useEffect(() => {
        if (isAuthenticated && initialTab?.tab) setActiveTab(initialTab.tab);
    }, [isAuthenticated, initialTab]);

    const loadData = async () => {
        setLoading(true);
        setApiError(null);

        // Settle every request independently: one slow or failing endpoint must
        // not hold the whole panel on its loading state.
        const results = await Promise.allSettled([
            fetchUsers(),
            fetchAdminStats(),
            fetchLogs(),
            fetchSystemStatus(),
            fetchAiLogs(),
            fetchAdminFeedback(),
            fetchDeletionRequests()
        ]);
        const [usersRes, statsRes, logsRes, systemRes, aiLogsRes, feedbackRes, deletionRes] = results;

        if (usersRes.status === 'fulfilled') setUsers(usersRes.value || []);
        if (statsRes.status === 'fulfilled') setStats(statsRes.value);
        if (logsRes.status === 'fulfilled') setLogs(logsRes.value || []);
        if (aiLogsRes.status === 'fulfilled') setAiLogs(aiLogsRes.value || []);
        if (feedbackRes.status === 'fulfilled') setFeedback(feedbackRes.value || []);
        if (deletionRes.status === 'fulfilled') setDeletionRequests(deletionRes.value || []);
        if (systemRes.status === 'fulfilled') {
            setCurrentBroadcast(systemRes.value?.broadcast || null);
            if (Array.isArray(systemRes.value?.hiddenPages)) {
                setHiddenPagesState(systemRes.value.hiddenPages);
                if (setHiddenPages) setHiddenPages(systemRes.value.hiddenPages);
                localStorage.setItem('hidden_pages', JSON.stringify(systemRes.value.hiddenPages));
            }
        }

        const labels = ['users', 'stats', 'logs', 'system status', 'AI logs', 'feedback', 'deletion requests'];
        const failed = results
            .map((res, i) => (res.status === 'rejected' ? { label: labels[i], reason: res.reason } : null))
            .filter(Boolean);

        if (failed.length) {
            failed.forEach(({ label, reason }) => console.error(`Admin: failed to load ${label}:`, reason));
            // A 401 that survives a token refresh means the SBHS sign-in itself has lapsed.
            const signedOut = !isSignedIn() || failed.some(f => /HTTP 401/.test(f.reason?.message || ''));
            setSessionExpired(signedOut);
            const detail = failed[0].reason?.message || 'Unknown error';
            setApiError(`Failed to load ${failed.map(f => f.label).join(', ')}. ${detail}`);
        } else {
            setSessionExpired(false);
        }

        setLoading(false);
    };

    useEffect(() => {
        if (isAuthenticated) {
            loadData();
        }
    }, [isAuthenticated]);

    const loadBuildNotes = async () => {
        setLoadingBuildNotes(true);
        try {
            const notes = await fetchAdminBuildNotes();
            setBuildNotes(notes || []);
        } catch (err) {
            console.error("Failed to load build notes:", err);
        } finally {
            setLoadingBuildNotes(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && activeTab === 'build-notes') {
            loadBuildNotes();
        }
    }, [isAuthenticated, activeTab]);

    // Shared class links students have reported, shown on the Deletion Requests tab.
    const loadCanvasReports = async () => {
        try {
            const data = await fetchAdminCanvasLinks();
            setCanvasReports((data?.links || [])
                .filter(l => l.reports > 0)
                .sort((a, b) => b.reports - a.reports));
        } catch (err) {
            console.error('Admin: failed to load Canvas link reports:', err);
        }
    };

    useEffect(() => {
        if (isAuthenticated && activeTab === 'notifications') {
            loadCanvasReports();
        }
    }, [isAuthenticated, activeTab]);

    const handleCanvasReportAction = async (link, action) => {
        setCanvasReportBusy(link.id);
        try {
            await action();
            await loadCanvasReports();
        } catch (err) {
            alert(err.message || 'Failed to update link');
        } finally {
            setCanvasReportBusy(null);
        }
    };

    const handleSaveNote = async (e) => {
        e.preventDefault();
        if (!noteForm.version.trim() || !noteForm.title.trim() || !noteForm.content.trim()) {
            alert("Please provide version, title, and content.");
            return;
        }
        setSavingNote(true);
        try {
            await saveAdminBuildNote({
                ...noteForm,
                author: noteForm.author.trim() || user?.name || user?.studentId || 'Dev Team'
            });
            setNoteSuccessMsg(noteForm.id ? 'Build note updated successfully!' : 'Build note published successfully!');
            setNoteForm({ id: null, version: '', title: '', content: '', author: '' });
            await loadBuildNotes();
            setTimeout(() => setNoteSuccessMsg(''), 4000);
        } catch (err) {
            alert(`Failed to save build note: ${err.message}`);
        } finally {
            setSavingNote(false);
        }
    };

    const handleEditNote = (note) => {
        setNoteForm({
            id: note.id,
            version: note.version,
            title: note.title,
            content: note.content,
            author: note.author || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteNote = async (noteId) => {
        if (!window.confirm("Are you sure you want to delete this build note?")) return;
        try {
            await deleteAdminBuildNote(noteId);
            await loadBuildNotes();
        } catch (err) {
            alert(`Failed to delete build note: ${err.message}`);
        }
    };

    const handleResolveDeletionRequest = async (request, status) => {
        const action = status === 'completed'
            ? `delete ALL server-side data for ${request.name} (${request.studentId})? This cannot be undone.`
            : `dismiss the data deletion request from ${request.name} (${request.studentId})?`;
        if (!window.confirm(`Are you sure you want to ${action}`)) return;

        setResolvingDeletionId(request.id);
        try {
            await updateDeletionRequest(request.id, status);
            await loadData();
        } catch (err) {
            alert(err.message || 'Failed to update deletion request');
        } finally {
            setResolvingDeletionId(null);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm("Are you sure you want to delete this user?")) return;

        try {
            await deleteUser(userId);
            setUsers(prev => prev.filter(u => u.id !== userId));
            setSelectedUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });
        } catch (err) {
            alert("Failed to delete user");
        }
    };

    const handleBulkDelete = async () => {
        if (selectedUsers.size === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedUsers.size} selected users? This cannot be undone.`)) return;

        setLoading(true);
        try {
            // Delete sequentially to avoid overwhelming the server
            for (const userId of selectedUsers) {
                try {
                    await deleteUser(userId);
                } catch (e) {
                    console.error(`Failed to delete ${userId}`, e);
                }
            }
            setUsers(prev => prev.filter(u => !selectedUsers.has(u.id)));
            setSelectedUsers(new Set());
            alert("Bulk deletion completed.");
        } catch (err) {
            alert("Error during bulk delete");
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
        } else {
            setSelectedUsers(new Set());
        }
    };

    const toggleSelectUser = (userId) => {
        setSelectedUsers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(userId)) newSet.delete(userId);
            else newSet.add(userId);
            return newSet;
        });
    };

    const handleUpdateRole = async (e) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            // Collect form data
            const formData = new FormData(e.target);
            const updates = {
                role: formData.get('role')
            };

            await updateUser(editingUser.id, updates);

            // Update local state
            setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...updates } : u));
            setEditingUser(null);
        } catch (err) {
            alert("Failed to update user");
        }
    };

    const handlePromoteUser = async (e) => {
        e.preventDefault();
        if (!promoteId.trim()) return;

        setPromoting(true);
        try {
            await promoteUserToAdmin(promoteId.trim());
            alert(`Successfully promoted student ${promoteId.trim()} to Admin!`);
            setPromoteId('');
            loadData(); // Reload users
        } catch (err) {
            alert(err.message || "Failed to promote user to Admin");
        } finally {
            setPromoting(false);
        }
    };

    const handleClearLocalCache = () => {
        // Clear everything except admin session
        const adminAuth = sessionStorage.getItem('sbhs_auth_state');
        localStorage.clear();
        if (adminAuth) sessionStorage.setItem('sbhs_auth_state', adminAuth);
        alert("Local cache cleared.");
    };

    const handleClearServerCache = async () => {
        try {
            await clearServerCache();
            alert("Server cache cleared.");
        } catch (err) {
            alert("Failed to clear server cache.");
        }
    };

    const handleClearAiCache = async () => {
        if (!window.confirm("Are you sure you want to clear the AI briefing cache? This will force a new generation on the next student access.")) return;
        setClearingAiCache(true);
        try {
            await clearAiCache();
            alert("AI cache cleared successfully.");
            loadData();
        } catch (err) {
            alert("Failed to clear AI cache.");
        } finally {
            setClearingAiCache(false);
        }
    };



    const handlePruneOldLogs = async () => {
        if (!window.confirm("Are you sure you want to prune old logs? This will delete all audit/system logs older than 30 days.")) return;
        setIsPruningLogs(true);
        try {
            const res = await pruneOldLogs();
            alert(`Pruning complete. Removed ${res.count} old log entries.`);
            loadData();
        } catch (err) {
            alert("Failed to prune old logs.");
        } finally {
            setIsPruningLogs(false);
        }
    };

    const toggleSelectFeedback = (fbId) => {
        setSelectedFeedback(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fbId)) newSet.delete(fbId);
            else newSet.add(fbId);
            return newSet;
        });
    };

    const toggleSelectAllFeedback = (filteredFb) => {
        const allFilteredIds = filteredFb.map(f => f.id);
        const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedFeedback.has(id));
        if (allSelected) {
            setSelectedFeedback(prev => {
                const newSet = new Set(prev);
                allFilteredIds.forEach(id => newSet.delete(id));
                return newSet;
            });
        } else {
            setSelectedFeedback(prev => {
                const newSet = new Set(prev);
                allFilteredIds.forEach(id => newSet.add(id));
                return newSet;
            });
        }
    };

    const handleBulkUpdateFeedbackStatus = async (status) => {
        if (selectedFeedback.size === 0) return;
        setLoading(true);
        try {
            const idsArray = Array.from(selectedFeedback);
            await bulkUpdateFeedbackStatus(idsArray, status);
            setFeedback(prev => prev.map(item => idsArray.includes(item.id) ? { ...item, status, updatedAt: new Date().toISOString() } : item));
            setSelectedFeedback(new Set());
        } catch (err) {
            alert("Failed to update status for selected feedback");
        } finally {
            setLoading(false);
        }
    };

    const handleBulkDeleteFeedback = async () => {
        if (selectedFeedback.size === 0) return;
        setLoading(true);
        try {
            const idsArray = Array.from(selectedFeedback);
            await bulkDeleteFeedback(idsArray);
            setFeedback(prev => prev.filter(item => !idsArray.includes(item.id)));
            setSelectedFeedback(new Set());
        } catch (err) {
            alert("Failed to delete selected feedback");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleBlacklist = async (userId, currentBlacklisted) => {
        const action = currentBlacklisted ? 'unblacklist' : 'blacklist';
        if (!window.confirm(`Are you sure you want to ${action} this user? This will ${currentBlacklisted ? 'restore their access' : 'block their access to the application'}.`)) return;

        try {
            await toggleUserBlacklist(userId, !currentBlacklisted);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, blacklisted: !currentBlacklisted } : u));
        } catch (err) {
            alert(`Failed to ${action} user`);
        }
    };

    const [updatingConfig, setUpdatingConfig] = useState(false);
    const [customModelName, setCustomModelName] = useState('');
    const [enteringCustomModel, setEnteringCustomModel] = useState(false);

    // Admin-only Sage tester: works even while AI is disabled for students.
    const [sageQuestion, setSageQuestion] = useState('');
    const [sageAnswer, setSageAnswer] = useState('');
    const [sageLoading, setSageLoading] = useState(false);

    const handleAskSage = async (e) => {
        e.preventDefault();
        if (!sageQuestion.trim() || sageLoading) return;
        setSageLoading(true);
        setSageAnswer('');
        try {
            const now = new Date();
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            const data = await fetchTimetableQa(sageQuestion.trim(), timetable, currentMinutes, completeTimetable);
            setSageAnswer(data.answer || "Couldn't generate an answer. Please try again.");
        } catch (err) {
            console.error("Admin Sage test failed:", err);
            setSageAnswer("Couldn't reach Sage. Please check your network and try again.");
        } finally {
            setSageLoading(false);
        }
    };

    // Hidden pages state (localStorage-based)
    const [availablePages] = useState([
        { id: 'home', label: 'My Synchron' },
        { id: 'timetable', label: 'Timetable' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'notices', label: 'Notices' },
        { id: 'awards', label: 'Awards' },
        { id: 'clipboard', label: 'Clipboard' },
        { id: 'notes', label: 'Noteflow' },
        { id: 'feedback', label: 'Feedback' },
        { id: 'canvas-links', label: 'Canvas Links' }
    ]);
    const [hiddenPages, setHiddenPagesState] = useState(() => {
        if (Array.isArray(propHiddenPages) && propHiddenPages.length > 0) return propHiddenPages;
        try {
            const stored = localStorage.getItem('hidden_pages');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (Array.isArray(propHiddenPages)) {
            setHiddenPagesState(propHiddenPages);
        }
    }, [propHiddenPages]);

    useEffect(() => {
        if (stats?.aiModel) {
            setCustomModelName(stats.aiModel);
        }
    }, [stats?.aiModel]);

    const modelOptions = stats?.aiProvider === 'gemini'
        ? (stats?.availableGeminiModels || [])
        : (stats?.availableHackClubModels || []);
    const showModelInput = enteringCustomModel || (!!customModelName && !modelOptions.includes(customModelName));

    const handleProviderChange = async (e) => {
        const selectedProvider = e.target.value;
        const defaultModel = selectedProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-32b';
        setEnteringCustomModel(false);
        setUpdatingConfig(true);
        try {
            await updateAiConfig(selectedProvider, defaultModel);
            setStats(prev => prev ? { ...prev, aiProvider: selectedProvider, aiModel: defaultModel } : null);
            alert(`AI provider updated to ${selectedProvider} with default model ${defaultModel}`);
            loadData();
        } catch (err) {
            alert("Failed to update AI provider configuration.");
        } finally {
            setUpdatingConfig(false);
        }
    };

    const handleModelSave = async () => {
        const modelToSave = customModelName.trim();
        if (!modelToSave) return;
        setUpdatingConfig(true);
        try {
            await updateAiConfig(stats?.aiProvider || 'hackclub', modelToSave);
            setStats(prev => prev ? { ...prev, aiModel: modelToSave } : null);
            alert(`AI briefing model updated to ${modelToSave}`);
            loadData();
        } catch (err) {
            alert("Failed to update AI briefing model.");
        } finally {
            setUpdatingConfig(false);
        }
    };

    const handleToggleAiDisabled = async () => {
        const target = !stats?.aiDisabled;
        setUpdatingConfig(true);
        try {
            await setAiDisabled(target);
            setStats(prev => prev ? { ...prev, aiDisabled: target } : null);
            loadData();
        } catch (err) {
            alert("Failed to update AI status.");
        } finally {
            setUpdatingConfig(false);
        }
    };

    const handleModelKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleModelSave();
        }
    };

    const handleToggleHiddenPage = async (pageId) => {
        const newHiddenPages = hiddenPages.includes(pageId)
            ? hiddenPages.filter(id => id !== pageId)
            : [...hiddenPages, pageId];

        setHiddenPagesState(newHiddenPages);
        localStorage.setItem('hidden_pages', JSON.stringify(newHiddenPages));
        if (setHiddenPages) {
            setHiddenPages(newHiddenPages);
        }
        try {
            await updateHiddenPages(newHiddenPages);
        } catch (err) {
            console.error("Failed to update hidden pages on server:", err);
            alert("Failed to save hidden pages to server");
        }
    };

    const handleExportCSV = () => {
        const headers = ['ID', 'Name', 'Email', 'Role', 'Year', 'Status', 'Joined'];
        const csvContent = [
            headers.join(','),
            ...filteredUsers.map(u => [
                u.id,
                `"${u.name || ''}"`,
                `"${u.email || ''}"`,
                u.role,
                u.year || '',
                u.status,
                u.joined ? new Date(u.joined).toLocaleDateString() : ''
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const loadBroadcastHistory = async () => {
        try {
            const data = await fetchBroadcastHistory();
            setBroadcastHistory(data?.notifications || []);
        } catch (err) {
            console.error('Admin: failed to load broadcast history:', err);
        }
    };

    useEffect(() => {
        if (isAuthenticated && activeTab === 'broadcast') {
            loadBroadcastHistory();
        }
    }, [isAuthenticated, activeTab]);

    const handleBroadcast = async (e) => {
        e.preventDefault();
        try {
            await setBroadcast(broadcastMsg, broadcastType);
            alert("Broadcast updated successfully!");
            setBroadcastMsg('');
            loadData(); // Refresh logs
            loadBroadcastHistory();
        } catch (err) {
            alert("Failed to set broadcast");
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              user.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'All' || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const filteredLogs = logs.filter(log => 
        log.action?.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
        log.user?.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
        log.details?.toLowerCase().includes(logSearchTerm.toLowerCase())
    );

    const filteredAiLogs = aiLogs.filter(log => {
        const term = aiLogSearchTerm.toLowerCase();
        const studentName = users.find(u => String(u.id) === String(log.studentId))?.name || '';
        return (
            String(log.studentId || '').toLowerCase().includes(term) ||
            studentName.toLowerCase().includes(term) ||
            String(log.question || '').toLowerCase().includes(term) ||
            String(log.model || '').toLowerCase().includes(term) ||
            String(log.provider || '').toLowerCase().includes(term)
        );
    });

    const growthData = stats?.growthData || [];
    const totalSignups = growthData.reduce((sum, d) => sum + (d.count || 0), 0);
    const avgSignupsPerDay = growthData.length ? (totalSignups / growthData.length).toFixed(1) : '0';
    const weekActive = stats?.activeThisWeek || 0;
    const inactiveCount = stats?.totalUsers ? Math.max(0, stats.totalUsers - weekActive) : 0;

    const filteredFeedback = feedback.filter(fb => {
        const term = feedbackSearchTerm.toLowerCase();
        const matchesSearch =
            fb.ticketNumber?.toLowerCase().includes(term) ||
            fb.details?.toLowerCase().includes(term) ||
            fb.name?.toLowerCase().includes(term) ||
            fb.email?.toLowerCase().includes(term) ||
            fb.studentId?.toLowerCase().includes(term);
        const matchesStatus = feedbackStatusFilter === 'All' || fb.status === feedbackStatusFilter;
        return matchesSearch && matchesStatus;
    });


    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            title={label}
            aria-label={label}
            className={`admin-tab-btn flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-lg whitespace-nowrap
        ${activeTab === id
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                }`}
        >
            <Icon size={16} />
            <span className="hidden sm:inline">{label}</span>
        </button>
    );

    if (!isAuthenticated) {
        return (
            <div className="min-h-[50vh] flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-xl text-center">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold dark:text-white mb-2">Access Denied</h2>
                    <p className="text-zinc-500 mb-6">
                        Your account ({user?.studentId || 'Unknown'}) is not authorized to view this area.
                    </p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-green-500" />
                        Admin Dashboard
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-1">
                        Manage users and system settings
                    </p>
                </div>
                <button
                    onClick={loadData}
                    disabled={loading}
                    className="shrink-0 flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-900/10 dark:border-white/10 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">Refresh</span>
                </button>
            </header>

            <nav className="admin-tabs-container flex flex-wrap gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-1.5">
                <TabButton id="overview" label="Overview" icon={Activity} />
                <TabButton id="users" label="Users" icon={Users} />
                <TabButton id="analytics" label="Analytics" icon={BarChart3} />
                <TabButton id="broadcast" label="Broadcast" icon={MessageSquare} />
                <TabButton id="feedback" label="Feedback" icon={MessageCircle} />
                <TabButton id="notifications" label="Deletion Requests" icon={Trash2} />
                <TabButton id="build-notes" label="Build Notes" icon={FileCode} />
                <TabButton id="canvas-links" label="Canvas Links" icon={LinkIcon} />
                <TabButton id="settings" label="Settings" icon={Settings} />
                {hiddenPages.length > 0 && <TabButton id="hidden-pages" label="Hidden Pages" icon={EyeOff} />}
            </nav>

            {apiError && (sessionExpired ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-xl flex flex-wrap items-center gap-3">
                    <AlertCircle size={20} />
                    <span className="flex-1">Your SBHS sign-in has expired, so the admin data can't load. Sign in again to continue.</span>
                    <button
                        onClick={() => performLogin()}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                        Sign in again
                    </button>
                </div>
            ) : (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl flex items-center gap-3">
                    <AlertCircle size={20} />
                    {apiError}
                </div>
            ))}

        {activeTab === 'overview' && (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Total Users"
                        value={loading ? '…' : (stats?.totalUsers || users.length || 0)}
                        description={stats?.systemStatus === 'Maintenance' ? 'Maintenance mode active' : 'Registered accounts'}
                        icon={Users}
                        iconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                    />
                    <StatCard
                        label="System Status"
                        value={loading ? '…' : (stats?.systemStatus || 'Operational')}
                        description={`Uptime: ${stats ? Math.floor(stats.uptime / 60) + 'm' : '0m'}`}
                        icon={Activity}
                        iconClass={stats?.systemStatus === 'Maintenance'
                            ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'}
                    />
                    <StatCard
                        label="Server Load"
                        value={stats ? Math.round(stats.memoryUsage / 1024 / 1024) : 0}
                        description="MB of memory in use"
                        icon={Zap}
                        iconClass="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                    />
                    <StatCard
                        label="Active Sessions"
                        value={loading ? '…' : (stats?.activeSessions || 0)}
                        description="Currently signed in"
                        icon={Radio}
                        iconClass="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
                    />
                </div>

        {/* System Diagnostics & Year Distribution Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* System Diagnostics & Connection Checks */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 font-mono text-xs rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                    <PanelHeader
                        icon={ShieldCheck}
                        tone="bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                        title="System Health & Diagnostics"
                        subtitle="Postgres config, connection, and runtime info"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Postgres Configured</span>
                            <span className={`font-bold ${stats?.databaseConfigured ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {stats?.databaseConfigured ? 'YES' : 'NO'}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Database Connection</span>
                            <span className={`font-bold ${stats?.databaseStatus === 'Online' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {stats?.databaseStatus || 'UNKNOWN'}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Active Administrators</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {stats?.adminCount || 0}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Node.js Version</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {stats?.nodeVersion || 'UNKNOWN'}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Server Platform</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {stats?.platform || 'UNKNOWN'}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50 dark:bg-zinc-900/50">
                            <span className="text-zinc-500 block mb-1">Bypass Auth Enabled</span>
                            <span className={`font-bold ${stats?.bypassAuthEnabled ? 'text-yellow-600 dark:text-yellow-400' : 'text-zinc-500'}`}>
                                {stats?.bypassAuthEnabled ? 'YES (DEV MODE)' : 'NO'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Year Group Student Distribution */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                    <PanelHeader
                        icon={Users}
                        tone="bg-blue-50 text-blue-600 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30"
                        title="Year Group Distribution"
                        subtitle="Students by year level"
                    />
                    <YearDistribution dist={stats?.yearDistribution} />
                </div>
            </div>
        </div>

        {/* Console Log Terminal */}
    <div className="bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl font-mono text-sm">
        <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between border-b border-zinc-800">
            <div className="flex items-center gap-2">
                <Terminal size={14} className="text-zinc-400" />
                <span className="text-zinc-400 font-medium text-xs">root@server:~ logs</span>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="grep logs..."
                        value={logSearchTerm}
                        onChange={(e) => setLogSearchTerm(e.target.value)}
                        className="pl-7 pr-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 w-32 md:w-48"
                    />
                </div>
                <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 text-green-500 border border-green-500/50"></div>
                </div>
            </div>
        </div>
        <div className="p-4 h-64 overflow-y-auto space-y-1 text-zinc-300 custom-scrollbar">
            {filteredLogs.length === 0 ? (
                <div className="text-zinc-600 italic">Waiting for system events...</div>
            ) : (
                filteredLogs.map((log, i) => (
                    <div key={i} className="flex gap-3 hover:bg-zinc-900/50 p-0.5 rounded">
                        <span className="text-zinc-600 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`font-bold ${log.action === 'ERROR' ? 'text-red-400' :
                            log.action === 'WARNING' ? 'text-yellow-400' :
                                log.action === 'REGISTER' ? 'text-green-400' :
                                    log.action === 'STARTUP' ? 'text-zinc-400' :
                                        'text-purple-400'
                            }`}>{log.action}</span>
                        <span className="text-zinc-500">@</span>
                        <span className="text-zinc-400 underline decoration-zinc-800 underline-offset-2" title={log.user}>
                            {users.find(u => String(u.id) === String(log.user))?.name || log.user}
                            {users.find(u => String(u.id) === String(log.user)) && ` (${log.user})`}
                        </span>
                        <span className="text-zinc-300">{log.details}</span>
                    </div>
                ))
            )}
            <div className="flex gap-2 animate-pulse mt-2">
                <span className="text-green-500">➜</span>
                <span className="w-2 h-4 bg-zinc-600 block"></span>
            </div>
        </div>
    </div>
            </div >
        )}

        {activeTab === 'analytics' && (
            <div className="space-y-6">
                {/* Headline metrics */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard
                        label="Active Today"
                        value={stats?.activeToday || 0}
                        description="Logged in within the past 24 hours"
                        icon={Activity}
                        iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                        ratio={{
                            label: 'Share of total users',
                            value: `${stats?.totalUsers ? Math.round(((stats.activeToday || 0) / stats.totalUsers) * 100) : 0}%`,
                            pct: stats?.totalUsers ? ((stats.activeToday || 0) / stats.totalUsers) * 100 : 0,
                        }}
                    />
                    <StatCard
                        label="Active This Week"
                        value={weekActive}
                        description="Logged in within the past 7 days"
                        icon={CalendarDays}
                        iconClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                        ratio={{
                            label: 'Share of total users',
                            value: `${stats?.totalUsers ? Math.round((weekActive / stats.totalUsers) * 100) : 0}%`,
                            pct: stats?.totalUsers ? (weekActive / stats.totalUsers) * 100 : 0,
                        }}
                    />
                    <StatCard
                        label="Inactive Users"
                        value={inactiveCount}
                        description="Not active in the last 7 days"
                        icon={UserX}
                        iconClass="bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        ratio={{
                            label: 'Share of total users',
                            value: `${stats?.totalUsers ? Math.round((inactiveCount / stats.totalUsers) * 100) : 0}%`,
                            pct: stats?.totalUsers ? (inactiveCount / stats.totalUsers) * 100 : 0,
                        }}
                    />
                </div>

                {/* Growth and Year Breakdown Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* User Growth Timeline Histogram */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
                        <PanelHeader
                            icon={TrendingUp}
                            tone="bg-emerald-50 text-emerald-600 border-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30"
                            title="Registration Growth"
                            subtitle="New signups over the last 14 days"
                        />
                        {growthData.length === 0 ? (
                            <div className="h-48 flex items-center justify-center text-xs text-zinc-400 font-mono">
                                No registration data yet
                            </div>
                        ) : (
                            <>
                                <div className="h-48 flex items-end gap-1 sm:gap-2">
                                    {growthData.map((item, idx) => {
                                        const maxVal = Math.max(1, ...growthData.map(g => g.count || 0));
                                        const pctHeight = ((item.count || 0) / maxVal) * 100;
                                        return (
                                            <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end min-w-0">
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[11px] py-0.5 px-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity font-mono pointer-events-none whitespace-nowrap shadow z-10">
                                                    {item.count || 0}
                                                </div>
                                                <div
                                                    className="w-full max-w-[26px] bg-zinc-200 dark:bg-zinc-700 group-hover:bg-zinc-900 dark:group-hover:bg-zinc-200 transition-colors rounded-t-md"
                                                    style={{ height: `${Math.max((item.count || 0) > 0 ? 4 : 0, pctHeight)}%` }}
                                                ></div>
                                                <span className="text-[10px] text-zinc-400 mt-2 font-mono whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                                                    {item.date}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                                    <span><span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{totalSignups}</span> registrations</span>
                                    <span>Avg <span className="font-semibold text-zinc-900 dark:text-white tabular-nums">{avgSignupsPerDay}</span> / day</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Year Group Distribution */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
                        <PanelHeader
                            icon={Users}
                            tone="bg-blue-50 text-blue-600 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30"
                            title="Year Group Distribution"
                            subtitle="Students by year level"
                        />
                        <YearDistribution dist={stats?.yearDistribution} />
                    </div>
                </div>

                {/* Timetable Text AI Usage Logs */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm space-y-6">
                    <PanelHeader
                        icon={Brain}
                        tone="bg-purple-50 text-purple-600 border-purple-200/50 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-900/30"
                        title="Timetable Text AI Activity"
                        subtitle="Audit log of student AI questions"
                    >
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Search questions, student IDs, models..."
                                value={aiLogSearchTerm}
                                onChange={(e) => setAiLogSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    </PanelHeader>

                    {/* AI Quick Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Total Questions</span>
                            <span className="text-xl font-bold text-zinc-900 dark:text-white mt-1 block">{aiLogs.length}</span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Filtered Queries</span>
                            <span className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1 block">{filteredAiLogs.length}</span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Gemini API Calls</span>
                            <span className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
                                {aiLogs.filter(l => String(l.provider).toLowerCase() === 'gemini').length}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Hack Club AI Calls</span>
                            <span className="text-xl font-bold text-green-600 dark:text-green-400 mt-1 block">
                                {aiLogs.filter(l => String(l.provider).toLowerCase() !== 'gemini').length}
                            </span>
                        </div>
                    </div>

                    {/* AI Logs Feed */}
                    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-4 py-3 w-32">Time</th>
                                    <th className="px-4 py-3 w-48">Student</th>
                                    <th className="px-4 py-3 w-36">Model Provider</th>
                                    <th className="px-4 py-3">Question</th>
                                    <th className="px-4 py-3 w-24 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                {filteredAiLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-8 text-center text-zinc-500 font-mono text-xs">
                                            {aiLogs.length === 0 ? '[NO AI USAGE LOGS FOUND]' : '[NO MATCHING LOGS FOUND]'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredAiLogs.map((log) => {
                                        const isGemini = String(log.provider).toLowerCase() === 'gemini';
                                        return (
                                            <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                                                <td className="px-4 py-3 text-xs text-zinc-500 font-mono whitespace-nowrap">
                                                    {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    <div className="font-semibold text-zinc-900 dark:text-white">
                                                        {users.find(u => String(u.id) === String(log.studentId))?.name || 'Unknown Student'}
                                                    </div>
                                                    <div className="text-zinc-500 font-mono text-[11px] mt-0.5">
                                                        {log.studentId}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-full font-semibold border text-[11px] ${
                                                        isGemini 
                                                            ? 'bg-blue-50/80 text-blue-700 border-blue-200/50 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30' 
                                                            : 'bg-green-50/80 text-green-700 border-green-200/50 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30'
                                                    }`}>
                                                        {isGemini ? 'Gemini' : 'Hack Club'} ({log.model?.split('/').pop()})
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 max-w-xs truncate text-zinc-900 dark:text-zinc-50 font-medium">
                                                    {log.question}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => setViewingAiLog(log)}
                                                        className="text-xs px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-lg transition-colors font-medium border border-zinc-200/20"
                                                    >
                                                        Details
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

{
    activeTab === 'broadcast' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm max-w-2xl mx-auto">
            <PanelHeader
                icon={Radio}
                tone="bg-blue-50 text-blue-600 border-blue-200/50 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/30"
                title="System Broadcast"
                subtitle="Send a global alert message to all active users"
            />

            {currentBroadcast && (
                <div className={`mb-6 p-4 border rounded-xl ${
                    currentBroadcast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                    currentBroadcast.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400' :
                    currentBroadcast.type === 'notification' ? 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400' :
                    'bg-zinc-100 border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white'
                }`}>
                    <div className="flex items-center gap-2 mb-1">
                        <Info size={16} />
                        <h3 className="font-bold text-sm uppercase tracking-wider">Current Active Broadcast</h3>
                    </div>
                    <p className="text-sm">{currentBroadcast.message}</p>
                </div>
            )}

            <form onSubmit={handleBroadcast} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Announcement Message</label>
                    <textarea
                        value={broadcastMsg}
                        onChange={(e) => setBroadcastMsg(e.target.value)}
                        className="w-full h-32 px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
                        placeholder="Type your message here..."
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Alert Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {['info', 'warning', 'error', 'notification'].map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setBroadcastType(type)}
                                className={`py-3 border rounded-xl capitalize font-medium transition-all ${broadcastType === type
                                    ? type === 'error' ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                        : type === 'warning' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                                            : type === 'notification' ? 'bg-violet-50 border-violet-500 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400'
                                                : 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black'
                                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>


                <div className="pt-4 flex gap-4">
                    {currentBroadcast && (
                        <button
                            type="button"
                            onClick={async () => { 
                                try {
                                    await setBroadcast('', 'info');
                                    alert("Broadcast cleared successfully!");
                                    setBroadcastMsg('');
                                    loadData();
                                } catch (err) {
                                    alert("Failed to clear broadcast");
                                }
                            }}
                            className="flex-1 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl font-medium transition-colors"
                        >
                            Clear Broadcast
                        </button>
                    )}
                    <button
                        type="submit"
                        className="flex-[2] py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg"
                    >
                        Send Announcement
                    </button>
                </div>
            </form>

            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Notification history</h4>
                <p className="text-xs text-zinc-500 mt-1 mb-4">
                    Broadcasts sent to the notification panel. Entries are kept for 30 days, and dismissals are permanent per student.
                </p>
                {broadcastHistory.length === 0 ? (
                    <p className="text-sm text-zinc-500">No notification broadcasts yet.</p>
                ) : (
                    <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
                        {broadcastHistory.map(n => (
                            <li key={n.id} className="py-3 flex items-start gap-3">
                                <Bell size={15} className="shrink-0 mt-0.5 text-violet-500 dark:text-violet-400" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-zinc-900 dark:text-white leading-snug">{n.message}</p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                                        {` · ${n.dismissals ?? 0} dismissal${(n.dismissals ?? 0) === 1 ? '' : 's'}`}
                                        {n.createdByName ? ` · by ${n.createdByName}` : n.createdBy ? ` · by ${n.createdBy}` : ''}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

{
    activeTab === 'users' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            {/* Promote User Card */}
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">Promote User to Admin</h4>
                    <p className="text-xs text-zinc-500">Assign admin privileges by entering their student ID</p>
                </div>
                <form onSubmit={handlePromoteUser} className="flex gap-2 w-full md:w-auto">
                    <input
                        type="text"
                        placeholder="Student ID (e.g., 449130511)"
                        value={promoteId}
                        onChange={(e) => setPromoteId(e.target.value)}
                        className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white w-full md:w-64"
                        required
                    />
                    <button
                        type="submit"
                        disabled={promoting}
                        className="px-4 py-2 text-sm bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-semibold transition-opacity rounded-lg whitespace-nowrap disabled:opacity-50"
                    >
                        {promoting ? 'Promoting...' : 'Promote'}
                    </button>
                </form>
            </div>

            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-4 w-full md:w-auto justify-between">
                    <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        User Management
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {filteredUsers.length}
                        </span>
                    </h3>
                    <div className="flex gap-2">
                        {selectedUsers.size > 0 && (
                            <button 
                                onClick={handleBulkDelete}
                                className="text-xs font-medium px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 rounded-lg transition-colors flex items-center gap-1"
                            >
                                <Trash2 size={14} />
                                Delete ({selectedUsers.size})
                            </button>
                        )}
                        <button 
                            onClick={handleExportCSV}
                            className="text-xs font-medium px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors"
                        >
                            Export CSV
                        </button>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="All">All Roles</option>
                        <option value="Student">Student</option>
                        <option value="Admin">Admin</option>
                    </select>
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-medium">
                        <tr>
                            <th className="px-6 py-4 w-12 text-center">
                                <input 
                                    type="checkbox" 
                                    className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-blue-500"
                                    checked={filteredUsers.length > 0 && selectedUsers.size === filteredUsers.length}
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Year</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-zinc-550">
                                    <div className="flex items-center justify-center gap-2">
                                        <RefreshCw className="animate-spin w-4 h-4" />
                                        Loading users...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-zinc-550">
                                    No users found.
                                </td>
                            </tr>
                        ) : filteredUsers.map((user) => (
                            <tr key={user.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${selectedUsers.has(user.id) ? 'bg-zinc-100/50 dark:bg-zinc-900/10' : ''} ${user.blacklisted ? 'opacity-60' : ''}`}>
                                <td className="px-6 py-4 text-center">
                                    <input
                                        type="checkbox"
                                        className="border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-black"
                                        checked={selectedUsers.has(user.id)}
                                        onChange={() => toggleSelectUser(user.id)}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <div>
                                        <div className={`font-semibold text-zinc-900 dark:text-white ${user.blacklisted ? 'line-through' : ''}`}>{user.name}</div>
                                        <div className="text-zinc-500 text-xs">{user.email}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs">{user.id}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 border text-xs font-semibold
                                            ${user.role === 'Admin' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white' :
                                            'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{user.year}</td>
                                <td className="px-6 py-4 text-right relative">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setEditingUser(user)}
                                            className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                            title="Edit User"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <div className="relative">
                                            <button
                                                data-user-menu-button
                                                onClick={() => setUserMenuOpen(userMenuOpen === user.id ? null : user.id)}
                                                className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                                title="More Options"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                            {userMenuOpen === user.id && (
                                                <div data-user-menu-dropdown className="absolute right-0 top-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
                                                    <button
                                                        onClick={() => {
                                                            setUserMenuOpen(null);
                                                            handleToggleBlacklist(user.id, user.blacklisted);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-2"
                                                    >
                                                        {user.blacklisted ? '🔓 Unblacklist' : '🚫 Blacklist'}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setUserMenuOpen(null);
                                                            handleDeleteUser(user.id);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors flex items-center gap-2"
                                                    >
                                                        <Trash2 size={12} />
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div>
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Maintenance Mode</h4>
                    <p className="text-xs text-zinc-500 mt-1">Block all non-admin access to the application</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={stats?.systemStatus === 'Maintenance'}
                        onChange={handleToggleMaintenance}
                        className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-200 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-red-600"></div>
                </label>
            </div>
        </div>
    )
}

{
    activeTab === 'settings' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
            <PanelHeader
                icon={Settings}
                tone="bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                title="Admin Controls"
                subtitle="Perform system maintenance tasks."
            />
            <div className="space-y-4">
                {/* AI Provider Config */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <Database size={16} />
                            AI Provider
                        </h4>
                        <p className="text-xs text-zinc-550 mt-1">Choose the active AI provider backend (requires appropriate API keys in .env)</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {updatingConfig && <span className="text-xs text-zinc-450 font-mono animate-pulse mr-1">updating...</span>}
                        <select
                            value={stats?.aiProvider || 'hackclub'}
                            disabled={updatingConfig}
                            onChange={handleProviderChange}
                            className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg transition-colors text-sm font-medium shadow-sm focus:outline-none"
                        >
                            <option value="hackclub">Hack Club AI</option>
                            <option value="gemini">Google Gemini API</option>
                        </select>
                    </div>
                </div>

                {/* AI Model Config */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <Sparkles size={16} />
                            Select Daily AI Briefing Model
                        </h4>
                        <p className="text-xs text-zinc-550 mt-1">Choose or type the LLM model to generate student morning briefings from the active provider</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {updatingConfig && <span className="text-xs text-zinc-450 font-mono animate-pulse mr-1">updating...</span>}
                        <div className="flex gap-2 w-full sm:w-auto">
                            {showModelInput ? (
                                <>
                                    <input
                                        type="text"
                                        value={customModelName}
                                        disabled={updatingConfig}
                                        onChange={(e) => setCustomModelName(e.target.value)}
                                        onKeyDown={handleModelKeyDown}
                                        placeholder="Enter model name..."
                                        className="flex-1 sm:w-64 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg transition-colors text-sm font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                                    />
                                    {modelOptions.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setEnteringCustomModel(false); setCustomModelName(modelOptions[0]); }}
                                            className="px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
                                        >
                                            List
                                        </button>
                                    )}
                                </>
                            ) : (
                                <select
                                    value={customModelName}
                                    disabled={updatingConfig}
                                    onChange={(e) => {
                                        if (e.target.value === '__custom__') {
                                            setEnteringCustomModel(true);
                                        } else {
                                            setCustomModelName(e.target.value);
                                        }
                                    }}
                                    className="flex-1 sm:w-64 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg transition-colors text-sm font-medium shadow-sm focus:outline-none"
                                >
                                    {modelOptions.map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                    <option value="__custom__">Custom…</option>
                                </select>
                            )}
                            <button
                                type="button"
                                onClick={handleModelSave}
                                disabled={updatingConfig || !customModelName.trim() || customModelName.trim() === stats?.aiModel}
                                className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-semibold transition-opacity rounded-lg text-sm disabled:opacity-50"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>

                {/* AI Kill Switch */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <Brain size={16} />
                            AI features for everyone
                        </h4>
                        <p className="text-xs text-zinc-550 mt-1">
                            {stats?.aiDisabled
                                ? 'Disabled — Ask Sage and notice ranking show a maintenance notice. Use the tester below to verify.'
                                : 'When disabled, all AI features (Ask Sage and notice ranking) return a maintenance notice for everyone.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={!stats?.aiDisabled}
                        aria-label="AI features"
                        onClick={handleToggleAiDisabled}
                        disabled={updatingConfig || stats?.aiDisabled === undefined}
                        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
                            stats?.aiDisabled ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-green-500'
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                                stats?.aiDisabled ? 'translate-x-0' : 'translate-x-5'
                            }`}
                        />
                    </button>
                </div>

                {/* Admin-only Sage tester — bypasses the student-facing AI kill switch */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                        <Sparkles size={16} />
                        Test Sage (Admin Only)
                    </h4>
                    <p className="text-xs text-zinc-550 mt-1 mb-3">
                        Ask Sage a timetable question. Works even while AI is disabled for students.
                    </p>
                    <form onSubmit={handleAskSage} className="flex gap-2">
                        <input
                            type="text"
                            value={sageQuestion}
                            onChange={(e) => setSageQuestion(e.target.value)}
                            disabled={sageLoading}
                            placeholder={sageLoading ? "Sage is typing…" : "e.g. What room is my next class?"}
                            className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                        />
                        <button
                            type="submit"
                            disabled={sageLoading || !sageQuestion.trim()}
                            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black hover:opacity-90 font-semibold transition-opacity rounded-lg text-sm disabled:opacity-50"
                        >
                            {sageLoading ? "Asking…" : "Ask"}
                        </button>
                    </form>
                    {sageAnswer && (
                        <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{sageAnswer}</p>
                    )}
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Clear Application Cache (Local)</h4>
                        <p className="text-xs text-zinc-500 mt-1">Removes all local storage data/tokens except your admin session</p>
                    </div>
                    <button
                        onClick={handleClearLocalCache}
                        className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        Clear Local Cache
                    </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Clear Server Cache</h4>
                        <p className="text-xs text-zinc-500 mt-1">Force invalidation of API cache at synchron.work</p>
                    </div>
                    <button
                        onClick={handleClearServerCache}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                    >
                        Clear Server Cache
                    </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <Sparkles size={16} className="text-purple-500" />
                            Clear AI Cache
                        </h4>
                        <p className="text-xs text-zinc-500 mt-1">Clear cached daily notice rankings from the database and memory</p>
                    </div>
                    <button
                        onClick={handleClearAiCache}
                        disabled={clearingAiCache}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors text-sm shadow-sm disabled:opacity-50"
                    >
                        {clearingAiCache ? 'Clearing...' : 'Clear AI Cache'}
                    </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <Terminal size={16} />
                            Prune Old Activity Logs
                        </h4>
                        <p className="text-xs text-zinc-500 mt-1">Delete database logs and history records older than 30 days</p>
                    </div>
                    <button
                        onClick={handlePruneOldLogs}
                        disabled={isPruningLogs}
                        className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                        {isPruningLogs ? 'Pruning...' : 'Prune Logs'}
                    </button>
                </div>

                {/* Hidden Pages Configuration */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="mb-4">
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-white flex items-center gap-2">
                            <EyeOff size={16} />
                            Hidden Pages
                        </h4>
                        <p className="text-xs text-zinc-500 mt-1">Select pages to hide from navigation for all users. Hidden pages remain accessible via buttons below.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {availablePages.map(page => (
                            <label
                                key={page.id}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    hiddenPages.includes(page.id)
                                        ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700'
                                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={hiddenPages.includes(page.id)}
                                    onChange={() => handleToggleHiddenPage(page.id)}
                                    className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 text-black dark:text-white focus:ring-black dark:focus:ring-white"
                                />
                                <span className="text-sm font-medium text-zinc-900 dark:text-white">{page.label}</span>
                            </label>
                        ))}
                    </div>
                </div>


            </div>
        </div>
    )
}

{activeTab === 'canvas-links' && <AdminCanvasLinks />}

{
    activeTab === 'hidden-pages' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
            <PanelHeader
                icon={EyeOff}
                tone="bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                title="Access Hidden Pages"
                subtitle="These pages are hidden from navigation but can still be accessed here."
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availablePages.filter(page => hiddenPages.includes(page.id)).map(page => (
                    <button
                        key={page.id}
                        onClick={() => setView(page.id)}
                        className="flex items-center gap-3 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left"
                    >
                        <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                            <Eye size={20} className="text-zinc-600 dark:text-zinc-400" />
                        </div>
                        <div>
                            <div className="font-medium text-zinc-900 dark:text-white">{page.label}</div>
                            <div className="text-xs text-zinc-500">Click to access</div>
                        </div>
                    </button>
                ))}
            </div>
            {hiddenPages.length === 0 && (
                <div className="text-center py-8 text-zinc-500">
                    No pages are currently hidden. Go to Settings to hide pages.
                </div>
            )}
        </div>
    )
}

{
    activeTab === 'feedback' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-4 w-full md:w-auto justify-between">
                    <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        Feedback Management
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {filteredFeedback.length}
                        </span>
                    </h3>
                    <div className="flex gap-2">
                        {selectedFeedback.size > 0 && (
                            <>
                                <button 
                                    onClick={() => handleBulkUpdateFeedbackStatus('resolved')}
                                    className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-400 rounded-lg transition-colors flex items-center gap-1 border border-emerald-200/20"
                                >
                                    Resolve ({selectedFeedback.size})
                                </button>
                                <button 
                                    onClick={() => handleBulkUpdateFeedbackStatus('archived')}
                                    className="text-xs font-semibold px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors flex items-center gap-1 border border-zinc-200/20"
                                >
                                    Archive ({selectedFeedback.size})
                                </button>
                                <button 
                                    onClick={handleBulkDeleteFeedback}
                                    className="text-xs font-semibold px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-400 rounded-lg transition-colors flex items-center gap-1 border border-red-200/20"
                                >
                                    <Trash2 size={14} />
                                    Delete ({selectedFeedback.size})
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <select
                        value={feedbackStatusFilter}
                        onChange={(e) => setFeedbackStatusFilter(e.target.value)}
                        className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="open">Open Requests</option>
                        <option value="resolved">Resolved</option>
                        <option value="archived">Archived</option>
                        <option value="All">All Feedback</option>
                    </select>
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search feedback..."
                            value={feedbackSearchTerm}
                            onChange={(e) => setFeedbackSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-medium">
                        <tr>
                            <th className="px-6 py-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-blue-500"
                                    checked={filteredFeedback.length > 0 && filteredFeedback.every(f => selectedFeedback.has(f.id))}
                                    onChange={() => toggleSelectAllFeedback(filteredFeedback)}
                                />
                            </th>
                            <th className="px-6 py-4">Feedback ID</th>
                            <th className="px-6 py-4">Submitting User</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Severity</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-zinc-550">
                                    <div className="flex items-center justify-center gap-2">
                                        <RefreshCw className="animate-spin w-4 h-4" />
                                        Loading feedback...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredFeedback.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-zinc-550">
                                    No feedback requests found.
                                </td>
                            </tr>
                        ) : filteredFeedback.map((fb) => (
                                <tr 
                                    key={fb.id} 
                                    onClick={() => setViewingFeedback(fb)}
                                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors ${selectedFeedback.has(fb.id) ? 'bg-zinc-100/50 dark:bg-zinc-900/10' : ''}`}
                                >
                                    <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            className="border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-black"
                                            checked={selectedFeedback.has(fb.id)}
                                            onChange={() => toggleSelectFeedback(fb.id)}
                                        />
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-zinc-650 dark:text-zinc-400 font-semibold">
                                        {fb.ticketNumber}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-zinc-900 dark:text-white">{fb.name}</div>
                                        <div className="text-zinc-555 text-xs font-mono">{fb.studentId}</div>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{fb.email}</td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            let sevClass = '';
                                            switch (fb.severity) {
                                                case 5:
                                                    sevClass = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30';
                                                    break;
                                                case 4:
                                                    sevClass = 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30';
                                                    break;
                                                case 3:
                                                    sevClass = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30';
                                                    break;
                                                case 2:
                                                    sevClass = 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30';
                                                    break;
                                                default:
                                                    sevClass = 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700';
                                            }
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 border text-xs font-semibold ${sevClass}`}>
                                                    Severity {fb.severity}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

{
    activeTab === 'notifications' && (
        <>
        {canvasReports.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200 mb-6">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Flag size={16} className="text-red-500" />
                        Reported Canvas &amp; Wellio links
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/40">
                        {canvasReports.length} reported
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Class</th>
                                <th className="px-6 py-3">Link</th>
                                <th className="px-6 py-3 text-right">Backed</th>
                                <th className="px-6 py-3 text-right">Reported</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {canvasReports.map(link => {
                                const busy = canvasReportBusy === link.id;
                                const statusLabel = link.lockedStatus === 'verified' ? 'Pinned' : link.lockedStatus === 'rejected' ? 'Hidden' : link.status === 'verified' ? 'In use' : link.status === 'rejected' ? 'Auto-hidden' : 'Waiting';
                                return (
                                    <tr key={link.id} className="dark:text-zinc-200">
                                        <td className="px-6 py-3">
                                            <div className="font-semibold text-zinc-900 dark:text-white">{link.className}</div>
                                            <div className="text-zinc-500 text-xs font-mono">{link.classKey}</div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <a href={link.canvasUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-zinc-600 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400">
                                                {link.canvasUrl.replace(/^https:\/\//, '')} <ExternalLink size={11} />
                                            </a>
                                            <div className="text-zinc-400 text-[11px]">by {link.submittedBy}</div>
                                        </td>
                                        <td className="px-6 py-3 text-right tabular-nums">{link.confirmations}</td>
                                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">{link.reports}</td>
                                        <td className="px-6 py-3">
                                            <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                                link.status === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : link.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                            }`}>{statusLabel}</span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex justify-end gap-1">
                                                {link.lockedStatus !== 'verified' && (
                                                    <button disabled={busy} onClick={() => handleCanvasReportAction(link, () => setAdminCanvasLinkStatus(link.id, 'verified'))} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Pin as the class's link">
                                                        <Pin size={14} />
                                                    </button>
                                                )}
                                                {link.lockedStatus !== 'rejected' && (
                                                    <button disabled={busy} onClick={() => handleCanvasReportAction(link, () => setAdminCanvasLinkStatus(link.id, 'rejected'))} className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50" title="Hide">
                                                        <EyeOff size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    disabled={busy}
                                                    onClick={() => window.confirm(`Clear all ${link.reports} report${link.reports === 1 ? '' : 's'} on this link? Backers are kept.`) && handleCanvasReportAction(link, () => resetAdminCanvasLinkReports(link.id))}
                                                    className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                                                    title="Reset report count"
                                                >
                                                    <Flag size={14} />
                                                </button>
                                                <button
                                                    disabled={busy}
                                                    onClick={() => window.confirm(`Delete this link and its votes for ${link.className}?`) && handleCanvasReportAction(link, () => deleteAdminCanvasLink(link.id))}
                                                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                        <Trash2 size={16} />
                        Deletion Requests
                    </h3>
                    {deletionRequests.some(r => r.status === 'pending') && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                            {deletionRequests.filter(r => r.status === 'pending').length} pending
                        </span>
                    )}
                </div>
                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                    <select
                        value={deletionStatusFilter}
                        onChange={(e) => setDeletionStatusFilter(e.target.value)}
                        className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="dismissed">Dismissed</option>
                        <option value="All">All Requests</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">Student</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4">Requested</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {(() => {
                            const filtered = deletionRequests.filter(r =>
                                deletionStatusFilter === 'All' || r.status === deletionStatusFilter
                            );

                            if (filtered.length === 0) {
                                return (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-zinc-500">
                                            No deletion requests{deletionStatusFilter !== 'All' ? ` with status "${deletionStatusFilter}"` : ''}.
                                        </td>
                                    </tr>
                                );
                            }

                            return filtered.map((req) => (
                                <tr key={req.id}>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-zinc-900 dark:text-white">{req.name}</div>
                                        <div className="text-zinc-500 text-xs font-mono">{req.studentId}</div>
                                    </td>
                                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{req.email}</td>
                                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                        {req.createdAt ? new Date(req.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const statusClass = {
                                                pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
                                                completed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30',
                                                dismissed: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
                                            }[req.status] || 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
                                            return (
                                                <span className={`inline-flex items-center px-2.5 py-0.5 border text-xs font-semibold capitalize ${statusClass}`}>
                                                    {req.status}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        {req.status === 'pending' ? (
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleResolveDeletionRequest(req, 'dismissed')}
                                                    disabled={resolvingDeletionId === req.id}
                                                    className="text-xs font-semibold px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 rounded-lg transition-colors border border-zinc-200/20 disabled:opacity-50"
                                                >
                                                    Dismiss
                                                </button>
                                                <button
                                                    onClick={() => handleResolveDeletionRequest(req, 'completed')}
                                                    disabled={resolvingDeletionId === req.id}
                                                    className="text-xs font-semibold px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-400 rounded-lg transition-colors flex items-center gap-1 border border-red-200/20 disabled:opacity-50"
                                                >
                                                    <Trash2 size={14} />
                                                    {resolvingDeletionId === req.id ? 'Working…' : 'Delete data'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-right text-xs text-zinc-400">
                                                {req.updatedAt ? new Date(req.updatedAt).toLocaleDateString() : ''}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ));
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
        </>
    )
}

{
    activeTab === 'build-notes' && (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header info card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <FileCode className="text-violet-600 dark:text-violet-400" size={22} />
                        Build Notes & Changelog Publisher
                    </h3>
                    <p className="text-zinc-500 text-sm mt-1">
                        Write release notes, bug fixes, and feature announcements. These sync directly to the user-facing Build Notes page in Settings.
                    </p>
                </div>
                <button
                    onClick={loadBuildNotes}
                    disabled={loadingBuildNotes}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-850 text-sm font-medium transition-colors text-zinc-700 dark:text-zinc-300 shrink-0"
                >
                    <RefreshCw size={14} className={loadingBuildNotes ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {noteSuccessMsg && (
                <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 text-sm font-semibold flex items-center gap-2">
                    <Check size={16} />
                    {noteSuccessMsg}
                </div>
            )}

            {/* Note Editor Form */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        {noteForm.id ? <Edit2 size={16} /> : <Plus size={16} />}
                        {noteForm.id ? 'Edit Build Note' : 'Draft New Build Note'}
                    </h4>
                    {noteForm.id && (
                        <button
                            type="button"
                            onClick={() => setNoteForm({ id: null, version: '', title: '', content: '', author: '' })}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        >
                            Cancel Edit
                        </button>
                    )}
                </div>

                <form onSubmit={handleSaveNote} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                Version / Tag *
                            </label>
                            <input
                                type="text"
                                value={noteForm.version}
                                onChange={(e) => setNoteForm(prev => ({ ...prev, version: e.target.value }))}
                                placeholder="e.g. v1.2.0 or Alpha 0.9.4"
                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                required
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                                Title / Headline *
                            </label>
                            <input
                                type="text"
                                value={noteForm.title}
                                onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="e.g. Canvas Links Sync & Dock Navigation Updates"
                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                            Author (Optional)
                        </label>
                        <input
                            type="text"
                            value={noteForm.author}
                            onChange={(e) => setNoteForm(prev => ({ ...prev, author: e.target.value }))}
                            placeholder="e.g. Dev Team or Your Name"
                            className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
                            Notes / Details (Markdown supported) *
                        </label>
                        <textarea
                            value={noteForm.content}
                            onChange={(e) => setNoteForm(prev => ({ ...prev, content: e.target.value }))}
                            placeholder={"### What's New\n- Added automatic sync for Canvas class links\n- Fixed URL redirection\n- Performance improvements across timetable view"}
                            rows={6}
                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 dark:text-white font-mono"
                            required
                        />
                        <p className="text-[11px] text-zinc-400 mt-1">
                            Tip: You can use bullet points (- item), bolding (**text**), and headers (### Heading).
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        {noteForm.id && (
                            <button
                                type="button"
                                onClick={() => setNoteForm({ id: null, version: '', title: '', content: '', author: '' })}
                                className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={savingNote}
                            className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
                        >
                            {savingNote ? 'Publishing...' : noteForm.id ? 'Save Changes' : 'Publish Build Note'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Published Notes List */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                        Published Build Notes ({buildNotes.length})
                    </h4>
                </div>

                {loadingBuildNotes ? (
                    <div className="py-8 text-center text-sm text-zinc-500">Loading build notes...</div>
                ) : buildNotes.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                        No build notes published yet. Draft one above!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {buildNotes.map((note) => (
                            <div
                                key={note.id}
                                className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200 dark:border-violet-900/40">
                                            {note.version}
                                        </span>
                                        <span className="font-bold text-zinc-900 dark:text-white text-base">
                                            {note.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleEditNote(note)}
                                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                            title="Edit note"
                                        >
                                            <Edit2 size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteNote(note.id)}
                                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                            title="Delete note"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>

                                <div className="text-xs text-zinc-400 flex items-center gap-3">
                                    <span>{note.author ? `By ${note.author}` : 'Dev Team'}</span>
                                    <span>•</span>
                                    <span>{note.createdAt ? new Date(note.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : ''}</span>
                                </div>

                                <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed border-t border-zinc-200/60 dark:border-zinc-800/60 pt-3">
                                    {note.content}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}


{/* Edit User Modal */ }
{
    editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-xl font-bold dark:text-white">Edit User</h3>
                    <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg dark:text-zinc-400">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleUpdateRole} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Role</label>
                        <select name="role" defaultValue={editingUser.role} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg dark:text-white">
                            <option value="Student">Student</option>
                            <option value="Admin">Admin</option>
                        </select>
                    </div>
                    <div className="pt-4">
                        <button type="submit" className="w-full py-2 bg-black text-white hover:bg-zinc-850 font-bold border border-black dark:bg-white dark:text-black dark:border-white dark:hover:bg-zinc-200">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

{/* AI Log Detail Modal */}
{
    viewingAiLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-purple-100 dark:bg-purple-950/40 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 border border-purple-200/20">
                            <Brain className="w-5 h-5 animate-pulse" />
                        </div>                        <div>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-none">AI Log Details</h3>
                            <p className="text-xs text-zinc-500 mt-1">
                                Student: {users.find(u => String(u.id) === String(viewingAiLog.studentId))?.name || 'Unknown Student'} ({viewingAiLog.studentId}) • {new Date(viewingAiLog.timestamp).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setViewingAiLog(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
                    {/* Metadata */}
                    <div className="grid grid-cols-3 gap-4 text-xs font-mono border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Provider</span>
                            <span className="font-bold text-zinc-900 dark:text-white capitalize">{viewingAiLog.provider}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Model</span>
                            <span className="font-bold text-zinc-900 dark:text-white">{viewingAiLog.model}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Status</span>
                            <span className={`font-bold ${viewingAiLog.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {viewingAiLog.status === 'error' ? 'Error' : 'OK'}
                            </span>
                        </div>
                    </div>

                    {/* Question */}
                    <div className="space-y-4 text-left">
                        <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Question</span>
                            <div className="p-4 bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 rounded-2xl rounded-tl-none border border-zinc-200 dark:border-zinc-800 text-sm">
                                {viewingAiLog.question}
                            </div>
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            AI responses are not stored.
                        </p>
                    </div>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                    <button
                        onClick={() => setViewingAiLog(null)}
                        className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold rounded-lg transition-colors shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

{/* Feedback Detail Modal */}
{
    viewingFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 border border-zinc-200/20">
                            <MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-none">Feedback Details</h3>
                            <p className="text-xs text-zinc-500 mt-1">
                                {viewingFeedback.ticketNumber} • Submitter: {viewingFeedback.name}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => setViewingFeedback(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Status</span>
                            <span className={`font-bold capitalize ${
                                viewingFeedback.status === 'open' ? 'text-blue-500' :
                                viewingFeedback.status === 'resolved' ? 'text-green-500' : 'text-zinc-500'
                            }`}>{viewingFeedback.status}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Severity</span>
                            <span className="font-bold text-zinc-900 dark:text-white">Severity {viewingFeedback.severity}/5</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Category</span>
                            <span className="font-bold text-zinc-900 dark:text-white capitalize">{viewingFeedback.category}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Submitted</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {new Date(viewingFeedback.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>

                    {/* Submitter details */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Submitter Details</span>
                        <div className="p-4 border border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/20 rounded-xl space-y-1 text-sm">
                            <div><strong className="text-zinc-700 dark:text-zinc-300">Name:</strong> {viewingFeedback.name}</div>
                            <div><strong className="text-zinc-700 dark:text-zinc-300">Student ID:</strong> {viewingFeedback.studentId}</div>
                            <div><strong className="text-zinc-700 dark:text-zinc-300">Email:</strong> {viewingFeedback.email}</div>
                        </div>
                    </div>

                    {/* Feedback Details Text */}
                    <div className="space-y-1.5">
                        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Details</span>
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm whitespace-pre-wrap">
                            {viewingFeedback.details}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2 justify-between">
                    <div className="flex gap-2">
                        {viewingFeedback.status !== 'resolved' && (
                            <button
                                onClick={async () => {
                                    try {
                                        await updateFeedbackStatus(viewingFeedback.id, 'resolved');
                                        setFeedback(prev => prev.map(item => item.id === viewingFeedback.id ? { ...item, status: 'resolved', updatedAt: new Date().toISOString() } : item));
                                        setViewingFeedback(null);
                                    } catch (err) {
                                        alert("Failed to update status.");
                                    }
                                }}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                            >
                                Mark as Resolved
                            </button>
                        )}
                        {viewingFeedback.status !== 'archived' && (
                            <button
                                onClick={async () => {
                                    try {
                                        await updateFeedbackStatus(viewingFeedback.id, 'archived');
                                        setFeedback(prev => prev.map(item => item.id === viewingFeedback.id ? { ...item, status: 'archived', updatedAt: new Date().toISOString() } : item));
                                        setViewingFeedback(null);
                                    } catch (err) {
                                        alert("Failed to update status.");
                                    }
                                }}
                                className="px-4 py-2 bg-zinc-650 hover:bg-zinc-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                            >
                                Archive
                            </button>
                        )}
                        <button
                            onClick={async () => {
                                try {
                                    await deleteFeedback(viewingFeedback.id);
                                    setFeedback(prev => prev.filter(item => item.id !== viewingFeedback.id));
                                    setViewingFeedback(null);
                                } catch (err) {
                                    alert("Failed to delete feedback request.");
                                }
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                        >
                            Delete Manually
                        </button>
                    </div>
                    <button
                        onClick={() => setViewingFeedback(null)}
                        className="px-5 py-2 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-sm font-semibold rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

      </div >
    );
  }


export default AdminPanel;