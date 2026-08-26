'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, User, Mail, Globe, CheckCircle2, ArrowRight, Loader2, UserPlus } from 'lucide-react';
import RecruiterHeader from '@/components/recruiter/RecruiterHeader';

export default function RecruiterRegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    title: '',
    businessEmail: '',
    linkedinUrl: '',
    organizationName: '',
    organizationType: 'RECRUITING_AGENCY',
    organizationWebsite: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/recruiter/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit recruiter profile');
      }

      router.push('/recruiter');
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <RecruiterHeader
        title="Recruiter Registration"
        subtitle="Create your recruiter profile to start sourcing opted-in candidates and managing position introductions."
        hideNav
      />

      <div className="glass-card" style={{ maxWidth: '680px', margin: '0 auto', padding: '2rem' }}>
        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            margin: '0 0 1.5rem 0',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          <UserPlus size={22} color="#3695e3" /> Recruiter & Organization Profile
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {/* Section 1: Personal Profile */}
          <div>
            <h4
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 1rem 0',
                borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                paddingBottom: '0.5rem',
              }}
            >
              Recruiter Details
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="Jane"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Smith"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Job Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Senior Talent Partner"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Business Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.businessEmail}
                  onChange={(e) => setFormData({ ...formData, businessEmail: e.target.value })}
                  placeholder="jane@agency.com"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                LinkedIn Profile URL
              </label>
              <input
                type="url"
                value={formData.linkedinUrl}
                onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                placeholder="https://linkedin.com/in/janesmith"
                className="input-base"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
              />
            </div>
          </div>

          {/* Section 2: Organization Details */}
          <div>
            <h4
              style={{
                fontSize: '0.95rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: '0 0 1rem 0',
                borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                paddingBottom: '0.5rem',
              }}
            >
              Organization Information
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  placeholder="Apex Talent Advisors"
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Organization Type *
                </label>
                <select
                  value={formData.organizationType}
                  onChange={(e) => setFormData({ ...formData, organizationType: e.target.value })}
                  className="input-base"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
                >
                  <option value="RECRUITING_AGENCY">Recruiting Agency</option>
                  <option value="INTERNAL_RECRUITING">Internal Recruiting Team</option>
                  <option value="STAFFING_FIRM">Staffing Firm</option>
                  <option value="EXECUTIVE_SEARCH">Executive Search Firm</option>
                  <option value="EMPLOYER">Direct Employer</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Website URL
              </label>
              <input
                type="url"
                value={formData.organizationWebsite}
                onChange={(e) => setFormData({ ...formData, organizationWebsite: e.target.value })}
                placeholder="https://www.apextalent.com"
                className="input-base"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              padding: '0.85rem 1.5rem',
              backgroundColor: '#3695e3',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 6px -1px rgba(54, 149, 227, 0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Submitting Registration...</span>
              </>
            ) : (
              <>
                <span>Complete Recruiter Setup</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
