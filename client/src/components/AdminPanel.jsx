import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, AlertCircle, Users, Activity, Settings, Search, MoreVertical, RefreshCw, Trash2, Eye, Edit2, X, Terminal, Radio, MessageSquare, Zap, Info, Database, BarChart3, Sparkles, Brain, MessageCircle, Link as LinkIcon, Check, ExternalLink } from 'lucide-react';
import { fetchUsers, fetchAdminStats, deleteUser, clearServerCache, updateUser, fetchLogs, setBroadcast, setMaintenanceMode, promoteUserToAdmin, pruneOldLogs, updateAiConfig, fetchAiLogs, clearAiCache, fetchAdminFeedback, updateFeedbackStatus, deleteFeedback, bulkUpdateFeedbackStatus, bulkDeleteFeedback, toggleUserBlacklist, fetchCanvasReports, applyCanvasReport, rejectCanvasReport } from '../services/adminApi';
import { fetchSystemStatus } from '../services/api';

const AdminPanel = ({ user }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data States
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [aiLogs, setAiLogs] = useState([]);
    const [feedback, setFeedback] = useState([]);
    const [canvasReports, setCanvasReports] = useState([]);
    const [canvasActionId, setCanvasActionId] = useState(null); // report id currently being applied/rejected
    const [currentBroadcast, setCurrentBroadcast] = useState(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState(null);

    // Broadcast State
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastType, setBroadcastType] = useState('info');
    const [targetVersion, setTargetVersion] = useState('');

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

    useEffect(() => {
        if (user && user.role === 'Admin') {
            setIsAuthenticated(true);
        } else {
            setIsAuthenticated(false);
        }
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersData, statsData, logsData, systemData, aiLogsData, feedbackData, canvasReportsData] = await Promise.all([
                fetchUsers(),
                fetchAdminStats(),
                fetchLogs(),
                fetchSystemStatus(),
                fetchAiLogs().catch(err => {
                    console.warn("Failed to fetch AI logs:", err);
                    return [];
                }),
                fetchAdminFeedback().catch(err => {
                    console.warn("Failed to fetch feedback:", err);
                    return [];
                }),
                fetchCanvasReports().catch(err => {
                    console.warn("Failed to fetch Canvas reports:", err);
                    return [];
                })
            ]);
            setUsers(usersData);
            setStats(statsData);
            setLogs(logsData);
            setAiLogs(aiLogsData || []);
            setFeedback(feedbackData || []);
            setCanvasReports(canvasReportsData || []);
            setCurrentBroadcast(systemData?.broadcast || null);
        } catch (err) {
            setApiError('Failed to fetch data from server. Ensure backend is running.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            loadData();
        }
    }, [isAuthenticated]);

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
                role: formData.get('role'),
                subscriptionStatus: formData.get('subscriptionStatus') === 'active' ? 'active' : null
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

    const handleApplyCanvasReport = async (report) => {
        if (!window.confirm(`Apply correction for "${report.className}"?\n\n${report.currentCourseId || 'none'} → ${report.suggestedCourseId}`)) return;
        setCanvasActionId(report.id);
        try {
            await applyCanvasReport(report.id);
            setCanvasReports(prev => prev.map(r => r.id === report.id
                ? { ...r, status: 'applied', updatedAt: new Date().toISOString() }
                : (r.className === report.className && r.status === 'open'
                    ? { ...r, currentCourseId: report.suggestedCourseId }
                    : r)));
        } catch (err) {
            alert('Failed to apply correction');
        } finally {
            setCanvasActionId(null);
        }
    };

    const handleRejectCanvasReport = async (report) => {
        setCanvasActionId(report.id);
        try {
            await rejectCanvasReport(report.id);
            setCanvasReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'rejected', updatedAt: new Date().toISOString() } : r));
        } catch (err) {
            alert('Failed to reject report');
        } finally {
            setCanvasActionId(null);
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

    useEffect(() => {
        if (stats?.aiModel) {
            setCustomModelName(stats.aiModel);
        }
    }, [stats?.aiModel]);

    const handleProviderChange = async (e) => {
        const selectedProvider = e.target.value;
        const defaultModel = selectedProvider === 'gemini' ? 'gemini-1.5-flash' : 'qwen/qwen3-2.5';
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

    const handleModelKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleModelSave();
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

    const handleBroadcast = async (e) => {
        e.preventDefault();
        try {
            await setBroadcast(broadcastMsg, broadcastType, targetVersion || null);
            alert("Broadcast updated successfully!");
            setBroadcastMsg('');
            setTargetVersion('');
            loadData(); // Refresh logs
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
            String(log.answer || '').toLowerCase().includes(term) ||
            String(log.model || '').toLowerCase().includes(term) ||
            String(log.provider || '').toLowerCase().includes(term)
        );
    });


    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`admin-tab-btn flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 text-sm font-semibold transition-all border whitespace-nowrap
        ${activeTab === id
                    ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-transparent'
                }`}
        >
            <Icon size={18} />
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
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-green-500" />
                        Admin Dashboard
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                        Manage users and system settings
                    </p>
                </div>
                <div className="admin-tabs-container flex flex-wrap sm:flex-nowrap gap-2">
                    <TabButton id="overview" label="Overview" icon={Activity} />
                    <TabButton id="users" label="Users" icon={Users} />
                    <TabButton id="analytics" label="Analytics" icon={BarChart3} />
                    <TabButton id="broadcast" label="Broadcast" icon={MessageSquare} />
                    <TabButton id="feedback" label="Feedback" icon={MessageCircle} />
                    <TabButton id="canvas" label="Canvas" icon={LinkIcon} />
                    <TabButton id="settings" label="Settings" icon={Settings} />
                </div>
            </header>

            {apiError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl flex items-center gap-3">
                    <AlertCircle size={20} />
                    {apiError}
                </div>
            )}

        {activeTab === 'overview' && (
            <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-4">
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Users size={60} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-500">Total Users</p>
                            <h3 className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                                {loading ? '...' : (stats?.totalUsers || users.length || 0)}
                            </h3>
                            <div className={`text-xs mt-2 flex items-center gap-1 ${
                                stats?.systemStatus === 'Maintenance' ? 'text-red-500' : 'text-green-600'
                            }`}>
                                <Zap size={14} />
                                {stats?.systemStatus === 'Maintenance' ? 'Maintenance Mode' : 'System Operational'}
                            </div>
                        </div>
                    </div>
                
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Activity size={60} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-zinc-500">System Status</p>
                            <h3 className="text-3xl font-bold text-green-600 mt-1">
                                {loading ? '...' : (stats?.systemStatus || 'Operational')}
                            </h3>
                             <div className="text-xs text-zinc-500 mt-2">
                                Uptime: {stats ? Math.floor(stats.uptime / 60) + 'm' : '0m'}
                            </div>
                        </div>
                    </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Zap size={60} />
                </div>
                <div>
                    <p className="text-sm font-medium text-zinc-500">Server Load</p>
                    <div className="flex items-end gap-2 mt-1">
                        <h3 className="text-3xl font-bold text-zinc-900 dark:text-white">
                            {stats ? Math.round(stats.memoryUsage / 1024 / 1024) : 0}
                        </h3>
                        <span className="text-sm font-medium text-zinc-400 mb-1">MB</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 mt-3 overflow-hidden">
                        <div className="h-full bg-black dark:bg-white animate-pulse" style={{ width: '45%' }}></div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Users size={60} />
                </div>
                <div>
                    <p className="text-sm font-medium text-zinc-500">Active Sessions</p>
                    <h3 className="text-3xl font-bold text-zinc-900 dark:text-white mt-1">
                        {loading ? '...' : (stats?.activeSessions || 0)}
                    </h3>
                </div>
            </div>
        </div>

        {/* System Diagnostics & Year Distribution Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* System Diagnostics & Connection Checks */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 font-mono text-xs rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
                        <ShieldCheck className="text-zinc-950 dark:text-zinc-100" size={16} />
                        System Health & Database Diagnostics
                    </h4>
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
                    <h4 className="text-sm font-bold uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
                        <BarChart3 className="text-zinc-950 dark:text-zinc-100" size={16} />
                        Year Group Student Distribution
                    </h4>
                    <div className="space-y-2">
                        {(() => {
                            const dist = stats?.yearDistribution || {};
                            const years = ['7', '8', '9', '10', '11', '12', 'Staff', 'Unknown'];
                            
                            let maxCount = 1;
                            const dataPoints = years.map(yr => {
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
                                if (count > maxCount) maxCount = count;
                                return { label: yr, count };
                            });

                            return dataPoints.map(({ label, count }) => {
                                const pct = (count / maxCount) * 100;
                                return (
                                    <div key={label} className="flex items-center gap-3 text-xs font-mono">
                                        <span className="w-16 text-zinc-500 dark:text-zinc-400">Year {label}</span>
                                        <div className="flex-1 bg-zinc-100 dark:bg-zinc-800/50 h-3 rounded-full overflow-hidden relative">
                                            <div 
                                                className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-500 ease-out" 
                                                style={{ width: `${Math.max(1, pct)}%` }}
                                            ></div>
                                        </div>
                                        <span className="w-6 text-right font-bold text-zinc-900 dark:text-white">{count}</span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
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
                {/* Analytics Headline Stats */}
                <div className="grid gap-6 md:grid-cols-3">
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <div>
                            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Active Today</span>
                            <h3 className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1">
                                {stats?.activeToday || 0}
                            </h3>
                            <p className="text-zinc-500 text-xs mt-1">Logged in within the past 24 hours</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-500">
                            <span>Daily Active Ratio:</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {stats?.totalUsers ? Math.round((stats.activeToday / stats.totalUsers) * 100) : 0}%
                            </span>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <div>
                            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Active This Week</span>
                            <h3 className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-1">
                                {stats?.activeThisWeek || 0}
                            </h3>
                            <p className="text-zinc-500 text-xs mt-1">Logged in within the past 7 days</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-500">
                            <span>Weekly Active Ratio:</span>
                            <span className="font-bold text-zinc-900 dark:text-white">
                                {stats?.totalUsers ? Math.round((stats.activeThisWeek / stats.totalUsers) * 100) : 0}%
                            </span>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                        <div>
                            <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Inactive Users</span>
                            <h3 className="text-3xl font-extrabold text-zinc-400 mt-1">
                                {stats?.totalUsers ? Math.max(0, stats.totalUsers - stats.activeThisWeek) : 0}
                            </h3>
                            <p className="text-zinc-500 text-xs mt-1">Not active in the last 7 days</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-500">
                            <span>Inactive Ratio:</span>
                            <span className="font-bold text-zinc-400">
                                {stats?.totalUsers ? Math.round(((stats.totalUsers - stats.activeThisWeek) / stats.totalUsers) * 100) : 0}%
                            </span>
                        </div>
                    </div>
                </div>

                {/* Growth and Year Breakdown Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* User Growth Timeline Histogram */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
                        <h4 className="text-sm font-bold uppercase tracking-wider mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Activity className="text-zinc-950 dark:text-zinc-100" size={16} />
                            User Registration Growth (Last 14 Days)
                        </h4>
                        <div className="h-48 flex items-end gap-2 pb-2">
                            {stats?.growthData?.map((item, idx) => {
                                const counts = stats.growthData.map(g => g.count);
                                const maxVal = Math.max(1, ...counts);
                                const pctHeight = (item.count / maxVal) * 85;
                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                                        <div className="absolute -top-6 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-[10px] py-0.5 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-mono pointer-events-none shadow">
                                            {item.count}
                                        </div>
                                        <div 
                                            className="w-full bg-zinc-900 dark:bg-white hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-all rounded-t-sm"
                                            style={{ height: `${pctHeight}%` }}
                                        ></div>
                                        <span className="text-[9px] text-zinc-400 mt-2 font-mono whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                                            {item.date}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Year Group Distribution */}
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm">
                        <h4 className="text-sm font-bold uppercase tracking-wider mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
                            <BarChart3 className="text-zinc-950 dark:text-zinc-100" size={16} />
                            Year Group Student Distribution
                        </h4>
                        <div className="space-y-3">
                            {(() => {
                                const dist = stats?.yearDistribution || {};
                                const years = ['7', '8', '9', '10', '11', '12', 'Staff', 'Unknown'];
                                
                                let maxCount = 1;
                                const dataPoints = years.map(yr => {
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
                                    if (count > maxCount) maxCount = count;
                                    return { label: yr, count };
                                });

                                return dataPoints.map(({ label, count }) => {
                                    const pct = (count / maxCount) * 100;
                                    return (
                                        <div key={label} className="flex items-center gap-3 text-xs font-mono">
                                            <span className="w-16 text-zinc-500 dark:text-zinc-400">Year {label}</span>
                                            <div className="flex-1 bg-zinc-100 dark:bg-zinc-800/50 h-3 rounded-full overflow-hidden relative">
                                                <div 
                                                    className="h-full bg-zinc-900 dark:bg-white rounded-full transition-all duration-500 ease-out" 
                                                    style={{ width: `${Math.max(1, pct)}%` }}
                                                ></div>
                                            </div>
                                            <span className="w-6 text-right font-bold text-zinc-900 dark:text-white">{count}</span>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>

                {/* Timetable Text AI Usage Logs */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-2xl shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-950/40 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 border border-purple-200/20">
                                <Brain className="w-5 h-5 animate-pulse" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                                    Timetable Text AI Activity
                                </h4>
                                <p className="text-xs text-zinc-500 mt-1">Audit log of student questions and AI responses</p>
                            </div>
                        </div>
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
                    </div>

                    {/* AI Quick Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Total Questions</span>
                            <span className="text-xl font-bold text-zinc-900 dark:text-white mt-1 block">{aiLogs.length}</span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Filtered Queries</span>
                            <span className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1 block">{filteredAiLogs.length}</span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Gemini API Calls</span>
                            <span className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">
                                {aiLogs.filter(l => String(l.provider).toLowerCase() === 'gemini').length}
                            </span>
                        </div>
                        <div className="border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block">Hack Club AI Calls</span>
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
                                                    <div className="text-zinc-500 font-mono text-[10px] mt-0.5">
                                                        {log.studentId}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-xs whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-full font-semibold border text-[10px] ${
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
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-sm max-w-2xl mx-auto">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                    <Radio size={32} />
                </div>
                <h2 className="text-2xl font-bold dark:text-white">System Broadcast</h2>
                <p className="text-zinc-500 mt-2">Send a global alert message to all active users</p>
            </div>

            {currentBroadcast && (
                <div className={`mb-6 p-4 border rounded-xl ${
                    currentBroadcast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                    currentBroadcast.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400' :
                    currentBroadcast.type === 'update' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' :
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
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {['info', 'warning', 'error', 'update'].map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => {
                                    setBroadcastType(type);
                                    if (type === 'update' && (!broadcastMsg || broadcastMsg.trim() === '')) {
                                        setBroadcastMsg('A new version of Synchron is available!');
                                    }
                                }}
                                className={`py-3 border rounded-xl capitalize font-medium transition-all ${broadcastType === type
                                    ? type === 'error' ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                        : type === 'warning' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                                        : type === 'update' ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                            : 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black'
                                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                    }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>

                {broadcastType === 'update' && (
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Target Version (optional - leave empty to auto-increment)</label>
                        <input
                            type="text"
                            value={targetVersion}
                            onChange={(e) => setTargetVersion(e.target.value)}
                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 dark:text-white"
                            placeholder="e.g., 1.2.0 (leave empty to auto-increment)"
                            pattern="\d+\.\d+\.\d+"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Current version: {stats?.version || '1.0.0'}</p>
                    </div>
                )}

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
                    <h3 className="font-semibold text-zinc-900 dark:text-white">User Management</h3>
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
                            <th className="px-6 py-4">Pro</th>
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
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 border text-xs font-semibold
                                            ${(user.subscriptionStatus === 'active' || user.subscriptionStatus === 'pro') ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/40' :
                                            'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700'}`}>
                                        {(user.subscriptionStatus === 'active' || user.subscriptionStatus === 'pro') ? 'Pro' : 'No'}
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
                                                onClick={() => setUserMenuOpen(userMenuOpen === user.id ? null : user.id)}
                                                className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                                title="More Options"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                            {userMenuOpen === user.id && (
                                                <div className="absolute right-0 top-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
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
            <h3 className="text-lg font-semibold dark:text-white mb-4">Admin Controls</h3>
            <p className="text-zinc-500 text-sm mb-6">
                Perform system maintenance tasks.
            </p>
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
                            <input
                                type="text"
                                list="ai-models-datalist"
                                value={customModelName}
                                disabled={updatingConfig}
                                onChange={(e) => setCustomModelName(e.target.value)}
                                onKeyDown={handleModelKeyDown}
                                placeholder="Enter model name..."
                                className="flex-1 sm:w-64 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white rounded-lg transition-colors text-sm font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                            />
                            <datalist id="ai-models-datalist">
                                {stats?.aiProvider === 'gemini' ? (
                                    stats?.availableGeminiModels?.map(m => (
                                        <option key={m} value={m} />
                                    ))
                                ) : (
                                    stats?.availableHackClubModels?.map(m => (
                                        <option key={m} value={m} />
                                    ))
                                )}
                            </datalist>
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
                        <p className="text-xs text-zinc-500 mt-1">Clear cached daily briefings and prioritized notices from the database and memory</p>
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


            </div>
        </div>
    )
}


{
    activeTab === 'feedback' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-4 w-full md:w-auto justify-between">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Feedback Management</h3>
                    <div className="flex gap-2">
                        {selectedFeedback.size > 0 && (
                            <>
                                <button 
                                    onClick={() => handleBulkUpdateFeedbackStatus('resolved')}
                                    className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 dark:text-emerald-450 rounded-lg transition-colors flex items-center gap-1 border border-emerald-250/20"
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
                                    className="text-xs font-semibold px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-950/40 dark:hover:bg-red-950/60 dark:text-red-450 rounded-lg transition-colors flex items-center gap-1 border border-red-250/20"
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
                        {(() => {
                            const filteredFeedback = feedback.filter(fb => {
                                const matchesSearch = 
                                    fb.ticketNumber?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.details?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.name?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.email?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.studentId?.toLowerCase().includes(feedbackSearchTerm.toLowerCase());
                                const matchesStatus = feedbackStatusFilter === 'All' || fb.status === feedbackStatusFilter;
                                return matchesSearch && matchesStatus;
                            });

                            return (
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
                            );
                        })()}
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
                        ) : (() => {
                            const filteredFeedback = feedback.filter(fb => {
                                const matchesSearch = 
                                    fb.ticketNumber?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.details?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.name?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.email?.toLowerCase().includes(feedbackSearchTerm.toLowerCase()) ||
                                    fb.studentId?.toLowerCase().includes(feedbackSearchTerm.toLowerCase());
                                const matchesStatus = feedbackStatusFilter === 'All' || fb.status === feedbackStatusFilter;
                                return matchesSearch && matchesStatus;
                            });

                            if (filteredFeedback.length === 0) {
                                return (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-zinc-550">
                                            No feedback requests found.
                                        </td>
                                    </tr>
                                );
                            }

                            return filteredFeedback.map((fb) => (
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
                                                    sevClass = 'bg-yellow-50 text-yellow-750 border-yellow-200 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30';
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
                            ));
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

{
    activeTab === 'canvas' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden animate-in fade-in duration-200">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Canvas link corrections</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Students report wrong shared Canvas IDs here. Applying a correction updates the link for everyone.</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                    {canvasReports.filter(r => r.status === 'open').length} open
                </span>
            </div>

            {canvasReports.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">No Canvas reports yet.</div>
            ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {canvasReports.map(report => (
                        <div key={report.id} className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-zinc-900 dark:text-white">{report.className}</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                        report.status === 'open' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                        : report.status === 'applied' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                        : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                    }`}>{report.status}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm font-mono text-zinc-600 dark:text-zinc-300">
                                    <span className="text-zinc-400 line-through">{report.currentCourseId || 'none'}</span>
                                    <span>→</span>
                                    <a
                                        href={`https://sydneyboyshigh.instructure.com/courses/${report.suggestedCourseId}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline"
                                    >
                                        {report.suggestedCourseId} <ExternalLink size={12} />
                                    </a>
                                </div>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">{report.justification}</p>
                                <p className="text-xs text-zinc-400">Reported by {report.reporterName}</p>
                            </div>
                            {report.status === 'open' && (
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        onClick={() => handleApplyCanvasReport(report)}
                                        disabled={canvasActionId === report.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                                    >
                                        <Check size={14} /> Apply
                                    </button>
                                    <button
                                        onClick={() => handleRejectCanvasReport(report)}
                                        disabled={canvasActionId === report.id}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm font-semibold transition-colors disabled:opacity-50"
                                    >
                                        <X size={14} /> Reject
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
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
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Synchron Pro Status</label>
                        <select name="subscriptionStatus" defaultValue={editingUser.subscriptionStatus === 'active' || editingUser.subscriptionStatus === 'pro' ? 'active' : 'none'} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg dark:text-white">
                            <option value="none">Standard (None)</option>
                            <option value="active">Active (Pro)</option>
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
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-950/50 rounded-xl">
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Provider</span>
                            <span className="font-bold text-zinc-900 dark:text-white capitalize">{viewingAiLog.provider}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400 dark:text-zinc-500 block mb-1">Model</span>
                            <span className="font-bold text-zinc-900 dark:text-white">{viewingAiLog.model}</span>
                        </div>
                    </div>

                    {/* Question & Answer bubbles */}
                    <div className="space-y-4 text-left">
                        <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Question</span>
                            <div className="p-4 bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 rounded-2xl rounded-tl-none border border-zinc-200 dark:border-zinc-800 text-sm">
                                {viewingAiLog.question}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">AI Response</span>
                            <div className="p-4 bg-purple-50/30 dark:bg-purple-950/20 text-zinc-900 dark:text-zinc-50 rounded-2xl rounded-tr-none border border-purple-100/20 dark:border-purple-900/30 text-sm whitespace-pre-wrap">
                                {viewingAiLog.answer}
                            </div>
                        </div>
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
                            className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
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
