"use client";

import { useState, useEffect } from "react";
import { Users, Shield, Sliders, ToggleLeft, ToggleRight, Check, Search, UserCheck, ShieldAlert } from "lucide-react";
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
  jsearchIsPro: boolean;
  emailsSyncIsPro: boolean;
  aiFeaturesIsPro: boolean;
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'users' | 'gates'>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // Gates State
  const [settings, setSettings] = useState<GlobalSettings>({
    jsearchIsPro: true,
    emailsSyncIsPro: true,
    aiFeaturesIsPro: true,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (session && (session.user as any)?.role !== 'ADMIN') {
      router.push('/');
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

  // Fetch Settings
  useEffect(() => {
    if (activeTab === 'gates' && session && (session.user as any)?.role === 'ADMIN') {
      setLoadingSettings(true);
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(data => {
          if (data && !data.error) {
            setSettings({
              jsearchIsPro: data.jsearchIsPro,
              emailsSyncIsPro: data.emailsSyncIsPro,
              aiFeaturesIsPro: data.aiFeaturesIsPro,
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
        <h3 style={{ color: '#fff' }}>Access Denied</h3>
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
          onClick={() => setActiveTab('gates')}
          className={activeTab === 'gates' ? 'btn-primary' : 'btn-outline'}
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <Sliders size={16} /> Feature Gates
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'users' ? (
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Registered Users ({filteredUsers.length})
            </h3>
            
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
                  width: "250px"
                }}
              />
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
                    <tr key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: "0.95rem" }}>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 500, color: "#fff" }}>{user.name || "No name"}</span>
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
                            disabled={savingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { role: e.target.value as 'USER' | 'ADMIN' })}
                            style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
                          >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                          </select>

                          {/* Plan selector */}
                          <select
                            value={user.planTier}
                            disabled={savingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { planTier: e.target.value })}
                            style={{ background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
                          >
                            <option value="FREE">Free</option>
                            <option value="PRO">Pro</option>
                          </select>

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
      ) : (
        <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            Global Feature Access Controls
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Toggle whether specific categories of features require an active **PRO** plan subscription.
          </p>

          {loadingSettings ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>Loading system settings...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginTop: "1rem" }}>
              {/* JSearch */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontWeight: 600, color: "#fff" }}>Premium Scrapers require Pro Plan</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Locks JSearch (LinkedIn, Indeed, Glassdoor) and premium ATS crawlers (Greenhouse, Workable, SmartRecruiters, Breezy, Remotive) behind Pro.
                  </span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, jsearchIsPro: !settings.jsearchIsPro })}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {settings.jsearchIsPro ? <ToggleRight size={40} className="text-accent" /> : <ToggleLeft size={40} color="var(--text-secondary)" />}
                </button>
              </div>

              {/* Email sync */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontWeight: 600, color: "#fff" }}>Email Synchronization requires Pro Plan</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Restricts IMAP background mailbox synchronization to subscribed users only.
                  </span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, emailsSyncIsPro: !settings.emailsSyncIsPro })}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {settings.emailsSyncIsPro ? <ToggleRight size={40} className="text-accent" /> : <ToggleLeft size={40} color="var(--text-secondary)" />}
                </button>
              </div>

              {/* AI Features */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <span style={{ fontWeight: 600, color: "#fff" }}>AI Features require Pro Plan</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Requires a Pro plan to run AI Scoring, tailored Resume/Cover Letter generation, and Q&A helpers.
                  </span>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, aiFeaturesIsPro: !settings.aiFeaturesIsPro })}
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {settings.aiFeaturesIsPro ? <ToggleRight size={40} className="text-accent" /> : <ToggleLeft size={40} color="var(--text-secondary)" />}
                </button>
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="btn-primary"
                style={{ width: "fit-content", display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}
              >
                <Check size={18} /> {savingSettings ? "Saving Settings..." : "Save Feature Gates"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
