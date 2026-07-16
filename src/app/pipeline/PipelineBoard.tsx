"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MoreVertical } from 'lucide-react';

type Job = {
    id: string;
    title: string;
    company: string;
    status: string;
    location: string;
    salary_range: string;
};

const COLUMNS = [
    { id: 'applied', label: 'Applied', color: '#3b82f6' },
    { id: 'interviewing', label: 'Interviewing', color: '#fbbf24' },
    { id: 'offer', label: 'Offer', color: '#10b981' },
    { id: 'rejected', label: 'Rejected', color: '#ef4444' },
];

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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: '8px' }}>
                    <button 
                        onClick={() => setViewMode('kanban')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: viewMode === 'kanban' ? '#3695e3' : 'transparent', color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: viewMode === 'kanban' ? 600 : 400 }}
                    >
                        Kanban
                    </button>
                    <button 
                        onClick={() => setViewMode('table')}
                        style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: viewMode === 'table' ? '#3695e3' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: viewMode === 'table' ? 600 : 400 }}
                    >
                        Table
                    </button>
                </div>
            </div>

            {viewMode === 'kanban' ? (
                <div style={{ display: 'flex', gap: '1.5rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1 }} data-tour="pipeline-kanban">
                    {COLUMNS.map(col => (
                        <div key={col.id} style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                                    {jobs.filter(j => j.status === col.id).length}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '100px' }}>
                                {jobs.filter(j => j.status === col.id).map(job => (
                                    <div key={job.id} className="glass-card" style={{ padding: '1rem', position: 'relative' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{job.company}</h4>
                                            
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
                                                    fontSize: '0.8rem',
                                                    padding: '0.1rem 0.3rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {COLUMNS.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.label}</option>)}
                                            </select>
                                        </div>
                                        <h3 style={{ margin: '0.5rem 0' }}>
                                            <Link href={`/job/${job.id}`} className="job-title" style={{ textDecoration: 'none' }}>
                                                {job.title}
                                            </Link>
                                        </h3>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem' }}>
                                            {job.location && <span>📍 {job.location}</span>}
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
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Location</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Salary</th>
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
                                    <td style={{ padding: '1rem' }}>
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
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.location || 'Remote'}</td>
                                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{job.salary_range || 'Unlisted'}</td>
                                </tr>
                            ))}
                            {jobs.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No jobs in pipeline.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
