"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Compass, 
  Sparkles, 
  ArrowRight, 
  Check
} from 'lucide-react';
import { trackWelcomePathChoice } from '@/lib/analytics';

interface WelcomeChoiceFlowProps {
  userName?: string | null;
}

export default function WelcomeChoiceFlow({ userName }: WelcomeChoiceFlowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNewUser = searchParams?.get('new_user') === 'true';

  const firstName = userName ? userName.split(' ')[0] : null;

  const handleSelectPath = (choice: 'find_jobs' | 'prepare_application') => {
    trackWelcomePathChoice(choice, isNewUser);
    if (choice === 'find_jobs') {
      if (isNewUser) {
        router.push('/dashboard?autoSync=true');
      } else {
        router.push('/dashboard');
      }
    } else {
      try {
        localStorage.removeItem('job_agent_auto_sync_on_mount');
      } catch (e) {}
      router.push('/prepare');
    }
  };

  const choiceCards = [
    {
      id: 'find_jobs' as const,
      title: 'Find a Job',
      badge: 'Discovery & Scoring',
      description: 'Explore personalized job feeds tailored to your target title and preferences. Calculate AI match scores and scan email alerts.',
      actionLabel: 'Explore Matched Jobs',
      Icon: Compass,
      color: '#3695e3',
      features: [
        'AI Opportunity Match Scoring (>80 filter)',
        'Scan inbox for job alert notifications',
        'One-click auto apply and pipeline tracking'
      ]
    },
    {
      id: 'prepare_application' as const,
      title: 'Prepare an Application',
      badge: 'Bring Any Job',
      description: 'Already found a role somewhere else? Import the job URL or paste the description to analyze requirements and tailor your application.',
      actionLabel: 'Prepare Application',
      Icon: Sparkles,
      color: '#8b5cf6',
      features: [
        'Import from Greenhouse, Lever, Workday, LinkedIn, or text',
        'Targeted resume extracts and PDF export',
        'Authentic, 3-paragraph tailored cover letters'
      ]
    }
  ];

  return (
    <div className="animate-fade-in" style={{ minHeight: '100vh', padding: '1.5rem 0', maxWidth: '960px', margin: '0 auto' }}>
      
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {isNewUser ? (
              <>Welcome to Job Agent HQ{firstName ? `, ${firstName}` : ''}</>
            ) : (
              <>Welcome back{firstName ? `, ${firstName}` : ''}</>
            )}
          </h1>
          <span
            style={{
              background: 'rgba(54, 149, 227, 0.15)',
              color: '#3695e3',
              border: '1px solid rgba(54, 149, 227, 0.3)',
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            {isNewUser ? 'New Workspace' : 'Opportunity Control Center'}
          </span>
        </div>
        <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem', lineHeight: 1.45 }}>
          {isNewUser 
            ? 'Your profile is ready. Select how you want to start your job search.'
            : 'Choose whether you want to discover new matched opportunities or prepare an application for an existing job opening.'}
        </p>
      </div>

      {/* Quick Navigation Cards (Org Admin Glass Container Spec) */}
      <div className="glass-card" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>
          Select Your Path
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {choiceCards.map(({ id, title, badge, description, actionLabel, Icon, color, features }) => (
            <div
              key={id}
              onClick={() => handleSelectPath(id)}
              style={{
                background: 'rgba(0, 0, 0, 0.07)',
                border: '1px solid var(--border-glass)',
                borderRadius: 12,
                padding: '1.5rem',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                height: '100%',
              }}
            >
              <div>
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        background: `${color}20`,
                        color: color,
                        padding: 8,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {title}
                    </h4>
                  </div>
                  <span
                    style={{
                      background: `${color}15`,
                      color: color,
                      border: `1px solid ${color}30`,
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {badge}
                  </span>
                </div>

                {/* Description */}
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {description}
                </p>

                {/* Feature Checkpoints */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '1.25rem' }}>
                  {features.map((feature, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                      <Check size={14} style={{ color: color, flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ lineHeight: 1.35 }}>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action CTA Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPath(id);
                }}
                className="btn-primary"
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  backgroundColor: id === 'find_jobs' ? '#0070f3' : '#7c3aed',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: id === 'find_jobs' ? '0 2px 10px rgba(0, 112, 243, 0.25)' : '0 2px 10px rgba(124, 58, 237, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{actionLabel}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Skip & Quick Navigation Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)'
      }}>
        <span>Quick Links:</span>
        <Link 
          href="/dashboard" 
          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          Go straight to Dashboard
        </Link>
        <span>•</span>
        <Link 
          href="/pipeline" 
          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          Application Tracker
        </Link>
        <span>•</span>
        <Link 
          href="/profile" 
          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          Candidate Profile
        </Link>
      </div>

    </div>
  );
}
