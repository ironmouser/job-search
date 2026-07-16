"use client";

import { useState, useEffect } from "react";
import { Users, Shield, Sliders, Check, Search, ShieldAlert, Cpu, Sparkles, Mail } from "lucide-react";
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
  greenhouseIsPro: boolean;
  leverIsPro: boolean;
  ashbyIsPro: boolean;
  workableIsPro: boolean;
  smartrecruitersIsPro: boolean;
  breezyIsPro: boolean;
  remotiveIsPro: boolean;
  weworkremotelyIsPro: boolean;
  remotecoIsPro: boolean;
  remoteokIsPro: boolean;
  workingnomadsIsPro: boolean;
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

  const [activeTab, setActiveTab] = useState<'users' | 'gates' | 'scrapers'>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  // Gates State
  const [settings, setSettings] = useState<GlobalSettings>({
    jsearchIsPro: true,
    greenhouseIsPro: true,
    leverIsPro: false,
    ashbyIsPro: false,
    workableIsPro: true,
    smartrecruitersIsPro: true,
    breezyIsPro: true,
    remotiveIsPro: true,
    weworkremotelyIsPro: false,
    remotecoIsPro: false,
    remoteokIsPro: false,
    workingnomadsIsPro: false,
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
              jsearchIsPro: data.jsearchIsPro ?? true,
              greenhouseIsPro: data.greenhouseIsPro ?? true,
              leverIsPro: data.leverIsPro ?? false,
              ashbyIsPro: data.ashbyIsPro ?? false,
              workableIsPro: data.workableIsPro ?? true,
              smartrecruitersIsPro: data.smartrecruitersIsPro ?? true,
              breezyIsPro: data.breezyIsPro ?? true,
              remotiveIsPro: data.remotiveIsPro ?? true,
              weworkremotelyIsPro: data.weworkremotelyIsPro ?? false,
              remotecoIsPro: data.remotecoIsPro ?? false,
              remoteokIsPro: data.remoteokIsPro ?? false,
              workingnomadsIsPro: data.workingnomadsIsPro ?? false,
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
                            disabled={savingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { role: e.target.value as 'USER' | 'ADMIN' })}
                            style={{ background: "var(--bg-color)", color: "var(--text-primary)", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
                          >
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                          </select>

                          {/* Plan selector */}
                          <select
                            value={user.planTier}
                            disabled={savingUserId === user.id}
                            onChange={(e) => handleUpdateUser(user.id, { planTier: e.target.value })}
                            style={{ background: "var(--bg-color)", color: "var(--text-primary)", border: "1px solid var(--border-glass)", padding: "0.25rem", borderRadius: "6px" }}
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
                  {/* JSearch */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>JSearch API</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>LinkedIn, Indeed, Glassdoor, ZipRecruiter</div>
                    </div>
                    <ToggleSwitch checked={settings.jsearchIsPro} onChange={() => setSettings({ ...settings, jsearchIsPro: !settings.jsearchIsPro })} />
                  </div>
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
                  {/* WeWorkRemotely */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>WeWorkRemotely</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>WWR Remote Aggregator</div>
                    </div>
                    <ToggleSwitch checked={settings.weworkremotelyIsPro} onChange={() => setSettings({ ...settings, weworkremotelyIsPro: !settings.weworkremotelyIsPro })} />
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
                    <div style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--warning)" }}>{scraperStats.firecrawlFallbacks24h}</div>
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
    </div>
  );
}
