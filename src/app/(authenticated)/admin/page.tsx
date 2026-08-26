"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, Shield, Sliders, Check, Search, ShieldAlert, Cpu, Sparkles, Mail, AlertTriangle, Trash2, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Filter, Calendar } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageHeader, PageHeaderHeading, PageHeaderDescription } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  role: 'USER' | 'ORGANIZATION_ADMIN' | 'SYSTEM_ADMIN';
  planTier: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  jobsAppliedCount?: number;
  jobsFoundCount?: number;
  jobsSavedCount?: number;
}

interface GlobalSettings {
  greenhouseIsPro: boolean;
  leverIsPro: boolean;
  ashbyIsPro: boolean;
  workableIsPro: boolean;
  smartrecruitersIsPro: boolean;
  breezyIsPro: boolean;
  workdayIsPro: boolean;
  taleoIsPro: boolean;
  icimsIsPro: boolean;

  linkedinIsPro: boolean;
  indeedIsPro: boolean;
  glassdoorIsPro: boolean;
  ziprecruiterIsPro: boolean;
  diceIsPro: boolean;

  remotiveIsPro: boolean;
  remotepocIsPro: boolean;
  nodeskIsPro: boolean;
  weworkremotelyIsPro: boolean;
  remoteokIsPro: boolean;
  workingnomadsIsPro: boolean;
  ottaIsPro: boolean;
  himalayasIsPro: boolean;

  arbeitnowIsPro: boolean;
  themuseIsPro: boolean;
  computrabajoIsPro: boolean;
  jobbankIsPro: boolean;

  snagajobIsPro?: boolean;
  usajobsIsPro?: boolean;
  builtinIsPro?: boolean;

  emailsSyncIsPro: boolean;
  aiOpportunityScoringIsPro: boolean;
  aiAssetGenerationIsPro: boolean;
  aiQaHelperIsPro: boolean;

  recruiterNetworkEnabled?: boolean;
  recruiterPortalEnabled?: boolean;
  recruiterDiscoveryEnabled?: boolean;
}

const ToggleSwitch = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => {
  return (
    <button
      onClick={onChange}
      type="button"
      style={{
        width: "50px",
        height: "26px",
        borderRadius: "13px",
        background: checked ? "#3695e3" : "rgba(255,255,255,0.1)",
        position: "relative",
        border: "1px solid var(--border-glass)",
        cursor: "pointer",
        transition: "background-color 0.2s ease, border-color 0.2s ease",
        padding: 0,
        display: "flex",
        alignItems: "center",
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          left: checked ? "26px" : "4px",
          transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
        }}
      />
    </button>
  );
};

import { AntiAbuseTab } from "./AntiAbuseTab";

export default function AdminDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'users' | 'gates' | 'scrapers' | 'alerts' | 'anti-abuse'>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // User Deletion State
  const [mounted, setMounted] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // User Directory Filters & Sorting State
  const [subscriptionFilter, setSubscriptionFilter] = useState<'ALL' | 'FREE' | 'PRO' | 'BUSINESS'>('ALL');
  const [lastLoginFilter, setLastLoginFilter] = useState<string>('ALL');
  const [firstLoginFilter, setFirstLoginFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'name' | 'role' | 'planTier' | 'createdAt' | 'lastLoginAt' | 'jobsAppliedCount' | 'jobsFoundCount' | 'jobsSavedCount'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setMounted(true);
  }, []);

  // System Alerts State
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [dailyCost, setDailyCost] = useState<number>(0);
  const [aiCostToday, setAiCostToday] = useState<{ total: number; byProvider: { provider: string; cost: number; calls: number }[] } | null>(null);
  const [aiCostMonth, setAiCostMonth] = useState<{ total: number; byProvider: { provider: string; cost: number; calls: number }[] } | null>(null);
  const [scraperApiStats, setScraperApiStats] = useState<{
    requestCount: number | null;
    requestLimit: number | null;
    concurrentRequests: number | null;
    concurrentRequestsLimit: number | null;
    planName?: string | null;
    monthlyCostUsd?: number | null;
    error?: string;
  } | null>(null);
  const [serpApiStats, setSerpApiStats] = useState<{
    planName: string | null;
    searchesLeft: number | null;
    searchesPerMonth: number | null;
    thisMonthUsage: number | null;
    monthlyCostUsd?: number | null;
    error?: string;
  } | null>(null);
  const [s3Stats, setS3Stats] = useState<{ objectCount: number | null; totalSizeBytes: number | null; estimatedMonthlyCostUsd: number | null; error?: string } | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // Gates State
  const [settings, setSettings] = useState<GlobalSettings>({
    greenhouseIsPro: false,
    leverIsPro: true,
    ashbyIsPro: true,
    workableIsPro: true,
    smartrecruitersIsPro: true,
    breezyIsPro: true,
    workdayIsPro: true,
    taleoIsPro: true,
    icimsIsPro: true,

    linkedinIsPro: false,
    indeedIsPro: true,
    glassdoorIsPro: true,
    ziprecruiterIsPro: true,
    diceIsPro: true,

    remotiveIsPro: false,
    remotepocIsPro: false,
    nodeskIsPro: false,
    weworkremotelyIsPro: true,
    remoteokIsPro: true,
    workingnomadsIsPro: true,
    ottaIsPro: true,
    himalayasIsPro: true,

    arbeitnowIsPro: true,
    themuseIsPro: true,
    computrabajoIsPro: true,
    jobbankIsPro: true,

    snagajobIsPro: false,
    usajobsIsPro: false,
    builtinIsPro: false,

    emailsSyncIsPro: true,
    aiOpportunityScoringIsPro: true,
    aiAssetGenerationIsPro: true,
    aiQaHelperIsPro: true,

    recruiterNetworkEnabled: false,
    recruiterPortalEnabled: false,
    recruiterDiscoveryEnabled: false,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Scraper Logs State
  const [scraperLogs, setScraperLogs] = useState<any[]>([]);
  const [scraperStats, setScraperStats] = useState<any>(null);
  const [loadingScrapers, setLoadingScrapers] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (session && (session.user as any)?.role !== 'SYSTEM_ADMIN') {
      router.push('/dashboard');
    }
  }, [session, router]);

  // Fetch Users
  useEffect(() => {
    if (activeTab === 'users' && session && (session.user as any)?.role === 'SYSTEM_ADMIN') {
      setLoadingUsers(true);
      fetch('/api/admin/users')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setUsers(data);
          } else if (data && data.error) {
            console.error("Error fetching users:", data.error);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }
  }, [activeTab, session]);

  // Fetch System Alerts
  useEffect(() => {
    if (activeTab === 'alerts' && session && (session.user as any)?.role === 'SYSTEM_ADMIN') {
      setLoadingAlerts(true);
      fetch('/api/admin/alerts')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSystemAlerts(data.alerts || []);
            setDailyCost(data.dailyCost || 0);
            setAiCostToday(data.aiCostToday || null);
            setAiCostMonth(data.aiCostMonth || null);
            setScraperApiStats(data.scraperApiStats || null);
            setSerpApiStats(data.serpApiStats || null);
            setS3Stats(data.s3Stats || null);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingAlerts(false));
    }
  }, [activeTab, session]);

  // Fetch Scraper Logs
  useEffect(() => {
    if (activeTab === 'scrapers' && session && (session.user as any)?.role === 'SYSTEM_ADMIN') {
      setLoadingScrapers(true);
      fetch('/api/admin/scrapers/logs')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setScraperLogs(data.logs || []);
            setScraperStats(data.stats || null);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingScrapers(false));
    }
  }, [activeTab, session]);

  // Fetch Settings
  useEffect(() => {
    if (activeTab === 'gates' && session && (session.user as any)?.role === 'SYSTEM_ADMIN') {
      setLoadingSettings(true);
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSettings({
              greenhouseIsPro: data.greenhouseIsPro ?? false,
              leverIsPro: data.leverIsPro ?? true,
              ashbyIsPro: data.ashbyIsPro ?? true,
              workableIsPro: data.workableIsPro ?? true,
              smartrecruitersIsPro: data.smartrecruitersIsPro ?? true,
              breezyIsPro: data.breezyIsPro ?? true,
              workdayIsPro: data.workdayIsPro ?? true,
              taleoIsPro: data.taleoIsPro ?? true,
              icimsIsPro: data.icimsIsPro ?? true,

              linkedinIsPro: data.linkedinIsPro ?? false,
              indeedIsPro: data.indeedIsPro ?? true,
              glassdoorIsPro: data.glassdoorIsPro ?? true,
              ziprecruiterIsPro: data.ziprecruiterIsPro ?? true,
              diceIsPro: data.diceIsPro ?? true,

              remotiveIsPro: data.remotiveIsPro ?? false,
              remotepocIsPro: data.remotepocIsPro ?? false,
              nodeskIsPro: data.nodeskIsPro ?? false,
              weworkremotelyIsPro: data.weworkremotelyIsPro ?? true,
              remoteokIsPro: data.remoteokIsPro ?? true,
              workingnomadsIsPro: data.workingnomadsIsPro ?? true,
              ottaIsPro: data.ottaIsPro ?? true,
              himalayasIsPro: data.himalayasIsPro ?? true,

              arbeitnowIsPro: data.arbeitnowIsPro ?? true,
              themuseIsPro: data.themuseIsPro ?? true,
              computrabajoIsPro: data.computrabajoIsPro ?? true,
              jobbankIsPro: data.jobbankIsPro ?? true,

              snagajobIsPro: data.snagajobIsPro ?? false,
              usajobsIsPro: data.usajobsIsPro ?? false,
              builtinIsPro: data.builtinIsPro ?? false,

              emailsSyncIsPro: data.emailsSyncIsPro ?? true,
              aiOpportunityScoringIsPro: data.aiOpportunityScoringIsPro ?? true,
              aiAssetGenerationIsPro: data.aiAssetGenerationIsPro ?? true,
              aiQaHelperIsPro: data.aiQaHelperIsPro ?? true,

              recruiterNetworkEnabled: data.recruiterNetworkEnabled ?? false,
              recruiterPortalEnabled: data.recruiterPortalEnabled ?? false,
              recruiterDiscoveryEnabled: data.recruiterDiscoveryEnabled ?? false,
            });
          }
        })
        .catch(console.error)
        .finally(() => setLoadingSettings(false));
    }
  }, [activeTab, session]);

  const handleUpdateUser = async (userId: string, updates: Partial<UserRecord>) => {
    setSavingUserId(userId);
    const currentUser = users.find(u => u.id === userId);
    if (!currentUser) return;

    const payload = {
      userId,
      role: updates.role ?? currentUser.role,
      planTier: updates.planTier ?? currentUser.planTier,
    };

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
      } else {
        alert('Failed to update user');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating user');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setUserToDelete(null);
      } else {
        alert(data.error || 'Failed to delete user');
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting user');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        alert('Global settings saved successfully!');
      } else {
        alert('Failed to save settings');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSort = (field: 'name' | 'role' | 'planTier' | 'createdAt' | 'lastLoginAt' | 'jobsAppliedCount' | 'jobsFoundCount' | 'jobsSavedCount') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "Never";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "Never";
    }
  };

  const now = Date.now();

  const filteredUsers = users.filter(u => {
    // Search query (name or email)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      const nameMatch = u.name?.toLowerCase().includes(query) || false;
      const emailMatch = u.email?.toLowerCase().includes(query) || false;
      if (!nameMatch && !emailMatch) return false;
    }

    // Subscription filter
    if (subscriptionFilter !== 'ALL') {
      if ((u.planTier || 'FREE').toUpperCase() !== subscriptionFilter) return false;
    }

    // First Logged In filter
    if (firstLoginFilter !== 'ALL') {
      const days = parseInt(firstLoginFilter, 10);
      if (!u.createdAt) return false;
      const userDate = new Date(u.createdAt).getTime();
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      if (userDate < cutoff) return false;
    }

    // Last Logged In filter
    if (lastLoginFilter !== 'ALL') {
      const days = parseInt(lastLoginFilter, 10);
      if (!u.lastLoginAt) return false;
      const userDate = new Date(u.lastLoginAt).getTime();
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      if (userDate < cutoff) return false;
    }

    return true;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let valA: any = a[sortField as keyof UserRecord];
    let valB: any = b[sortField as keyof UserRecord];

    if (sortField === 'name') {
      valA = (a.name || a.email || '').toLowerCase();
      valB = (b.name || b.email || '').toLowerCase();
    } else if (sortField === 'createdAt' || sortField === 'lastLoginAt') {
      valA = valA ? new Date(valA).getTime() : 0;
      valB = valB ? new Date(valB).getTime() : 0;
    } else if (sortField === 'jobsAppliedCount' || sortField === 'jobsFoundCount' || sortField === 'jobsSavedCount') {
      valA = valA || 0;
      valB = valB || 0;
    } else {
      valA = (valA || '').toLowerCase();
      valB = (valB || '').toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (!session || (session.user as any)?.role !== 'SYSTEM_ADMIN') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <ShieldAlert size={48} className="text-accent" />
        <h3 style={{ color: "var(--text-primary)" }}>Access Denied</h3>
        <p style={{ color: 'var(--text-secondary)' }}>You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <PageHeader>
        <div>
          <PageHeaderHeading style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Shield size={24} style={{ color: "var(--primary)" }} /> System Administration
          </PageHeaderHeading>
          <PageHeaderDescription>Manage user accounts, subscription overrides, system alerts, and global feature gates</PageHeaderDescription>
        </div>
      </PageHeader>

      {/* Admin Navigation Tabs */}
      <div
        className="app-segmented-tabs admin-tabs-container"
        role="tablist"
        aria-label="Admin Navigation Tabs"
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "nowrap",
          width: "100%",
          overflowY: "hidden",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
          className={`app-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          style={{
            padding: "0.55rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <Users size={16} /> User Directory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'alerts'}
          onClick={() => setActiveTab('alerts')}
          className={`app-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          style={{
            padding: "0.55rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <AlertTriangle size={16} /> System Alerts
          {systemAlerts.length > 0 && (
            <span style={{ background: activeTab === 'alerts' ? "rgba(255, 255, 255, 0.3)" : "var(--accent-color, #ef4444)", color: "white", padding: "0.1rem 0.45rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "bold" }}>
              {systemAlerts.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'gates'}
          onClick={() => setActiveTab('gates')}
          className={`app-tab-btn ${activeTab === 'gates' ? 'active' : ''}`}
          style={{
            padding: "0.55rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <Sliders size={16} /> Feature Gates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'scrapers'}
          onClick={() => setActiveTab('scrapers')}
          className={`app-tab-btn ${activeTab === 'scrapers' ? 'active' : ''}`}
          style={{
            padding: "0.55rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <Cpu size={16} /> Scrapers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'anti-abuse'}
          onClick={() => setActiveTab('anti-abuse')}
          className={`app-tab-btn ${activeTab === 'anti-abuse' ? 'active' : ''}`}
          style={{
            padding: "0.55rem 1rem",
            fontSize: "0.88rem",
          }}
        >
          <ShieldAlert size={16} /> Multi-Account & Anti-Abuse
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'anti-abuse' && <AntiAbuseTab />}

      {activeTab === 'users' && (
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Registered Users ({sortedUsers.length} of {users.length})
            </h3>
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {/* Search */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={16} color="var(--text-secondary)" style={{ position: "absolute", left: "12px" }} />
                <input
                  type="text"
                  placeholder="Search name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--border-glass)",
                    color: "var(--text-primary)",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    width: "220px"
                  }}
                />
              </div>

              {/* Subscription Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Filter size={14} color="var(--text-secondary)" />
                <select
                  value={subscriptionFilter}
                  onChange={(e) => setSubscriptionFilter(e.target.value as any)}
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-glass)",
                    padding: "0.5rem 0.65rem",
                    borderRadius: "8px",
                    fontSize: "0.85rem"
                  }}
                >
                  <option value="ALL">All Subscriptions</option>
                  <option value="FREE">Free</option>
                  <option value="PRO">Pro</option>
                  <option value="BUSINESS">Business</option>
                </select>
              </div>

              {/* First Logged In Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Calendar size={14} color="var(--text-secondary)" />
                <select
                  value={firstLoginFilter}
                  onChange={(e) => setFirstLoginFilter(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-glass)",
                    padding: "0.5rem 0.65rem",
                    borderRadius: "8px",
                    fontSize: "0.85rem"
                  }}
                >
                  <option value="ALL">First Login: All Time</option>
                  <option value="1">First Login: Past 1 Day</option>
                  <option value="7">First Login: Past 7 Days</option>
                  <option value="30">First Login: Past 30 Days</option>
                  <option value="60">First Login: Past 60 Days</option>
                  <option value="90">First Login: Past 90 Days</option>
                </select>
              </div>

              {/* Last Logged In Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Calendar size={14} color="var(--text-secondary)" />
                <select
                  value={lastLoginFilter}
                  onChange={(e) => setLastLoginFilter(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-glass)",
                    padding: "0.5rem 0.65rem",
                    borderRadius: "8px",
                    fontSize: "0.85rem"
                  }}
                >
                  <option value="ALL">Last Login: All Time</option>
                  <option value="1">Last Login: Past 1 Day</option>
                  <option value="7">Last Login: Past 7 Days</option>
                  <option value="30">Last Login: Past 30 Days</option>
                  <option value="60">Last Login: Past 60 Days</option>
                  <option value="90">Last Login: Past 90 Days</option>
                </select>
              </div>
            </div>
          </div>

          {loadingUsers ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>Loading users...</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-glass)", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('name')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        User
                        {sortField === 'name' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('role')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Role
                        {sortField === 'role' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('planTier')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Subscription
                        {sortField === 'planTier' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('createdAt')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        First Logged In
                        {sortField === 'createdAt' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('lastLoginAt')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Last Logged In
                        {sortField === 'lastLoginAt' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('jobsFoundCount')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Jobs Found
                        {sortField === 'jobsFoundCount' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('jobsSavedCount')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Jobs Saved
                        {sortField === 'jobsSavedCount' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem", cursor: "pointer", userSelect: "none" }} onClick={() => handleSort('jobsAppliedCount')}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                        Jobs Applied
                        {sortField === 'jobsAppliedCount' ? (sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} style={{ opacity: 0.4 }} />}
                      </div>
                    </th>
                    <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: "1px solid var(--border-glass)", fontSize: "0.95rem" }}>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{user.name || "No name"}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{user.email}</span>
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span className={user.role === 'SYSTEM_ADMIN' ? 'tag tag-pro' : 'tag tag-free'} style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem" }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span className={user.planTier === 'PRO' || user.planTier === 'BUSINESS' ? 'text-accent' : ''} style={{ fontWeight: user.planTier === 'PRO' || user.planTier === 'BUSINESS' ? 600 : 400 }}>
                          {user.planTier}
                        </span>
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {formatDate(user.createdAt)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        {formatDate(user.lastLoginAt)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        {user.jobsFoundCount ?? 0}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        {user.jobsSavedCount ?? 0}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 500 }}>
                        {user.jobsAppliedCount ?? 0}
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          {/* Role selector */}
                          <select
                            value={user.role}
                            disabled={savingUserId === user.id || deletingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { role: e.target.value as 'USER' | 'ORGANIZATION_ADMIN' | 'SYSTEM_ADMIN' })}
                            style={{ background: "var(--bg-color)", color: "var(--text-primary)", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
                          >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                          </select>

                          {/* Plan selector */}
                          <select
                            value={user.planTier}
                            disabled={savingUserId === user.id || deletingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { planTier: e.target.value })}
                            style={{ background: "var(--bg-color)", color: "var(--text-primary)", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
                          >
                            <option value="FREE">Free</option>
                            <option value="PRO">Pro</option>
                            <option value="BUSINESS">Business</option>
                          </select>

                          {/* Delete single user button */}
                          <button
                            onClick={() => setUserToDelete(user)}
                            disabled={user.role === 'SYSTEM_ADMIN' || user.id === (session?.user as any)?.id || deletingUserId === user.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0.35rem 0.5rem",
                              background: "rgba(239, 68, 68, 0.1)",
                              color: "#ef4444",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: "6px",
                              cursor: user.role === 'SYSTEM_ADMIN' || user.id === (session?.user as any)?.id ? "not-allowed" : "pointer",
                              opacity: user.role === 'SYSTEM_ADMIN' || user.id === (session?.user as any)?.id ? 0.3 : 1
                            }}
                            title={user.role === 'SYSTEM_ADMIN' ? "Admin accounts cannot be deleted" : "Delete user account"}
                          >
                            <Trash2 size={15} />
                          </button>

                          {savingUserId === user.id && <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Saving...</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedUsers.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                        No users found matching your search and filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* ── Service Cost Overview ───────────────────────────── */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
              <Cpu size={18} style={{ color: 'var(--accent-primary)' }} /> Service Cost Overview
            </h3>

            {loadingAlerts ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading cost data...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

                {/* AI APIs */}
                <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Sparkles size={16} style={{ color: '#818cf8' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>AI APIs</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(99,102,241,0.12)', padding: '1px 8px', borderRadius: '99px' }}>pay-per-token</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Today</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#818cf8' }}>${(aiCostToday?.total ?? dailyCost).toFixed(4)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>This Month</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#818cf8' }}>${(aiCostMonth?.total ?? 0).toFixed(4)}</div>
                    </div>
                  </div>
                  {(aiCostToday?.byProvider ?? []).length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(99,102,241,0.2)', paddingTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {(aiCostToday?.byProvider ?? []).map(p => (
                        <div key={p.provider} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{p.provider}</span>
                          <span style={{ fontWeight: 600 }}>${p.cost.toFixed(4)} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({p.calls} calls)</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(aiCostToday?.byProvider ?? []).length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No AI calls logged today.</div>
                  )}
                  <div style={{ marginTop: '0.6rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Daily safeguard limit: <strong>$5.00</strong></div>
                </div>

                {/* ScraperAPI */}
                <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Shield size={16} style={{ color: '#34d399' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>ScraperAPI</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#34d399', background: 'rgba(16,185,129,0.12)', padding: '1px 8px', borderRadius: '99px' }}>
                      {scraperApiStats?.planName ?? 'Hobby'} • ${(scraperApiStats?.monthlyCostUsd ?? 49).toFixed(2)}/mo
                    </span>
                  </div>
                  {scraperApiStats?.error ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>{scraperApiStats.error}</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.65rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', padding: '0.45rem 0.65rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Subscription Plan</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399' }}>
                          ${(scraperApiStats?.monthlyCostUsd ?? 49).toFixed(2)}
                          <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '2px' }}>/mo</span>
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', marginBottom: '0.65rem' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Used This Month</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>
                            {scraperApiStats?.requestCount != null ? scraperApiStats.requestCount.toLocaleString() : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Monthly Limit</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399' }}>
                            {scraperApiStats?.requestLimit != null ? scraperApiStats.requestLimit.toLocaleString() : '—'}
                          </div>
                        </div>
                      </div>
                      {scraperApiStats?.requestCount != null && scraperApiStats?.requestLimit != null && (
                        <>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (scraperApiStats.requestCount / scraperApiStats.requestLimit) * 100)}%`, background: '#34d399', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            {Math.round((scraperApiStats.requestCount / scraperApiStats.requestLimit) * 100)}% of {scraperApiStats.requestLimit.toLocaleString()} monthly requests used
                          </div>
                        </>
                      )}
                      {scraperApiStats?.concurrentRequests != null && (
                        <div style={{ borderTop: '1px solid rgba(16,185,129,0.2)', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Concurrent Requests</span>
                            <span style={{ color: '#34d399', fontWeight: 600 }}>
                              {scraperApiStats.concurrentRequests} / {scraperApiStats.concurrentRequestsLimit ?? '?'}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* SerpAPI */}
                <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Search size={16} style={{ color: '#fbbf24' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>SerpAPI</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '1px 8px', borderRadius: '99px' }}>
                      {serpApiStats?.planName ?? 'Developer'} • ${(serpApiStats?.monthlyCostUsd ?? 50).toFixed(2)}/mo
                    </span>
                  </div>
                  {serpApiStats?.error ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>{serpApiStats.error}</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.65rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)', padding: '0.45rem 0.65rem', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Subscription Plan</span>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24' }}>
                          ${(serpApiStats?.monthlyCostUsd ?? 50).toFixed(2)}
                          <span style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '2px' }}>/mo</span>
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', marginBottom: '0.65rem' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Searches Left</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24' }}>
                            {serpApiStats?.searchesLeft != null ? serpApiStats.searchesLeft.toLocaleString() : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Monthly Plan</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24' }}>
                            {serpApiStats?.searchesPerMonth != null ? serpApiStats.searchesPerMonth.toLocaleString() : '—'}
                          </div>
                        </div>
                      </div>
                      {serpApiStats?.searchesLeft != null && serpApiStats?.searchesPerMonth != null && (
                        <>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '99px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, ((serpApiStats.searchesPerMonth - serpApiStats.searchesLeft) / serpApiStats.searchesPerMonth) * 100)}%`, background: '#fbbf24', borderRadius: '99px', transition: 'width 0.4s ease' }} />
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {Math.round(((serpApiStats.searchesPerMonth - serpApiStats.searchesLeft) / serpApiStats.searchesPerMonth) * 100)}% of {serpApiStats.searchesPerMonth.toLocaleString()} monthly searches used
                          </div>
                        </>
                      )}
                      {serpApiStats?.thisMonthUsage != null && (
                        <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(251,191,36,0.2)', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <span>This Month Usage</span>
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>{serpApiStats.thisMonthUsage.toLocaleString()} searches</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* AWS S3 */}
                <div style={{ background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1rem' }}>🪣</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>AWS S3</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(251,146,60,0.12)', padding: '1px 8px', borderRadius: '99px' }}>the-job-agent</span>
                  </div>
                  {s3Stats?.error ? (
                    <div style={{ fontSize: '0.82rem', color: 'var(--danger)' }}>{s3Stats.error}</div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', marginBottom: '0.65rem' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Objects</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fb923c' }}>
                            {s3Stats?.objectCount != null ? s3Stats.objectCount.toLocaleString() : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Storage</div>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fb923c' }}>
                            {s3Stats?.totalSizeBytes != null
                              ? s3Stats.totalSizeBytes < 1_048_576
                                ? `${(s3Stats.totalSizeBytes / 1024).toFixed(1)} KB`
                                : s3Stats.totalSizeBytes < 1_073_741_824
                                  ? `${(s3Stats.totalSizeBytes / 1_048_576).toFixed(1)} MB`
                                  : `${(s3Stats.totalSizeBytes / 1_073_741_824).toFixed(2)} GB`
                              : '—'}
                          </div>
                        </div>
                      </div>
                      <div style={{ borderTop: '1px solid rgba(251,146,60,0.2)', paddingTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Est. monthly cost: <strong style={{ color: '#fb923c' }}>
                          {s3Stats?.estimatedMonthlyCostUsd != null ? `$${s3Stats.estimatedMonthlyCostUsd.toFixed(4)}` : '—'}
                        </strong>
                        <span style={{ fontSize: '0.7rem', display: 'block', marginTop: '2px', opacity: 0.7 }}>Based on $0.023/GB storage + 20% egress estimate</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Railway — static reference */}
                <div style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '12px', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1rem' }}>🚂</span>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Railway</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#c084fc', background: 'rgba(168,85,247,0.12)', padding: '1px 8px', borderRadius: '99px' }}>static ref</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {[
                      { label: 'Next.js Web App', value: '~$5–15/mo', note: 'usage-based (CPU/RAM/egress)' },
                      { label: 'Auto-Apply Worker', value: '~$5–15/mo', note: 'dedicated worker service' },
                      { label: 'PostgreSQL DB', value: '~$5–10/mo', note: 'included in Railway Postgres add-on' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, color: '#c084fc' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Check railway.app/billing for live spend.</div>
                </div>

              </div>
            )}
          </div>

          {/* ── Action Required Alerts ──────────────────────────── */}
          <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={20} className="text-accent" /> Action Required Alerts
              </h3>
              <div style={{ background: "rgba(255, 60, 60, 0.1)", border: "1px solid rgba(255, 60, 60, 0.2)", padding: "0.5rem 1rem", borderRadius: "8px", color: "var(--text-primary)" }}>
                Today's AI Cost: <strong>${dailyCost.toFixed(4)}</strong> / $5.00
              </div>
            </div>

            {loadingAlerts ? (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>Loading alerts...</div>
            ) : systemAlerts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)", background: "rgba(0,0,0,0.1)", borderRadius: "12px" }}>
                <Check size={48} style={{ margin: "0 auto 1rem", opacity: 0.5, color: "#4caf50" }} />
                <p>All clear! No active system alerts.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {systemAlerts.map(alert => (
                  <div key={alert.id} style={{ padding: "1.5rem", border: "1px solid rgba(255,60,60,0.3)", background: "rgba(255,60,60,0.05)", borderRadius: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                          <span style={{ background: "#ff3b30", color: "#fff", fontSize: "0.75rem", padding: "0.2rem 0.5rem", borderRadius: "4px", fontWeight: "bold" }}>
                            {alert.type}
                          </span>
                          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                            {new Date(alert.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p style={{ fontWeight: 500, fontSize: "1.1rem", marginBottom: "1rem" }}>{alert.message}</p>

                        {alert.metadata && (
                          <pre style={{ background: "rgba(0,0,0,0.3)", padding: "1rem", borderRadius: "8px", fontSize: "0.85rem", overflowX: "auto" }}>
                            {JSON.stringify(alert.metadata, null, 2)}
                          </pre>
                        )}
                      </div>

                      <button
                        className="btn-primary"
                        onClick={async () => {
                          try {
                            await fetch('/api/admin/alerts', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ alertId: alert.id })
                            });
                            setSystemAlerts(systemAlerts.filter(a => a.id !== alert.id));
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'gates' && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Main settings description */}
          <div className="glass-card">
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              Global Feature Access Controls
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Control which individual crawlers and AI features require an active **PRO** plan subscription.
            </p>
          </div>

          {loadingSettings ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>Loading system settings...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              
              {/* Category 1: AI Features */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "1.1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
                  <Sparkles size={18} className="text-accent" /> AI Features (Pro Gated)
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>AI Opportunity Scoring</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Scores jobs against user preferences using Google Gemini.</div>
                    </div>
                    <ToggleSwitch checked={settings.aiOpportunityScoringIsPro} onChange={() => setSettings({ ...settings, aiOpportunityScoringIsPro: !settings.aiOpportunityScoringIsPro })} />
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>AI Tailored Resume & Cover Letter</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Generates custom resume/cover letter markdown drafts using Anthropic Claude.</div>
                    </div>
                    <ToggleSwitch checked={settings.aiAssetGenerationIsPro} onChange={() => setSettings({ ...settings, aiAssetGenerationIsPro: !settings.aiAssetGenerationIsPro })} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>AI Application Q&A Helper</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Drafts high-quality application responses to custom job application questions.</div>
                    </div>
                    <ToggleSwitch checked={settings.aiQaHelperIsPro} onChange={() => setSettings({ ...settings, aiQaHelperIsPro: !settings.aiQaHelperIsPro })} />
                  </div>
                </div>
              </div>

              {/* Category 2: Email Sync */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "1.1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
                  <Mail size={18} className="text-accent" /> Integration Pipelines
                </h4>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Email Sync (IMAP)</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Automatically crawls and scans linked user mailboxes to discover job alerts.</div>
                  </div>
                  <ToggleSwitch checked={settings.emailsSyncIsPro} onChange={() => setSettings({ ...settings, emailsSyncIsPro: !settings.emailsSyncIsPro })} />
                </div>
              </div>

              {/* Category: Recruiter Network Rollout */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "1.1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
                  <Users size={18} className="text-accent" /> Recruiter Network (Beta Rollout)
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Recruiter Network Core</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Master switch for recruiter network matching and attribution.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings.recruiterNetworkEnabled)}
                      onChange={() => setSettings({ ...settings, recruiterNetworkEnabled: !settings.recruiterNetworkEnabled })}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Recruiter Portal UI</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Enables recruiter dashboard, job opening management, and candidate search interface.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings.recruiterPortalEnabled)}
                      onChange={() => setSettings({ ...settings, recruiterPortalEnabled: !settings.recruiterPortalEnabled })}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Candidate Discovery Settings</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Displays recruiter visibility and opt-in controls in candidate settings.</div>
                    </div>
                    <ToggleSwitch
                      checked={Boolean(settings.recruiterDiscoveryEnabled)}
                      onChange={() => setSettings({ ...settings, recruiterDiscoveryEnabled: !settings.recruiterDiscoveryEnabled })}
                    />
                  </div>
                </div>
              </div>

              {/* Category 3: Crawlers */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "1.1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
                  <Cpu size={18} className="text-accent" /> Job Search Crawlers (Pro Access Gating)
                </h4>

                {/* Subcategory: Global Aggregators */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h5 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: 0, fontWeight: 600 }}>
                    Global Aggregators
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Indeed</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Indeed job search</div>
                      </div>
                      <ToggleSwitch checked={settings.indeedIsPro} onChange={() => setSettings({ ...settings, indeedIsPro: !settings.indeedIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>LinkedIn</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>LinkedIn job search</div>
                      </div>
                      <ToggleSwitch checked={settings.linkedinIsPro} onChange={() => setSettings({ ...settings, linkedinIsPro: !settings.linkedinIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>ZipRecruiter</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>ZipRecruiter job search</div>
                      </div>
                      <ToggleSwitch checked={settings.ziprecruiterIsPro} onChange={() => setSettings({ ...settings, ziprecruiterIsPro: !settings.ziprecruiterIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Dice</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Dice.com tech job search</div>
                      </div>
                      <ToggleSwitch checked={settings.diceIsPro} onChange={() => setSettings({ ...settings, diceIsPro: !settings.diceIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Snagajob</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Snagajob non-tech & hourly job search</div>
                      </div>
                      <ToggleSwitch checked={settings.snagajobIsPro ?? false} onChange={() => setSettings({ ...settings, snagajobIsPro: !settings.snagajobIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>USAJobs</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>USAJobs federal & government job search</div>
                      </div>
                      <ToggleSwitch checked={settings.usajobsIsPro ?? false} onChange={() => setSettings({ ...settings, usajobsIsPro: !settings.usajobsIsPro })} />
                    </div>
                  </div>
                </div>

                {/* Subcategory: US / Remote Tech */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h5 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: 0, fontWeight: 600 }}>
                    US / Remote Tech
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Built In</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>BuiltIn tech & startup job search</div>
                      </div>
                      <ToggleSwitch checked={settings.builtinIsPro ?? false} onChange={() => setSettings({ ...settings, builtinIsPro: !settings.builtinIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>WeWorkRemotely</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>WeWorkRemotely aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.weworkremotelyIsPro} onChange={() => setSettings({ ...settings, weworkremotelyIsPro: !settings.weworkremotelyIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>RemoteOK</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>RemoteOK aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.remoteokIsPro} onChange={() => setSettings({ ...settings, remoteokIsPro: !settings.remoteokIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>WorkingNomads</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>WorkingNomads aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.workingnomadsIsPro} onChange={() => setSettings({ ...settings, workingnomadsIsPro: !settings.workingnomadsIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Remotive</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Remotive Remote Aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.remotiveIsPro} onChange={() => setSettings({ ...settings, remotiveIsPro: !settings.remotiveIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>RemotePOC</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>RemotePOC jobs board</div>
                      </div>
                      <ToggleSwitch checked={settings.remotepocIsPro} onChange={() => setSettings({ ...settings, remotepocIsPro: !settings.remotepocIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>noDesk</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>noDesk remote jobs</div>
                      </div>
                      <ToggleSwitch checked={settings.nodeskIsPro} onChange={() => setSettings({ ...settings, nodeskIsPro: !settings.nodeskIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Otta</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Otta tech jobs board</div>
                      </div>
                      <ToggleSwitch checked={settings.ottaIsPro} onChange={() => setSettings({ ...settings, ottaIsPro: !settings.ottaIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Himalayas</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Himalayas remote tech jobs aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.himalayasIsPro} onChange={() => setSettings({ ...settings, himalayasIsPro: !settings.himalayasIsPro })} />
                    </div>
                  </div>
                </div>

                {/* Subcategory: ATS Integrations */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h5 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: 0, fontWeight: 600 }}>
                    ATS Integrations
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Greenhouse</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Greenhouse ATS integration</div>
                      </div>
                      <ToggleSwitch checked={settings.greenhouseIsPro} onChange={() => setSettings({ ...settings, greenhouseIsPro: !settings.greenhouseIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Lever</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Lever ATS scraping</div>
                      </div>
                      <ToggleSwitch checked={settings.leverIsPro} onChange={() => setSettings({ ...settings, leverIsPro: !settings.leverIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Ashby</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Ashby ATS scraping</div>
                      </div>
                      <ToggleSwitch checked={settings.ashbyIsPro} onChange={() => setSettings({ ...settings, ashbyIsPro: !settings.ashbyIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Workable</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Workable ATS scraping</div>
                      </div>
                      <ToggleSwitch checked={settings.workableIsPro} onChange={() => setSettings({ ...settings, workableIsPro: !settings.workableIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>SmartRecruiters</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>SmartRecruiters ATS scraping</div>
                      </div>
                      <ToggleSwitch checked={settings.smartrecruitersIsPro} onChange={() => setSettings({ ...settings, smartrecruitersIsPro: !settings.smartrecruitersIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Breezy</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Breezy HR ATS scraping</div>
                      </div>
                      <ToggleSwitch checked={settings.breezyIsPro} onChange={() => setSettings({ ...settings, breezyIsPro: !settings.breezyIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Workday</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Workday ATS integration</div>
                      </div>
                      <ToggleSwitch checked={settings.workdayIsPro} onChange={() => setSettings({ ...settings, workdayIsPro: !settings.workdayIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Taleo</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Oracle Taleo ATS integration</div>
                      </div>
                      <ToggleSwitch checked={settings.taleoIsPro} onChange={() => setSettings({ ...settings, taleoIsPro: !settings.taleoIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>iCIMS</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>iCIMS ATS integration</div>
                      </div>
                      <ToggleSwitch checked={settings.icimsIsPro} onChange={() => setSettings({ ...settings, icimsIsPro: !settings.icimsIsPro })} />
                    </div>
                  </div>
                </div>

                {/* Subcategory: International Sources */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h5 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", margin: 0, fontWeight: 600 }}>
                    International Sources
                  </h5>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Arbeitnow (DE)</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Germany tech jobs aggregator</div>
                      </div>
                      <ToggleSwitch checked={settings.arbeitnowIsPro} onChange={() => setSettings({ ...settings, arbeitnowIsPro: !settings.arbeitnowIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>The Muse (Global)</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Global career opportunities</div>
                      </div>
                      <ToggleSwitch checked={settings.themuseIsPro} onChange={() => setSettings({ ...settings, themuseIsPro: !settings.themuseIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Computrabajo (LATAM)</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Latin America job portal</div>
                      </div>
                      <ToggleSwitch checked={settings.computrabajoIsPro} onChange={() => setSettings({ ...settings, computrabajoIsPro: !settings.computrabajoIsPro })} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Job Bank (CA)</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Official Government of Canada jobs</div>
                      </div>
                      <ToggleSwitch checked={settings.jobbankIsPro} onChange={() => setSettings({ ...settings, jobbankIsPro: !settings.jobbankIsPro })} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="btn-primary"
                style={{ width: "fit-content", display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Check size={18} /> {savingSettings ? "Saving Settings..." : "Save Feature Gates"}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'scrapers' && (
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Cpu size={20} className="text-accent" /> Scraper Performance (Last 24h)
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Overview of automated job collection runs.</p>
          </div>

          {loadingScrapers ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>Loading scraper data...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {scraperStats && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Total Runs (24h)</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)" }}>{scraperStats.totalRuns24h}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Success Rate</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 600, color: scraperStats.successRate24h >= 90 ? "var(--success)" : "var(--error)" }}>
                      {scraperStats.successRate24h}%
                    </div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Jobs Found (24h)</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)" }}>{scraperStats.totalJobsScraped24h}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>IP Bot Blocks (24h)</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--warning)" }}>{scraperStats.proxyFallbacks24h}</div>
                  </div>
                </div>
              )}

              {/* Scraper Alerts */}
              {scraperLogs.some(log => log.status === 'FAILURE' || log.resultsCount === 0) && (
                <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--error)", padding: "1rem", borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "0.75rem", color: "var(--error)" }}>
                  <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <h4 style={{ fontWeight: 600, marginBottom: "0.25rem" }}>Scraper Anomalies Detected</h4>
                    <p style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      One or more recent scraper runs returned errors or <strong>0 results</strong>. If a scraper consistently returns 0 results for common keywords, its DOM selectors or API may have changed and require developer attention.
                    </p>
                    <ul style={{ margin: "0.5rem 0 0 1.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {Array.from(new Set(scraperLogs.filter(log => log.status === 'FAILURE' || log.resultsCount === 0).map(log => log.scraperName))).map(name => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>Recent Scraper Runs</h4>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-glass)", textAlign: "left" }}>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Scraper</th>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Status</th>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Results</th>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Bot Block / Fallback</th>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Time</th>
                        <th style={{ padding: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scraperLogs.map((log: any) => (
                        <tr key={log.id} style={{ borderBottom: "1px solid var(--border-glass)" }}>
                          <td style={{ padding: "0.75rem", color: "var(--text-primary)", fontWeight: 500 }}>{log.scraperName}</td>
                          <td style={{ padding: "0.75rem" }}>
                            <span className={log.status === 'SUCCESS' ? 'tag tag-pro' : 'tag tag-free'} style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", background: log.status === 'SUCCESS' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: log.status === 'SUCCESS' ? '#22c55e' : '#ef4444' }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>{log.resultsCount} jobs</td>
                          <td style={{ padding: "0.75rem" }}>
                            {log.usedFirecrawl ? (
                              <span title={log.firecrawlSites?.join(', ')} style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--warning)", fontSize: "0.8rem", cursor: "help" }}>
                                <Sparkles size={12} /> IP Blocked ({log.firecrawlSites?.length || 0} sites)
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>Clean IP</span>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--text-secondary)" }}>
                            {new Date(log.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: "0.75rem", color: "var(--error)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.errorDetails}>
                            {log.errorDetails || '-'}
                          </td>
                        </tr>
                      ))}
                      {scraperLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                            No scraper logs found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Single User Deletion Modal */}
      {mounted && userToDelete && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingUserId) setUserToDelete(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '1.75rem',
              color: 'var(--card-foreground)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>Confirm User Deletion</h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--foreground)' }}>{userToDelete.name || userToDelete.email}</strong> ({userToDelete.email})?
              All associated data (saved jobs, assets, and preferences) will be permanently purged.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={deletingUserId === userToDelete.id}
                style={{
                  padding: '0.6rem 1.1rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUser(userToDelete.id)}
                disabled={deletingUserId === userToDelete.id}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {deletingUserId === userToDelete.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Delete User
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


    </div>
  );
}
