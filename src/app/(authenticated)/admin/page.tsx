"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Users, Shield, Sliders, Check, Search, ShieldAlert, Cpu, Sparkles, Mail, AlertTriangle, Trash2, UserX, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface UserRecord {
  id: string;
  name: string | null;
  email: string | null;
  role: 'USER' | 'ADMIN';
  planTier: string;
}

interface GlobalSettings {

  greenhouseIsPro: boolean;
  leverIsPro: boolean;
  ashbyIsPro: boolean;
  workableIsPro: boolean;
  smartrecruitersIsPro: boolean;
  breezyIsPro: boolean;
  remotiveIsPro: boolean;

  remotecoIsPro: boolean;
  remoteokIsPro: boolean;
  workingnomadsIsPro: boolean;
  arbeitnowIsPro: boolean;
  ycombinatorIsPro: boolean;
  himalayasIsPro: boolean;
  ottaIsPro: boolean;
  jobspressoIsPro: boolean;
  justremoteIsPro: boolean;
  emailsSyncIsPro: boolean;
  aiOpportunityScoringIsPro: boolean;
  aiAssetGenerationIsPro: boolean;
  aiQaHelperIsPro: boolean;
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

export default function AdminDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'users' | 'gates' | 'scrapers' | 'alerts'>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // User Deletion & Purge State
  const [mounted, setMounted] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // System Alerts State
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [dailyCost, setDailyCost] = useState<number>(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // Gates State
  const [settings, setSettings] = useState<GlobalSettings>({

    greenhouseIsPro: true,
    leverIsPro: false,
    ashbyIsPro: false,
    workableIsPro: true,
    smartrecruitersIsPro: true,
    breezyIsPro: true,
    remotiveIsPro: true,

    remotecoIsPro: false,
    remoteokIsPro: false,
    workingnomadsIsPro: false,
    arbeitnowIsPro: false,
    ycombinatorIsPro: false,
    himalayasIsPro: true,
    ottaIsPro: true,
    jobspressoIsPro: true,
    justremoteIsPro: true,
    emailsSyncIsPro: true,
    aiOpportunityScoringIsPro: true,
    aiAssetGenerationIsPro: true,
    aiQaHelperIsPro: true,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Scraper Logs State
  const [scraperLogs, setScraperLogs] = useState<any[]>([]);
  const [scraperStats, setScraperStats] = useState<any>(null);
  const [loadingScrapers, setLoadingScrapers] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (session && (session.user as any)?.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [session, router]);

  // Fetch Users
  useEffect(() => {
    if (activeTab === 'users' && session && (session.user as any)?.role === 'ADMIN') {
      setLoadingUsers(true);
      fetch('/api/admin/users')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setUsers(data);
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }
  }, [activeTab, session]);

  // Fetch System Alerts
  useEffect(() => {
    if (activeTab === 'alerts' && session && (session.user as any)?.role === 'ADMIN') {
      setLoadingAlerts(true);
      fetch('/api/admin/alerts')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSystemAlerts(data.alerts || []);
            setDailyCost(data.dailyCost || 0);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingAlerts(false));
    }
  }, [activeTab, session]);

  // Fetch Scraper Logs
  useEffect(() => {
    if (activeTab === 'scrapers' && session && (session.user as any)?.role === 'ADMIN') {
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
    if (activeTab === 'gates' && session && (session.user as any)?.role === 'ADMIN') {
      setLoadingSettings(true);
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSettings({

              greenhouseIsPro: data.greenhouseIsPro ?? true,
              leverIsPro: data.leverIsPro ?? false,
              ashbyIsPro: data.ashbyIsPro ?? false,
              workableIsPro: data.workableIsPro ?? true,
              smartrecruitersIsPro: data.smartrecruitersIsPro ?? true,
              breezyIsPro: data.breezyIsPro ?? true,
              remotiveIsPro: data.remotiveIsPro ?? true,

              remotecoIsPro: data.remotecoIsPro ?? false,
              remoteokIsPro: data.remoteokIsPro ?? false,
              workingnomadsIsPro: data.workingnomadsIsPro ?? false,
              arbeitnowIsPro: data.arbeitnowIsPro ?? false,
              ycombinatorIsPro: data.ycombinatorIsPro ?? false,
              himalayasIsPro: data.himalayasIsPro ?? true,
              ottaIsPro: data.ottaIsPro ?? true,
              jobspressoIsPro: data.jobspressoIsPro ?? true,
              justremoteIsPro: data.justremoteIsPro ?? true,
              emailsSyncIsPro: data.emailsSyncIsPro ?? true,
              aiOpportunityScoringIsPro: data.aiOpportunityScoringIsPro ?? true,
              aiAssetGenerationIsPro: data.aiAssetGenerationIsPro ?? true,
              aiQaHelperIsPro: data.aiQaHelperIsPro ?? true,
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

  const handlePurgeFreeUsers = async () => {
    setIsPurging(true);
    try {
      const res = await fetch('/api/admin/users?deleteFree=true', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(prev => prev.filter(u => u.planTier !== 'FREE' || u.role === 'ADMIN'));
        setShowPurgeModal(false);
        alert(data.message || `Successfully removed free tier users.`);
      } else {
        alert(data.error || 'Failed to purge free tier users');
      }
    } catch (e) {
      console.error(e);
      alert('Error purging free tier users');
    } finally {
      setIsPurging(false);
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

  const filteredUsers = users.filter(u => 
    (u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
    (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) || false)
  );

  if (!session || (session.user as any)?.role !== 'ADMIN') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
        <ShieldAlert size={48} className="text-accent" />
        <h3 style={{ color: "var(--text-primary)" }}>Access Denied</h3>
        <p style={{ color: 'var(--text-secondary)' }}>You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", padding: "1rem" }}>
      <div>
        <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "2rem" }}>
          <Shield size={28} className="text-accent" /> System Administration
        </h2>
        <p className="page-subtitle">Manage user accounts, subscription overrides, and global feature gates.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
        <button
          onClick={() => setActiveTab('users')}
          className={activeTab === 'users' ? 'btn-primary' : 'btn-outline'}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Users size={16} /> User Directory
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={activeTab === 'alerts' ? 'btn-primary' : 'btn-outline'}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <AlertTriangle size={16} /> System Alerts
          {systemAlerts.length > 0 && (
            <span style={{ background: "var(--accent-color)", color: "white", padding: "0.1rem 0.4rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "bold" }}>
              {systemAlerts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('gates')}
          className={activeTab === 'gates' ? 'btn-primary' : 'btn-outline'}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Sliders size={16} /> Feature Gates
        </button>
        <button
          onClick={() => setActiveTab('scrapers')}
          className={activeTab === 'scrapers' ? 'btn-primary' : 'btn-outline'}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Cpu size={16} /> Scrapers
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'users' && (
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Registered Users ({filteredUsers.length})
            </h3>
            
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {/* Purge Free Users Button */}
              {(() => {
                const freeUsersCount = users.filter(u => u.planTier === 'FREE' && u.role !== 'ADMIN').length;
                return (
                  <button
                    onClick={() => setShowPurgeModal(true)}
                    disabled={freeUsersCount === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 0.85rem",
                      background: freeUsersCount > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(255,255,255,0.05)",
                      color: freeUsersCount > 0 ? "#ef4444" : "var(--text-secondary)",
                      border: freeUsersCount > 0 ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border-glass)",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      cursor: freeUsersCount > 0 ? "pointer" : "not-allowed",
                      transition: "all 0.2s ease",
                      opacity: freeUsersCount === 0 ? 0.6 : 1
                    }}
                    title={freeUsersCount === 0 ? "No free tier non-admin users to purge" : "Purge all free tier users"}
                  >
                    <UserX size={16} /> Remove Free Tier Users ({freeUsersCount})
                  </button>
                );
              })()}

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
                    fontSize: "0.9rem",
                    width: "230px"
                  }}
                />
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
                    <th style={{ padding: "1rem" }}>User</th>
                    <th style={{ padding: "1rem" }}>Role</th>
                    <th style={{ padding: "1rem" }}>Subscription</th>
                    <th style={{ padding: "1rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} style={{ borderBottom: "1px solid var(--border-glass)", fontSize: "0.95rem" }}>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{user.name || "No name"}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{user.email}</span>
                        </div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span className={user.role === 'ADMIN' ? 'tag tag-pro' : 'tag tag-free'} style={{ padding: "0.25rem 0.5rem", borderRadius: "4px", fontSize: "0.8rem" }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span className={user.planTier === 'PRO' ? 'text-accent' : ''} style={{ fontWeight: user.planTier === 'PRO' ? 600 : 400 }}>
                          {user.planTier}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          {/* Role selector */}
                          <select
                            value={user.role}
                            disabled={savingUserId === user.id || deletingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { role: e.target.value as 'USER' | 'ADMIN' })}
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
                          </select>

                          {/* Delete single user button */}
                          <button
                            onClick={() => setUserToDelete(user)}
                            disabled={user.role === 'ADMIN' || user.id === (session?.user as any)?.id || deletingUserId === user.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "0.35rem 0.5rem",
                              background: "rgba(239, 68, 68, 0.1)",
                              color: "#ef4444",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              borderRadius: "6px",
                              cursor: user.role === 'ADMIN' || user.id === (session?.user as any)?.id ? "not-allowed" : "pointer",
                              opacity: user.role === 'ADMIN' || user.id === (session?.user as any)?.id ? 0.3 : 1
                            }}
                            title={user.role === 'ADMIN' ? "Admin accounts cannot be deleted" : "Delete user account"}
                          >
                            <Trash2 size={15} />
                          </button>

                          {savingUserId === user.id && <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Saving...</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
                        No users found matching your search.
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

              {/* Category 3: Crawlers */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", fontSize: "1.1rem", borderBottom: "1px solid var(--border-glass)", paddingBottom: "0.5rem" }}>
                  <Cpu size={18} className="text-accent" /> Job Search Crawlers
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  {/* Greenhouse */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Greenhouse</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Greenhouse ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.greenhouseIsPro} onChange={() => setSettings({ ...settings, greenhouseIsPro: !settings.greenhouseIsPro })} />
                  </div>
                  {/* Workable */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Workable</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Workable ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.workableIsPro} onChange={() => setSettings({ ...settings, workableIsPro: !settings.workableIsPro })} />
                  </div>
                  {/* SmartRecruiters */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>SmartRecruiters</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>SmartRecruiters ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.smartrecruitersIsPro} onChange={() => setSettings({ ...settings, smartrecruitersIsPro: !settings.smartrecruitersIsPro })} />
                  </div>
                  {/* Breezy */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Breezy.hr</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Breezy ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.breezyIsPro} onChange={() => setSettings({ ...settings, breezyIsPro: !settings.breezyIsPro })} />
                  </div>
                  {/* Remotive */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Remotive</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Remotive Remote Aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.remotiveIsPro} onChange={() => setSettings({ ...settings, remotiveIsPro: !settings.remotiveIsPro })} />
                  </div>
                  {/* Lever */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Lever.co</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Lever ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.leverIsPro} onChange={() => setSettings({ ...settings, leverIsPro: !settings.leverIsPro })} />
                  </div>
                  {/* Ashby */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>AshbyHQ</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Ashby ATS scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.ashbyIsPro} onChange={() => setSettings({ ...settings, ashbyIsPro: !settings.ashbyIsPro })} />
                  </div>

                  {/* Remote.co */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Remote.co</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Remote.co aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.remotecoIsPro} onChange={() => setSettings({ ...settings, remotecoIsPro: !settings.remotecoIsPro })} />
                  </div>
                  {/* RemoteOK */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>RemoteOK</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>RemoteOK aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.remoteokIsPro} onChange={() => setSettings({ ...settings, remoteokIsPro: !settings.remoteokIsPro })} />
                  </div>
                  {/* WorkingNomads */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>WorkingNomads</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>WorkingNomads aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.workingnomadsIsPro} onChange={() => setSettings({ ...settings, workingnomadsIsPro: !settings.workingnomadsIsPro })} />
                  </div>
                  {/* Arbeitnow */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Arbeitnow</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Arbeitnow aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.arbeitnowIsPro} onChange={() => setSettings({ ...settings, arbeitnowIsPro: !settings.arbeitnowIsPro })} />
                  </div>
                  {/* Y Combinator */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Y Combinator</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Work at a Startup scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.ycombinatorIsPro} onChange={() => setSettings({ ...settings, ycombinatorIsPro: !settings.ycombinatorIsPro })} />
                  </div>
                  {/* Himalayas */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Himalayas</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Himalayas aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.himalayasIsPro} onChange={() => setSettings({ ...settings, himalayasIsPro: !settings.himalayasIsPro })} />
                  </div>
                  {/* Otta */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Otta</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Otta tech jobs scraping</div>
                    </div>
                    <ToggleSwitch checked={settings.ottaIsPro} onChange={() => setSettings({ ...settings, ottaIsPro: !settings.ottaIsPro })} />
                  </div>
                  {/* Jobspresso */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Jobspresso</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Jobspresso aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.jobspressoIsPro} onChange={() => setSettings({ ...settings, jobspressoIsPro: !settings.jobspressoIsPro })} />
                  </div>
                  {/* JustRemote */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>JustRemote</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>JustRemote aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.justremoteIsPro} onChange={() => setSettings({ ...settings, justremoteIsPro: !settings.justremoteIsPro })} />
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
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
              backgroundColor: 'var(--card-bg, #18181b)',
              border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              padding: '1.5rem',
              color: 'var(--text-primary, #ffffff)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Confirm User Deletion</h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #a1a1aa)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete <strong style={{ color: 'var(--text-primary)' }}>{userToDelete.name || userToDelete.email}</strong> ({userToDelete.email})?
              All associated data (saved jobs, assets, and preferences) will be permanently purged.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={deletingUserId === userToDelete.id}
                className="btn-outline"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteUser(userToDelete.id)}
                disabled={deletingUserId === userToDelete.id}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: '#ef4444',
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

      {/* Bulk Free Users Purge Modal */}
      {mounted && showPurgeModal && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPurging) setShowPurgeModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: '100%',
              maxWidth: '460px',
              backgroundColor: 'var(--card-bg, #18181b)',
              border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              padding: '1.5rem',
              color: 'var(--text-primary, #ffffff)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                <UserX size={24} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Remove All Free Tier Users</h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #a1a1aa)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently remove all <strong style={{ color: '#ef4444' }}>{users.filter(u => u.planTier === 'FREE' && u.role !== 'ADMIN').length}</strong> free tier users?
              Admin accounts will not be affected. This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                disabled={isPurging}
                className="btn-outline"
                style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeFreeUsers}
                disabled={isPurging}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {isPurging ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
                Confirm Purge
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
