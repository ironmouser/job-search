'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  Building2,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Loader2,
  Mail,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface LinkedUser {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface RecruiterProfileRecord {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  title: string;
  businessEmail: string;
  linkedinUrl: string | null;
  role: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  verifiedAt: string | null;
  createdAt: string;
  user: LinkedUser | null;
}

interface RecruiterOrgRecord {
  id: string;
  name: string;
  type: string;
  website: string | null;
  logoUrl: string | null;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  planTier?: string | null;
  subscriptionStatus?: string | null;
  monthlyIntroQuota?: number;
  consumedIntros?: number;
  teamSeats?: number;
  recruiters: RecruiterProfileRecord[];
  _count: {
    jobs: number;
    introductions: number;
    recruiters: number;
  };
}

const emptySubscribe = () => () => {};

export function RecruitersTab() {
  const [organizations, setOrganizations] = useState<RecruiterOrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'>('ALL');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Rejection modal state
  const [rejectingOrg, setRejectingOrg] = useState<RecruiterOrgRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Company information or business domain could not be verified.');
  
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    let active = true;
    fetch('/api/admin/recruiters')
      .then((res) => res.json())
      .then((json) => {
        if (active && json.organizations) {
          setOrganizations(json.organizations);
        }
      })
      .catch((err) => {
        console.error('Failed to load recruiters:', err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleUpdateStatus = async (
    orgId: string,
    action: 'VERIFY' | 'REJECT' | 'PENDING' | 'SUSPEND',
    reason?: string
  ) => {
    setProcessingId(orgId);
    try {
      const res = await fetch('/api/admin/recruiters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          action,
          rejectionReason: reason,
        }),
      });

      const json = await res.json();
      if (res.ok && json.organization) {
        setOrganizations((prev) =>
          prev.map((org) => (org.id === orgId ? { ...org, ...json.organization } : org))
        );
        if (action === 'REJECT') {
          setRejectingOrg(null);
        }
      } else {
        alert(json.error || 'Failed to update recruiter status.');
      }
    } catch (err) {
      console.error('Status update failed:', err);
      alert('Network error while updating recruiter status.');
    } finally {
      setProcessingId(null);
    }
  };

  const formatOrgType = (type: string) => {
    switch (type) {
      case 'RECRUITING_AGENCY':
        return 'Agency';
      case 'EMPLOYER_DIRECT':
        return 'In-House Employer';
      case 'STAFFING_FIRM':
        return 'Staffing Firm';
      case 'INDEPENDENT_RECRUITER':
        return 'Independent';
      default:
        return type;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  const pendingCount = organizations.filter((o) => o.verificationStatus === 'PENDING').length;
  const verifiedCount = organizations.filter((o) => o.verificationStatus === 'VERIFIED').length;
  const rejectedCount = organizations.filter((o) => o.verificationStatus === 'REJECTED').length;

  const filteredOrgs = organizations.filter((org) => {
    if (statusFilter !== 'ALL' && org.verificationStatus !== statusFilter) {
      return false;
    }
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    const orgNameMatch = org.name.toLowerCase().includes(query);
    const websiteMatch = org.website?.toLowerCase().includes(query) || false;
    const recruiterMatch = org.recruiters.some((r) => {
      const fullName = `${r.firstName} ${r.lastName}`.toLowerCase();
      const emailMatch = r.businessEmail.toLowerCase().includes(query);
      const userEmailMatch = r.user?.email?.toLowerCase().includes(query) || false;
      return fullName.includes(query) || emailMatch || userEmailMatch;
    });

    return orgNameMatch || websiteMatch || recruiterMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Recruiter Organizations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" /> Total Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{organizations.length}</div>
            <p className="text-xs text-slate-400 mt-1">Registered recruiting entities</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
            <p className="text-xs text-slate-400 mt-1">Awaiting verification</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Verified Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{verifiedCount}</div>
            <p className="text-xs text-slate-400 mt-1">Full candidate discovery unlocked</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Rejected / Suspended
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">{rejectedCount}</div>
            <p className="text-xs text-slate-400 mt-1">Blocked from network access</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Recruiter Management Table */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Filter and Search Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Recruiter Accounts ({filteredOrgs.length} of {organizations.length})
            </h3>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
              Review recruiter credentials, business domains, and verify access.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '260px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                type="text"
                placeholder="Search organization or recruiter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem 0.45rem 2rem',
                  fontSize: '0.85rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--input)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            {/* Status Filter Pills */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--card-header-bg)', padding: '3px', borderRadius: '8px' }}>
              {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: statusFilter === status ? 'var(--primary)' : 'transparent',
                    color: statusFilter === status ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Organization</th>
                <th style={{ padding: '0.75rem 1rem' }}>Primary Recruiter</th>
                <th style={{ padding: '0.75rem 1rem' }}>Billing Plan</th>
                <th style={{ padding: '0.75rem 1rem' }}>Registered Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Audit Details</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                    No recruiter organizations match your criteria.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => {
                  const primaryRecruiter = org.recruiters[0] || null;
                  const isBusy = processingId === org.id;

                  return (
                    <tr
                      key={org.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Organization Details */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {org.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#3b82f6',
                              fontWeight: 500,
                            }}
                          >
                            {formatOrgType(org.type)}
                          </span>
                          {org.website && (
                            <a
                              href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                textDecoration: 'none',
                              }}
                            >
                              Website <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Primary Recruiter Details */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {primaryRecruiter ? (
                          <div>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                              {primaryRecruiter.firstName} {primaryRecruiter.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              {primaryRecruiter.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                              <a
                                href={`mailto:${primaryRecruiter.businessEmail}`}
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--primary)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                  textDecoration: 'none',
                                }}
                              >
                                <Mail size={12} /> {primaryRecruiter.businessEmail}
                              </a>
                              {primaryRecruiter.linkedinUrl && (
                                <a
                                  href={primaryRecruiter.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#0077b5',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.2rem',
                                    textDecoration: 'none',
                                  }}
                                >
                                  LinkedIn <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No recruiter linked</span>
                        )}
                      </td>

                      {/* Billing Plan */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {org.subscriptionStatus === 'ACTIVE' || org.subscriptionStatus === 'TRIALING' ? (
                          <div>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#10b981',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              {org.planTier || 'PRO'}
                            </span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              {org.consumedIntros || 0}/{org.monthlyIntroQuota || 0} Intros &bull; {org.teamSeats || 1} Seats
                            </div>
                          </div>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-secondary)',
                              fontSize: '0.75rem',
                            }}
                          >
                            Unsubscribed
                          </span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {formatDate(org.createdAt)}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {org.verificationStatus === 'PENDING' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#d97706',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            <Clock size={12} /> Pending Review
                          </span>
                        )}
                        {org.verificationStatus === 'VERIFIED' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={12} /> Verified
                          </span>
                        )}
                        {org.verificationStatus === 'REJECTED' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            <XCircle size={12} /> Rejected
                          </span>
                        )}
                        {org.verificationStatus === 'SUSPENDED' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              background: 'rgba(148, 163, 184, 0.15)',
                              color: '#94a3b8',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            <ShieldAlert size={12} /> Suspended
                          </span>
                        )}
                      </td>

                      {/* Audit Details */}
                      <td style={{ padding: '0.85rem 1rem', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                        {org.verificationStatus === 'VERIFIED' && (
                          <div>
                            <div>Verified: {formatDate(org.verifiedAt)}</div>
                            {org.verifiedBy && <div style={{ fontSize: '0.7rem' }}>By: {org.verifiedBy}</div>}
                          </div>
                        )}
                        {org.verificationStatus === 'REJECTED' && (
                          <div style={{ color: '#ef4444' }}>
                            {org.rejectionReason || 'Declined by admin'}
                          </div>
                        )}
                        {org.verificationStatus === 'PENDING' && (
                          <span style={{ color: '#d97706' }}>Awaiting initial review</span>
                        )}
                        {org.verificationStatus === 'SUSPENDED' && (
                          <span>Access revoked</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          {org.verificationStatus !== 'VERIFIED' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleUpdateStatus(org.id, 'VERIFY')}
                              style={{
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                borderRadius: 'var(--radius)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#10b981',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              {isBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                              Verify
                            </button>
                          )}

                          {org.verificationStatus === 'PENDING' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setRejectingOrg(org)}
                              style={{
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                borderRadius: 'var(--radius)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: '#ef4444',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <XCircle size={13} />
                              Reject
                            </button>
                          )}

                          {(org.verificationStatus === 'VERIFIED' || org.verificationStatus === 'REJECTED') && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleUpdateStatus(org.id, 'PENDING')}
                              title="Reset status back to Pending"
                              style={{
                                padding: '0.35rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border)',
                                background: 'var(--card-header-bg)',
                                color: 'var(--text-secondary)',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <RotateCcw size={12} />
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection Modal with createPortal */}
      {isMounted &&
        rejectingOrg &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-modal-title"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
            }}
            onClick={() => setRejectingOrg(null)}
          >
            <div
              className="glass-card"
              style={{
                maxWidth: '480px',
                width: '90%',
                padding: '1.75rem',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="reject-modal-title" style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 600 }}>
                Reject Recruiter Application
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem' }}>
                Specify the reason for declining verification for{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{rejectingOrg.name}</strong>.
              </p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  htmlFor="rejection-reason"
                  style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}
                >
                  Rejection Reason
                </label>
                <textarea
                  id="rejection-reason"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    fontSize: '0.85rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setRejectingOrg(null)}
                  style={{
                    padding: '0.45rem 0.9rem',
                    fontSize: '0.85rem',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingId === rejectingOrg.id}
                  onClick={() => handleUpdateStatus(rejectingOrg.id, 'REJECT', rejectionReason)}
                  style={{
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius)',
                    border: 'none',
                    background: '#ef4444',
                    color: '#ffffff',
                    cursor: processingId === rejectingOrg.id ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {processingId === rejectingOrg.id && <Loader2 size={14} className="animate-spin" />}
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
