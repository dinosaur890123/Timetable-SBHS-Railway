import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, AlertCircle, Users, Activity, Settings, Search, MoreVertical, RefreshCw, Trash2, Eye, Edit2, X, Terminal, Radio, MessageSquare, Zap, Info } from 'lucide-react';
import { fetchUsers, fetchAdminStats, deleteUser, clearServerCache, updateUser, fetchLogs, setBroadcast, setMaintenanceMode, fetchUserTimetable, promoteUserToAdmin } from '../services/adminApi';
import { fetchSystemStatus } from '../services/api';
import Timetable from './Timetable';

const AdminPanel = ({ user }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data States
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [currentBroadcast, setCurrentBroadcast] = useState(null);
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState(null);

    // Broadcast State
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastType, setBroadcastType] = useState('info');

    const handleToggleMaintenance = async () => {
        if (!stats) return;
        const targetMode = !stats.maintenanceMode;
        try {
            await setMaintenanceMode(targetMode);
            setStats(prev => prev ? { ...prev, maintenanceMode: targetMode } : null);
            loadData(); // Refresh logs
        } catch (err) {
            alert("Failed to toggle maintenance mode");
        }
    };

    // UI States
    const [activeTab, setActiveTab] = useState('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [logSearchTerm, setLogSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('All');
    const [viewingUserId, setViewingUserId] = useState(null); // ID only, derive user from list
    const [editingUser, setEditingUser] = useState(null); // User object for edit modal
    const [selectedUsers, setSelectedUsers] = useState(new Set()); // For bulk actions
    const [promoteId, setPromoteId] = useState('');
    const [promoting, setPromoting] = useState(false);

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
            const [usersData, statsData, logsData, systemData] = await Promise.all([
                fetchUsers(),
                fetchAdminStats(),
                fetchLogs(),
                fetchSystemStatus()
            ]);
            setUsers(usersData);
            setStats(statsData);
            setLogs(logsData);
            setCurrentBroadcast(systemData?.broadcast || null);
        } catch (err) {
            setApiError('Failed to fetch data from server. Ensure backend is running.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const [selectedUserTimetable, setSelectedUserTimetable] = useState(null);
    const [loadingTimetable, setLoadingTimetable] = useState(false);

    useEffect(() => {
        if (viewingUserId) {
            setLoadingTimetable(true);
            setSelectedUserTimetable(null);
            fetchUserTimetable(viewingUserId)
                .then(data => {
                    setSelectedUserTimetable(data);
                })
                .catch(err => {
                    console.error("Failed to load user timetable:", err);
                })
                .finally(() => {
                    setLoadingTimetable(false);
                });
        } else {
            setSelectedUserTimetable(null);
        }
    }, [viewingUserId]);

    // Determine the user object for the modal based on latest data
    const viewingUserEntry = viewingUserId ? users.find(u => u.id === viewingUserId) : null;

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
            await setBroadcast(broadcastMsg, broadcastType);
            alert("Broadcast updated successfully!");
            setBroadcastMsg('');
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

    const TabButton = ({ id, label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all border
        ${activeTab === id
                    ? 'bg-black text-white border-black dark:bg-white dark:text-black dark:border-white'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-transparent'
                }`}
        >
            <Icon size={18} />
            {label}
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
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-green-500" />
                        Admin Dashboard
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 mt-2">
                        Manage users and system settings
                    </p>
                </div>
                <div className="flex gap-2">
                    <TabButton id="overview" label="Overview" icon={Activity} />
                    <TabButton id="users" label="Users" icon={Users} />
                    <TabButton id="broadcast" label="Broadcast" icon={MessageSquare} />
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

        {/* System Diagnostics & Connection Checks */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 font-mono text-xs">
            <h4 className="text-sm font-bold uppercase tracking-wider mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 flex items-center gap-2 text-zinc-900 dark:text-white">
                <ShieldCheck className="text-zinc-950 dark:text-zinc-100" size={16} />
                System Health & Database Diagnostics
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <span className="text-zinc-400 underline decoration-zinc-800 underline-offset-2">{log.user}</span>
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
                <div className={`mb-6 p-4 border ${
                    currentBroadcast.type === 'error' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400' :
                    currentBroadcast.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400' :
                    'bg-zinc-100 border-zinc-300 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-850 dark:text-white'
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
                    <div className="grid grid-cols-3 gap-4">
                        {['info', 'warning', 'error'].map((type) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setBroadcastType(type)}
                                className={`py-3 border capitalize font-medium transition-all ${broadcastType === type
                                    ? type === 'error' ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                        : type === 'warning' ? 'bg-orange-50 border-orange-500 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
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
                        className="px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-750 rounded-lg text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white w-full md:w-64"
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
                            <th className="px-6 py-4">Year</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-zinc-500">
                                    <div className="flex items-center justify-center gap-2">
                                        <RefreshCw className="animate-spin w-4 h-4" />
                                        Loading users...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-zinc-500">
                                    No users found.
                                </td>
                            </tr>
                        ) : filteredUsers.map((user) => (
                            <tr key={user.id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${selectedUsers.has(user.id) ? 'bg-zinc-100/50 dark:bg-zinc-900/10' : ''}`}>
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
                                        <div className="font-semibold text-zinc-900 dark:text-white">{user.name}</div>
                                        <div className="text-zinc-500 text-xs">{user.email}</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs">{user.id}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 border text-xs font-semibold
                                            ${user.role === 'Admin' ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white' :
                                            'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-250 dark:border-zinc-750'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">{user.year}</td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    <button
                                        onClick={() => setViewingUserId(user.id)}
                                        className="p-1 text-zinc-550 hover:text-black hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors"
                                        title="View Timetable"
                                    >
                                        <Eye size={16} />
                                    </button>
                                    <button
                                        onClick={() => setEditingUser(user)}
                                        className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                                        title="Edit User"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(user.id)}
                                        className="p-1 text-red-400 hover:text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        title="Delete User"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
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

                    </tbody>
                </table>
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
            </div>
        </div>
    )
}

{/* Timetable Modal */ }
{
    viewingUserEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
                    <div>
                        <h3 className="text-xl font-bold dark:text-white">User Timetable</h3>
                        <p className="text-sm text-zinc-500">{viewingUserEntry.name} ({viewingUserEntry.id})</p>
                    </div>
                    <button onClick={() => setViewingUserId(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg dark:text-zinc-400">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6">
                    {loadingTimetable ? (
                        <div className="text-center py-12 text-zinc-500 font-mono animate-pulse">
                            [LOADING TIMETABLE DATA...]
                        </div>
                    ) : selectedUserTimetable ? (
                        <div className="space-y-4 font-mono text-xs text-zinc-900 dark:text-zinc-100">
                            <h4 className="font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                                Synced Schedule
                            </h4>
                            <div className="grid grid-cols-1 gap-1">
                                {(() => {
                                    const innerTimetable = selectedUserTimetable.timetable || selectedUserTimetable;
                                    const periods = innerTimetable?.periods;
                                    if (!periods || Object.keys(periods).length === 0) {
                                        return <div className="text-center py-4 text-zinc-500">[No periods found in schedule]</div>;
                                    }
                                    return Object.entries(periods).map(([key, p]) => {
                                        const isBreak = ["R", "L", "RC"].includes(key);
                                        if (isBreak) return null; // Filter out breaks for compactness
                                        return (
                                            <div key={key} className="border border-zinc-200 dark:border-zinc-800 p-3 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-black text-white dark:bg-white dark:text-black font-extrabold px-1.5 py-0.5 text-[10px]">
                                                        P{key}
                                                    </span>
                                                    <span className="font-bold">{p.title}</span>
                                                </div>
                                                <div className="text-zinc-500 text-right text-[11px] flex gap-2">
                                                    {p.room && <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-800">Rm {p.room}</span>}
                                                    {p.fullTeacher && <span className="py-0.5">{p.fullTeacher}</span>}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                            
                            <details className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                <summary className="text-[10px] text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-300 cursor-pointer select-none">
                                    [View Raw JSON Timetable Payload]
                                </summary>
                                <pre className="mt-2 p-3 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-left overflow-auto max-h-48 text-[9px] text-zinc-400">
                                    {JSON.stringify(selectedUserTimetable, null, 2)}
                                </pre>
                            </details>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-zinc-500">
                            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No timetable data available for this user yet.</p>
                            <p className="text-xs mt-1">Data is synced when the user logs in.</p>
                        </div>
                    )}
                </div>
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

      </div >
    );
  }


export default AdminPanel;
