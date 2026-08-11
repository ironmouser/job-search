"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MoreVertical, MapPin, Trash2, Calendar } from 'lucide-react';

type Job = {
    id: string;
    title: string;
    company: string;
    status: string;
    location: string;
    salary_range: string;
    applied_at?: string | null;
    created_at?: string | null;
};

const COLUMNS = [
    { id: 'applied', label: 'Applied', color: '#3b82f6' },
    { id: 'interviewing', label: 'Interviewing', color: '#fbbf24' },
    { id: 'offer', label: 'Offer', color: '#10b981' },
    { id: 'rejected', label: 'Rejected', color: '#ef4444' },
];

const STATUS_COLORS: Record<string, string> = {
    applied: '#0045ff1c',
    interviewing: '#fcf49b78',
    offer: '#01e96e47',
    rejected: '#ff000029',
};

const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return null;
    }
};

export default function PipelineBoard({ initialJobs }: { initialJobs: Job[] }) {
    const [jobs, setJobs] = useState<Job[]>(initialJobs);
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

    const updateJobStatus = async (jobId: string, newStatus: string) => {
        // Optimistic UI update
        const previousJobs = [...jobs];
        setJobs(jobs.map(j => j.id === jobId ? { ...j, status: newStatus } : j));

        try {
            const res = await fetch(`/api/jobs/${jobId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) throw new Error('Failed to update status');
        } catch (e) {
            console.error(e);
            alert('Failed to update job status.');
            setJobs(previousJobs); // Revert on failure
        }
    };

    const deleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job from your pipeline?')) return;
        const previousJobs = [...jobs];
        setJobs(jobs.filter(j => j.id !== jobId));

        try {
            const res = await fetch(`/api/jobs/${jobId}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete job');
        } catch (e) {
            console.error(e);
            alert('Failed to delete job.');
            setJobs(previousJobs);
        }
    };

    const [mobileActiveCol, setMobileActiveCol] = useState<string>('all');

    const visibleColumns = mobileActiveCol === 'all' 
        ? COLUMNS 
        : COLUMNS.filter(c => c.id === mobileActiveCol);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                {/* Mobile Column Selector Pills */}
                <div className="mobile-col-pills" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem', maxWidth: '100%' }}>
                    <button
                        onClick={() => setMobileActiveCol('all')}
                        style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '9999px',
                            border: '1px solid var(--border)',
                            background: mobileActiveCol === 'all' ? 'var(--accent-primary)' : 'var(--muted)',
                            color: mobileActiveCol === 'all' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            minHeight: '36px'
                        }}
                    >
                        All ({jobs.length})
                    </button>
                    {COLUMNS.map(col => {
                        const count = jobs.filter(j => j.status?.toLowerCase() === col.id).length;
                        const isActive = mobileActiveCol === col.id;
                        return (
                            <button
                                key={col.id}
                                onClick={() => setMobileActiveCol(col.id)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '9999px',
                                    border: `1px solid ${isActive ? col.color : 'var(--border)'}`,
                                    background: isActive ? col.color : 'var(--muted)',
                                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    minHeight: '36px'
                                }}
                            >
                                {col.label} ({count})
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '8px', marginLeft: 'auto' }}>
                    <button 
                        onClick={() => setViewMode('kanban')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: viewMode === 'kanban' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: viewMode === 'kanban' ? 600 : 400, minHeight: '36px' }}
                    >
                        Kanban
                    </button>
                    <button 
                        onClick={() => setViewMode('table')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: viewMode === 'table' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: viewMode === 'table' ? 600 : 400, minHeight: '36px' }}
                    >
                        Table
                    </button>
                </div>
            </div>

            {viewMode === 'kanban' ? (
                <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, scrollSnapType: 'x mandatory' }} data-tour="pipeline-kanban">
                    {visibleColumns.map(col => (
                        <div key={col.id} style={{ flex: mobileActiveCol === 'all' ? '0 0 min(300px, 85vw)' : '1 1 100%', display: 'flex', flexDirection: 'column', gap: '1rem', scrollSnapAlign: 'start' }}>
                            <div style={{ 
                                padding: '0.75rem', 
                                background: 'rgba(255,255,255,0.03)', 
                                borderTop: `3px solid ${col.color}`,
                                borderRadius: '8px 8px 0 0',
                                fontWeight: 600,
                                display: 'flex',
                                justifyContent: 'space-between'
                            }}>
                                <span>{col.label}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {jobs.filter(j => j.status?.toLowerCase() === col.id).length}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '100px' }}>
                                {jobs.filter(j => j.status?.toLowerCase() === col.id).map(job => (
                                    <div key={job.id} className="glass-card pipeline-card" style={{ padding: '1rem', position: 'relative', background: STATUS_COLORS[job.status?.toLowerCase()] || STATUS_COLORS[col.id] }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{job.company}</h4>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                {/* Status Dropdown */}
                                                <select 
                                                    data-tour="pipeline-status-dropdown"
                                                    value={job.status} 
                                                    onChange={(e) => updateJobStatus(job.id, e.target.value)}
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: '1px solid var(--border-glass)', 
                                                        color: 'var(--text-primary)', 
                                                        borderRadius: '4px',
                                                        fontSize: '16px',
                                                        padding: '0.2rem 0.4rem',
                                                        minHeight: '36px',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {COLUMNS.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.label}</option>)}
                                                </select>

                                                <button 
                                                    onClick={() => deleteJob(job.id)}
                                                    title="Delete job"
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        color: 'var(--danger)', 
                                                        cursor: 'pointer',
                                                        padding: '0.4rem',
                                                        minWidth: '36px',
                                                        minHeight: '36px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <h3 style={{ margin: '0.5rem 0' }}>
                                            <Link href={`/job/${job.id}`} className="job-title" style={{ textDecoration: 'none' }}>
                                                {job.title}
                                            </Link>
                                        </h3>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            {job.location && <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={14} /> {job.location}</span>}
                                            {job.applied_at && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Date Applied">
                                                    <Calendar size={14} /> Applied {formatDate(job.applied_at)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass-card" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Company</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Role</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Date Applied</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Location</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Salary</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(job => (
                                <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '1rem', fontWeight: 600 }}>{job.company}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <Link href={`/job/${job.id}`} className="job-title" style={{ textDecoration: 'none' }}>
                                            {job.title}
                                        </Link>
                                    </td>
                                    <td style={{ padding: '1rem', background: STATUS_COLORS[job.status?.toLowerCase()] }}>
                                        <select 
                                            value={job.status} 
                                            onChange={(e) => updateJobStatus(job.id, e.target.value)}
                                            style={{ 
                                                background: 'transparent', 
                                                border: '1px solid var(--border-glass)', 
                                                color: 'var(--text-primary)', 
                                                borderRadius: '4px',
                                                padding: '0.3rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {COLUMNS.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.label}</option>)}
                                        </select>
                                    </td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{formatDate(job.applied_at) || 'N/A'}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.location || 'Remote'}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.salary_range || 'Not Listed'}</td>
                                    <td style={{ padding: '1rem' }}>
                                        <button 
                                            onClick={() => deleteJob(job.id)}
                                            className="btn-outline"
                                            style={{ padding: '0.3rem 0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                            title="Delete job"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No jobs in pipeline.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
