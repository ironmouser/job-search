'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
    DollarSign, Clock, TrendingUp, Star, Cpu, Users, Compass, 
    Sparkles, Flame, X, Code, Sliders 
} from 'lucide-react';

export interface CriteriaItem {
    id: string;
    label: string;
    fullLabel: string;
    desc: string;
    icon: React.ElementType;
}

export const CRITERIA_LIST: CriteriaItem[] = [
    { 
        id: 'compensation', 
        label: 'Compensation', 
        fullLabel: 'Compensation & Benefits', 
        desc: 'Salary, bonus, equity & retirement packages', 
        icon: DollarSign 
    },
    { 
        id: 'remoteFlexibility', 
        label: 'Remote Flexibility', 
        fullLabel: 'Remote Flexibility', 
        desc: 'Work-from-home policy & flexible hours', 
        icon: Clock 
    },
    { 
        id: 'growth', 
        label: 'Career Growth', 
        fullLabel: 'Career Growth', 
        desc: 'Promotions, learning budgets & leadership scope', 
        icon: TrendingUp 
    },
    { 
        id: 'productFit', 
        label: 'Company Fit', 
        fullLabel: 'Company Fit', 
        desc: 'Company stability, market demand & domain alignment', 
        icon: Star 
    },
    { 
        id: 'techStack', 
        label: 'Tech Stack', 
        fullLabel: 'Tech Stack', 
        desc: 'Modern frameworks, tooling & developer velocity', 
        icon: Cpu 
    },
    { 
        id: 'culture', 
        label: 'Work Culture', 
        fullLabel: 'Work Culture', 
        desc: 'Work-life balance, diversity & team dynamics', 
        icon: Users 
    },
    { 
        id: 'leadership', 
        label: 'Leadership & Vision', 
        fullLabel: 'Leadership & Vision', 
        desc: 'Executive strength & mentorship quality', 
        icon: Compass 
    },
    { 
        id: 'aiMaturity', 
        label: 'AI Maturity', 
        fullLabel: 'AI Maturity & Tooling', 
        desc: 'Adoption of AI tools & modern infrastructure', 
        icon: Sparkles 
    }
];

export const getCriteriaById = (id: string): CriteriaItem => {
    return CRITERIA_LIST.find(c => c.id === id) || {
        id,
        label: id,
        fullLabel: id,
        desc: '',
        icon: Star
    };
};

export const parseRubricFromMarkdown = (markdown: string) => {
    const raw = markdown || '';
    
    // Extract goal
    let goal = 'I am looking for high-growth tech opportunities with strong engineering culture.';
    const goalMatch = raw.match(/#\s*Job\s*Search\s*Goal\s*([\s\S]*?)(?:#|$)/i);
    if (goalMatch && goalMatch[1] && goalMatch[1].trim()) {
        goal = goalMatch[1].trim();
    } else if (raw && !raw.includes('# Evaluation Criteria Weights')) {
        goal = raw.slice(0, 300).trim();
    }

    // Extract weights
    const getWeight = (regex: RegExp): number | null => {
        const match = raw.match(regex);
        if (match && match[1]) {
            const val = parseInt(match[1], 10);
            return isNaN(val) ? null : val;
        }
        return null;
    };

    const weights: Record<string, number> = {
        compensation: getWeight(/-\s*Compensation:\s*(\d+)%/i) ?? 20,
        productFit: getWeight(/-\s*(?:Product\s*Fit|Company\s*Fit|ProductFit):\s*(\d+)%/i) ?? 20,
        remoteFlexibility: getWeight(/-\s*(?:Remote\s*Flexibility|RemoteFlexibility):\s*(\d+)%/i) ?? 15,
        aiMaturity: getWeight(/-\s*(?:AI\s*Maturity|AIMaturity):\s*(\d+)%/i) ?? 10,
        leadership: getWeight(/-\s*Leadership:\s*(\d+)%/i) ?? 10,
        growth: getWeight(/-\s*Growth:\s*(\d+)%/i) ?? 10,
        culture: getWeight(/-\s*Culture:\s*(\d+)%/i) ?? 10,
        techStack: getWeight(/-\s*(?:Tech\s*Stack|TechStack):\s*(\d+)%/i) ?? 5,
    };

    const allIds = CRITERIA_LIST.map(c => c.id);
    const sorted = [...allIds].sort((a, b) => (weights[b] || 0) - (weights[a] || 0));

    // Derive tiers based on parsed weights
    const mustHaves: string[] = [];
    const important: string[] = [];
    const niceToHaves: string[] = [];

    sorted.forEach(id => {
        const w = weights[id] || 0;
        if (w >= 20 && mustHaves.length < 2) {
            mustHaves.push(id);
        } else if (w >= 12 && important.length < 2) {
            important.push(id);
        } else {
            niceToHaves.push(id);
        }
    });

    // Ensure we don't have empty tiers if there were default weights
    if (mustHaves.length === 0 && important.length === 0) {
        mustHaves.push(sorted[0] || 'compensation');
        if (sorted[1]) important.push(sorted[1]);
    }

    return { goal, mustHaves, important, niceToHaves };
};

export const buildRubricMarkdown = (
    goal: string, 
    mustHaves: string[], 
    important: string[]
): string => {
    const points: Record<string, number> = {};
    let totalPoints = 0;

    CRITERIA_LIST.forEach(c => {
        let p = 1; // Nice-to-Have default = 1 pt (approx 5-10%)
        if (mustHaves.includes(c.id)) {
            p = 5; // Must-Have = 5 pts (approx 25%)
        } else if (important.includes(c.id)) {
            p = 3; // High Priority = 3 pts (approx 15%)
        }
        points[c.id] = p;
        totalPoints += p;
    });

    const calculated: Record<string, number> = {};
    CRITERIA_LIST.forEach(c => {
        calculated[c.id] = Math.round((points[c.id] / (totalPoints || 1)) * 100);
    });

    const sum = Object.values(calculated).reduce((a, b) => a + b, 0);
    if (sum !== 100 && Object.keys(calculated).length > 0) {
        const diff = 100 - sum;
        calculated[Object.keys(calculated)[0]] += diff;
    }

    return `# Job Search Goal
${goal.trim()}

# Evaluation Criteria Weights
- Compensation: ${calculated.compensation || 15}%
- Company Fit: ${calculated.productFit || 15}% (Company business viability and overall role alignment)
- Remote Flexibility: ${calculated.remoteFlexibility || 15}%
- AI Maturity: ${calculated.aiMaturity || 10}%
- Leadership: ${calculated.leadership || 10}%
- Growth: ${calculated.growth || 15}%
- Culture: ${calculated.culture || 10}%
- Tech Stack: ${calculated.techStack || 10}%`;
};

interface RubricBuilderProps {
    value: string;
    onChange: (markdown: string) => void;
}

export default function RubricBuilder({ value, onChange }: RubricBuilderProps) {
    const [rawMode, setRawMode] = useState(false);
    const [goal, setGoal] = useState('I am looking for high-growth tech opportunities with strong engineering culture.');
    const [mustHaves, setMustHaves] = useState<string[]>([]);
    const [important, setImportant] = useState<string[]>([]);
    const [niceToHaves, setNiceToHaves] = useState<string[]>([]);

    // Initialize from props
    useEffect(() => {
        if (!rawMode) {
            const parsed = parseRubricFromMarkdown(value);
            setGoal(parsed.goal);
            setMustHaves(parsed.mustHaves);
            setImportant(parsed.important);
            setNiceToHaves(parsed.niceToHaves);
        }
    }, [value, rawMode]);

    const triggerUpdate = useCallback((newGoal: string, newMust: string[], newImp: string[]) => {
        const md = buildRubricMarkdown(newGoal, newMust, newImp);
        onChange(md);
    }, [onChange]);

    const handleGoalChange = (newGoal: string) => {
        setGoal(newGoal);
        triggerUpdate(newGoal, mustHaves, important);
    };

    const handleRemoveNonNegotiable = (id: string) => {
        const nextMust = mustHaves.filter(item => item !== id);
        const nextNice = niceToHaves.includes(id) ? niceToHaves : [...niceToHaves, id];
        setMustHaves(nextMust);
        setNiceToHaves(nextNice);
        triggerUpdate(goal, nextMust, important);
    };

    const handleRemoveHighPriority = (id: string) => {
        const nextImp = important.filter(item => item !== id);
        const nextNice = niceToHaves.includes(id) ? niceToHaves : [...niceToHaves, id];
        setImportant(nextImp);
        setNiceToHaves(nextNice);
        triggerUpdate(goal, mustHaves, nextImp);
    };

    const handlePromoteToNonNegotiable = (id: string) => {
        if (mustHaves.length >= 2) return;
        const nextNice = niceToHaves.filter(item => item !== id);
        const nextImp = important.filter(item => item !== id);
        const nextMust = [...mustHaves, id];
        setNiceToHaves(nextNice);
        setImportant(nextImp);
        setMustHaves(nextMust);
        triggerUpdate(goal, nextMust, nextImp);
    };

    const handlePromoteToHighPriority = (id: string) => {
        if (important.length >= 2) return;
        const nextNice = niceToHaves.filter(item => item !== id);
        const nextMust = mustHaves.filter(item => item !== id);
        const nextImp = [...important, id];
        setNiceToHaves(nextNice);
        setMustHaves(nextMust);
        setImportant(nextImp);
        triggerUpdate(goal, nextMust, nextImp);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
            {/* Header controls: visual chips vs raw markdown */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    Configure what factors the AI prioritizes when scoring and matching opportunities to your profile.
                </p>
                <button
                    type="button"
                    onClick={() => setRawMode(!rawMode)}
                    className="btn-outline"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.78rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        cursor: 'pointer'
                    }}
                >
                    {rawMode ? <Sliders size={14} /> : <Code size={14} />}
                    {rawMode ? 'Visual Rubric Builder' : 'Edit Raw Markdown'}
                </button>
            </div>

            {rawMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    <textarea
                        value={value || ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Enter target job titles, key skills, industry preferences, and scoring rubric..."
                        style={{
                            width: '100%',
                            minHeight: '220px',
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            padding: '1rem',
                            fontSize: '0.88rem',
                            fontFamily: 'monospace',
                            resize: 'vertical',
                            boxSizing: 'border-box'
                        }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Ensure weight lines follow the format <code>- Category: XX%</code> so the scoring agent can parse them.
                    </span>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                    {/* 1. Non-Negotiables Section */}
                    <div style={{ 
                        background: 'rgba(16, 185, 129, 0.04)', 
                        border: '1px solid rgba(16, 185, 129, 0.25)', 
                        borderRadius: '10px', 
                        padding: '1rem' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Flame size={16} style={{ color: '#10b981' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    Non-Negotiables
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    ({mustHaves.length} / 2)
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, background: 'rgba(16, 185, 129, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                ~25% Weight Each
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', minHeight: '38px', alignItems: 'center' }}>
                            {mustHaves.length === 0 ? (
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    No non-negotiables selected. Add from Nice to Have below.
                                </span>
                            ) : (
                                mustHaves.map(id => {
                                    const c = getCriteriaById(id);
                                    const IconComp = c.icon;
                                    return (
                                        <div 
                                            key={id}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                background: 'rgba(16, 185, 129, 0.15)',
                                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                                color: 'var(--text-primary)',
                                                padding: '0.4rem 0.8rem',
                                                borderRadius: '20px',
                                                fontSize: '0.84rem',
                                                fontWeight: 600
                                            }}
                                        >
                                            <IconComp size={15} style={{ color: '#10b981' }} />
                                            <span>{c.label}</span>
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveNonNegotiable(id)}
                                                title="Move to Nice to Have"
                                                style={{
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    border: 'none',
                                                    borderRadius: '50%',
                                                    width: '18px',
                                                    height: '18px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    marginLeft: '0.2rem'
                                                }}
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 2. High Priorities Section */}
                    <div style={{ 
                        background: 'rgba(245, 158, 11, 0.04)', 
                        border: '1px solid rgba(245, 158, 11, 0.25)', 
                        borderRadius: '10px', 
                        padding: '1rem' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Star size={16} style={{ color: '#f59e0b' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    High Priorities
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    ({important.length} / 2)
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, background: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                                ~15% Weight Each
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', minHeight: '38px', alignItems: 'center' }}>
                            {important.length === 0 ? (
                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    No high priorities selected. Add from Nice to Have below.
                                </span>
                            ) : (
                                important.map(id => {
                                    const c = getCriteriaById(id);
                                    const IconComp = c.icon;
                                    return (
                                        <div 
                                            key={id}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                background: 'rgba(245, 158, 11, 0.15)',
                                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                                color: 'var(--text-primary)',
                                                padding: '0.4rem 0.8rem',
                                                borderRadius: '20px',
                                                fontSize: '0.84rem',
                                                fontWeight: 600
                                            }}
                                        >
                                            <IconComp size={15} style={{ color: '#f59e0b' }} />
                                            <span>{c.label}</span>
                                            <button 
                                                type="button"
                                                onClick={() => handleRemoveHighPriority(id)}
                                                title="Move to Nice to Have"
                                                style={{
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    border: 'none',
                                                    borderRadius: '50%',
                                                    width: '18px',
                                                    height: '18px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    color: 'var(--text-secondary)',
                                                    marginLeft: '0.2rem'
                                                }}
                                            >
                                                <X size={11} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 3. Nice to Have Section */}
                    <div style={{ 
                        background: 'rgba(255, 255, 255, 0.02)', 
                        border: '1px solid var(--border-glass)', 
                        borderRadius: '10px', 
                        padding: '1rem' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Sparkles size={16} style={{ color: 'var(--text-secondary)' }} />
                                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    Nice to Have
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    ({niceToHaves.length} items)
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                ~5% Weight Each
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {niceToHaves.map(id => {
                                const c = getCriteriaById(id);
                                const IconComp = c.icon;
                                const canPromoteMustHave = mustHaves.length < 2;
                                const canPromoteHighPriority = important.length < 2;
                                const showPromotionButtons = canPromoteMustHave || canPromoteHighPriority;

                                return (
                                    <div 
                                        key={id}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            background: 'rgba(255, 255, 255, 0.04)',
                                            border: '1px solid var(--border-glass)',
                                            color: 'var(--text-secondary)',
                                            padding: showPromotionButtons ? '0.35rem 0.65rem' : '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            fontSize: '0.82rem',
                                            fontWeight: 500
                                        }}
                                    >
                                        <IconComp size={14} />
                                        <span>{c.label}</span>

                                        {showPromotionButtons && (
                                            <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.25rem' }}>
                                                {canPromoteMustHave && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePromoteToNonNegotiable(id)}
                                                        style={{
                                                            background: 'rgba(16, 185, 129, 0.2)',
                                                            border: '1px solid rgba(16, 185, 129, 0.4)',
                                                            color: '#10b981',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '10px',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Promote to Non-Negotiable"
                                                    >
                                                        + Non-Negotiable
                                                    </button>
                                                )}
                                                {canPromoteHighPriority && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePromoteToHighPriority(id)}
                                                        style={{
                                                            background: 'rgba(245, 158, 11, 0.2)',
                                                            border: '1px solid rgba(245, 158, 11, 0.4)',
                                                            color: '#f59e0b',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            padding: '0.12rem 0.45rem',
                                                            borderRadius: '10px',
                                                            cursor: 'pointer'
                                                        }}
                                                        title="Promote to High Priority"
                                                    >
                                                        + High Priority
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 4. Target Job Search Goal */}
                    <div style={{ 
                        marginTop: '0.5rem', 
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        width: '100%' 
                    }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Personalized Job Search Goal
                        </label>
                        <textarea 
                            value={goal}
                            onChange={(e) => handleGoalChange(e.target.value)}
                            placeholder="Example: I am looking for high-growth tech opportunities with strong engineering culture..."
                            style={{ 
                                width: '100%', 
                                boxSizing: 'border-box', 
                                background: 'rgba(0,0,0,0.2)', 
                                border: '1px solid var(--border-glass)', 
                                color: 'var(--text-primary)', 
                                padding: '0.75rem 1rem', 
                                borderRadius: '8px', 
                                minHeight: '65px', 
                                resize: 'vertical', 
                                fontSize: '0.88rem' 
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
