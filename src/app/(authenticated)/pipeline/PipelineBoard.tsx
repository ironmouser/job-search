"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MoreVertical, MapPin, Trash2, Calendar, Sparkles, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

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
    { id: 'interviewing', label: 'Interviewing', color: '#f59e0b' },
    { id: 'offer', label: 'Offer', color: '#10b981' },
    { id: 'rejected', label: 'Rejected', color: '#ef4444' },
];

const STAGE_ACCENT_COLORS: Record<string, string> = {
    applied: '#3b82f6',
    interviewing: '#f59e0b',
    offer: '#10b981',
    rejected: '#ef4444',
};

const STAGE_BADGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
    applied: { bg: 'rgba(59, 130, 246, 0.14)', border: 'rgba(59, 130, 246, 0.35)', text: '#3b82f6' },
    interviewing: { bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.35)', text: '#f59e0b' },
    offer: { bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.35)', text: '#10b981' },
    rejected: { bg: 'rgba(239, 68, 68, 0.14)', border: 'rgba(239, 68, 68, 0.35)', text: '#ef4444' },
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

    const handleStageChange = async (jobId: string, newStatus: string) => {
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

    const updateJobStatus = handleStageChange;

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) {
            return;
        }
        if (destination.droppableId !== source.droppableId) {
            handleStageChange(draggableId, destination.droppableId);
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
            <div className="pipeline-controls-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '1.25rem' }}>
                {/* Row 1: Stages count + Prepare Application CTA + View Mode Switcher */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Stages ({jobs.length} total)
                        </h3>
                        <Link
                            href="/prepare"
                            className="btn-primary"
                            style={{
                                padding: '0.4rem 0.85rem',
                                borderRadius: '6px',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                textDecoration: 'none'
                            }}
                        >
                            <Sparkles size={14} />
                            <span>Prepare Application</span>
                        </Link>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--card)', border: '1px solid var(--border)', padding: '0.25rem', borderRadius: 'var(--radius-lg, 8px)' }}>
                        <button 
                            onClick={() => setViewMode('kanban')}
                            className="btn-outline"
                            style={{ 
                                padding: '0.4rem 0.85rem', 
                                borderRadius: 'var(--radius, 6px)', 
                                border: 'none', 
                                background: viewMode === 'kanban' ? 'var(--primary)' : 'transparent', 
                                color: viewMode === 'kanban' ? '#fff' : 'var(--text-secondary)', 
                                cursor: 'pointer', 
                                fontWeight: viewMode === 'kanban' ? 600 : 400, 
                                minHeight: '36px',
                                fontSize: '0.85rem'
                            }}
                        >
                            Kanban
                        </button>
                        <button 
                            onClick={() => setViewMode('table')}
                            className="btn-outline"
                            style={{ 
                                padding: '0.4rem 0.85rem', 
                                borderRadius: 'var(--radius, 6px)', 
                                border: 'none', 
                                background: viewMode === 'table' ? 'var(--primary)' : 'transparent', 
                                color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)', 
                                cursor: 'pointer', 
                                fontWeight: viewMode === 'table' ? 600 : 400, 
                                minHeight: '36px',
                                fontSize: '0.85rem'
                            }}
                        >
                            Table
                        </button>
                    </div>
                </div>

                {/* Row 2: Mobile Column Selector Pills */}
                <div 
                    className="mobile-col-pills md:hidden no-scrollbar" 
                    style={{ 
                        display: 'flex', 
                        gap: '0.4rem', 
                        overflowX: 'auto', 
                        paddingBottom: '0.25rem', 
                        maxWidth: '100%',
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none'
                    }}
                >
                    <button
                        onClick={() => setMobileActiveCol('all')}
                        style={{
                            padding: '0.4rem 0.85rem',
                            borderRadius: '9999px',
                            border: '1px solid var(--border)',
                            background: mobileActiveCol === 'all' ? 'var(--accent-primary)' : 'var(--muted)',
                            color: mobileActiveCol === 'all' ? '#fff' : 'var(--text-secondary)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            minHeight: '36px',
                            flexShrink: 0
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
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '9999px',
                                    border: `1px solid ${isActive ? col.color : 'var(--border)'}`,
                                    background: isActive ? col.color : 'var(--muted)',
                                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    minHeight: '36px',
                                    flexShrink: 0
                                }}
                            >
                                {col.label} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {viewMode === 'kanban' ? (
                <DragDropContext onDragEnd={handleDragEnd}>
                    <div style={{ display: 'flex', gap: '1.25rem', overflowX: 'auto', paddingBottom: '1rem', flex: 1, scrollSnapType: 'x mandatory' }} data-tour="pipeline-kanban">
                        {visibleColumns.map(col => (
                            <div key={col.id} style={{ flex: mobileActiveCol === 'all' ? '0 0 min(300px, 85vw)' : '1 1 100%', display: 'flex', flexDirection: 'column', gap: '1rem', scrollSnapAlign: 'start' }}>
                                <div style={{ 
                                    padding: '0.75rem', 
                                    background: 'var(--card)', 
                                    border: '1px solid var(--border)',
                                    borderTop: `3px solid ${col.color}`,
                                    borderRadius: '8px 8px 0 0',
                                    fontWeight: 600,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>{col.label}</span>
                                    <span style={{
                                        color: col.color,
                                        background: STAGE_BADGE_STYLES[col.id]?.bg,
                                        border: `1px solid ${STAGE_BADGE_STYLES[col.id]?.border}`,
                                        padding: '0.1rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700
                                    }}>
                                        {jobs.filter(j => j.status?.toLowerCase() === col.id).length}
                                    </span>
                                </div>

                                <Droppable droppableId={col.id}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '1rem',
                                                minHeight: '140px',
                                                padding: '0.25rem',
                                                borderRadius: '8px',
                                                background: snapshot.isDraggingOver ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                                                transition: 'background-color 0.15s ease',
                                            }}
                                        >
                                            {jobs.filter(j => j.status?.toLowerCase() === col.id).map((job, index) => {
                                                const accentColor = STAGE_ACCENT_COLORS[job.status?.toLowerCase()] || col.color;
                                                return (
                                                    <Draggable key={job.id} draggableId={job.id} index={index}>
                                                        {(dragProvided, dragSnapshot) => (
                                                            <div
                                                                ref={dragProvided.innerRef}
                                                                {...dragProvided.draggableProps}
                                                                {...dragProvided.dragHandleProps}
                                                                className="glass-card pipeline-card"
                                                                style={{
                                                                    ...dragProvided.draggableProps.style,
                                                                    padding: '1rem',
                                                                    position: 'relative',
                                                                    background: 'var(--card)',
                                                                    border: '1px solid var(--border)',
                                                                    borderLeft: `3px solid ${accentColor}`,
                                                                    boxShadow: dragSnapshot.isDragging ? '0 12px 28px rgba(0, 0, 0, 0.3)' : undefined,
                                                                    cursor: 'grab',
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                                                                        <GripVertical size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0, opacity: 0.6 }} />
                                                                        <h4 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {job.company}
                                                                        </h4>
                                                                    </div>
                                                                    
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                                                        {/* Accessible Status Dropdown for Keyboard Users */}
                                                                        <select 
                                                                            data-tour="pipeline-status-dropdown"
                                                                            aria-label={`Change stage for ${job.title} at ${job.company}`}
                                                                            value={job.status?.toLowerCase()} 
                                                                            onChange={(e) => updateJobStatus(job.id, e.target.value)}
                                                                            style={{ 
                                                                                background: 'var(--background)', 
                                                                                border: '1px solid var(--border)', 
                                                                                color: 'var(--foreground)', 
                                                                                borderRadius: '6px',
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: 600,
                                                                                padding: '0.2rem 0.45rem',
                                                                                minHeight: '32px',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            {COLUMNS.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.label}</option>)}
                                                                        </select>

                                                                        <button 
                                                                            onClick={() => deleteJob(job.id)}
                                                                            title="Delete job"
                                                                            aria-label={`Delete ${job.title} at ${job.company}`}
                                                                            style={{ 
                                                                                background: 'transparent', 
                                                                                border: 'none', 
                                                                                color: 'var(--danger)', 
                                                                                cursor: 'pointer',
                                                                                padding: '0.35rem',
                                                                                minWidth: '32px',
                                                                                minHeight: '32px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center'
                                                                            }}
                                                                        >
                                                                            <Trash2 size={15} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <h3 style={{ margin: '0.5rem 0', fontSize: '0.95rem' }}>
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
                                                        )}
                                                    </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </div>
                                    )}
                                </Droppable>
                            </div>
                        ))}
                    </div>
                </DragDropContext>
            ) : (
                <div className="glass-card" style={{ overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Company</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Role</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Status</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Date Applied</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Location</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Salary</th>
                                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map(job => {
                                const stageKey = job.status?.toLowerCase() || 'applied';
                                const badgeStyle = STAGE_BADGE_STYLES[stageKey] || STAGE_BADGE_STYLES.applied;
                                return (
                                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{job.company}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <Link href={`/job/${job.id}`} className="job-title" style={{ textDecoration: 'none' }}>
                                                {job.title}
                                            </Link>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <select 
                                                aria-label={`Change stage for ${job.title} at ${job.company}`}
                                                value={stageKey} 
                                                onChange={(e) => updateJobStatus(job.id, e.target.value)}
                                                style={{ 
                                                    background: badgeStyle.bg, 
                                                    border: `1px solid ${badgeStyle.border}`, 
                                                    color: badgeStyle.text, 
                                                    borderRadius: '9999px',
                                                    padding: '0.25rem 0.65rem',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
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
                                                aria-label={`Delete ${job.title} at ${job.company}`}
                                                style={{ padding: '0.3rem 0.5rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                                title="Delete job"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
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
