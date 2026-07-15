const fs = require('fs');
const file = '/Users/kurtcharles/Projects/Job-agent/src/app/onboarding/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const stateBlockRegex = /const \[weights, setWeights\] = useState\(\{[\s\S]*?\}\);/;
const stateReplacement = `
    type PriorityLevel = 'mustHave' | 'important' | 'niceToHave';
    const [bucketState, setBucketState] = useState<Record<string, PriorityLevel>>({
        compensation: 'important',
        productFit: 'important',
        remoteFlexibility: 'niceToHave',
        aiMaturity: 'niceToHave',
        leadership: 'niceToHave',
        growth: 'niceToHave',
        culture: 'niceToHave',
        techStack: 'niceToHave'
    });
    
    const [draggedItem, setDraggedItem] = useState<string | null>(null);

    const criteriaList = [
        { id: 'compensation', label: 'Compensation & Benefits', desc: 'Salary, equity, health, retirement packages' },
        { id: 'productFit', label: 'Company Fit', desc: 'Company/business stability, market demand, and role alignment' },
        { id: 'remoteFlexibility', label: 'Remote Flexibility', desc: 'Work-from-home policy, flexible hours' },
        { id: 'aiMaturity', label: 'AI Maturity & Tooling', desc: 'Use of AI tools, modern infrastructure' },
        { id: 'leadership', label: 'Leadership & Vision', desc: 'Executive strength, mentorship quality' },
        { id: 'growth', label: 'Career Growth', desc: 'Promotions, learning budgets, responsibilities' },
        { id: 'culture', label: 'Work Culture', desc: 'Work-life balance, diversity, collaboration' },
        { id: 'techStack', label: 'Tech Stack', desc: 'Modern frameworks, developer tooling' }
    ];

    const getCalculatedWeights = () => {
        const points: Record<PriorityLevel, number> = { mustHave: 5, important: 3, niceToHave: 1 };
        let totalPoints = 0;
        const mappedPoints: Record<string, number> = {};
        
        Object.keys(bucketState).forEach(key => {
            const p = points[bucketState[key] as PriorityLevel];
            mappedPoints[key] = p;
            totalPoints += p;
        });

        const calculated: Record<string, number> = {};
        Object.keys(mappedPoints).forEach(key => {
            calculated[key] = Math.round((mappedPoints[key] / totalPoints) * 100);
        });
        
        const sum = Object.values(calculated).reduce((a, b) => a + b, 0);
        if (sum !== 100 && Object.keys(calculated).length > 0) {
            const diff = 100 - sum;
            calculated[Object.keys(calculated)[0]] += diff;
        }
        
        return calculated;
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedItem(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropToBucket = (e: React.DragEvent, level: PriorityLevel) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) {
            setBucketState(prev => ({ ...prev, [id]: level }));
        }
        setDraggedItem(null);
    };
`;
content = content.replace(stateBlockRegex, stateReplacement);

const submitBlockRegex = /const handleSubmit = async \(\) => \{\n        setLoading\(true\);\n        try \{\n            const finalProfile = `# Job Search Goal\n\$\{goal\}\n\n# Evaluation Criteria Weights\n- Compensation: \$\{weights.compensation\}%\n- Company Fit: \$\{weights.productFit\}% \(Company business viability and overall role alignment\)\n- Remote Flexibility: \$\{weights.remoteFlexibility\}%\n- AI Maturity: \$\{weights.aiMaturity\}%\n- Leadership: \$\{weights.leadership\}%\n- Growth: \$\{weights.growth\}%\n- Culture: \$\{weights.culture\}%\n- Tech Stack: \$\{weights.techStack\}%`;/;
const submitReplacement = `const handleSubmit = async () => {
        setLoading(true);
        try {
            const calculatedWeights = getCalculatedWeights();
            const finalProfile = \`# Job Search Goal
\${goal}

# Evaluation Criteria Weights
- Compensation: \${calculatedWeights.compensation}%
- Company Fit: \${calculatedWeights.productFit}% (Company business viability and overall role alignment)
- Remote Flexibility: \${calculatedWeights.remoteFlexibility}%
- AI Maturity: \${calculatedWeights.aiMaturity}%
- Leadership: \${calculatedWeights.leadership}%
- Growth: \${calculatedWeights.growth}%
- Culture: \${calculatedWeights.culture}%
- Tech Stack: \${calculatedWeights.techStack}%\`;`;
content = content.replace(submitBlockRegex, submitReplacement);

const step3Regex = /<div style={{ marginBottom: '1\.5rem' }}>\s*<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0\.5rem' }}>\s*<label style={{ fontSize: '1rem', fontWeight: 600, color: 'var\(--text-primary\)' }}>2\. Adjust Evaluation Weights<\/label>[\s\S]*?<\/div>\n                        <\/div>/;
const step3Replacement = `<div style={{ marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                                <label style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>2. Sort Your Priorities</label>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Drag & Drop to re-weight</span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Percentages dynamically update. Must-Haves carry 5x more weight than Nice-to-Haves.</p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', minHeight: '350px' }}>
                                
                                {([
                                    { level: 'mustHave', title: '🔥 Must-Haves', desc: 'Dealbreakers', bg: 'rgba(239, 68, 68, 0.05)', border: 'rgba(239, 68, 68, 0.2)' },
                                    { level: 'important', title: '⭐ Important', desc: 'Strong preferences', bg: 'rgba(245, 158, 11, 0.05)', border: 'rgba(245, 158, 11, 0.2)' },
                                    { level: 'niceToHave', title: '✨ Nice-to-Haves', desc: 'Bonus points', bg: 'rgba(59, 130, 246, 0.05)', border: 'rgba(59, 130, 246, 0.2)' }
                                ] as const).map(bucket => (
                                    <div 
                                        key={bucket.level}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDropToBucket(e, bucket.level as PriorityLevel)}
                                        style={{ 
                                            background: bucket.bg, 
                                            border: \`1px solid \${bucket.border}\`, 
                                            borderRadius: '8px', 
                                            padding: '1rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem'
                                        }}
                                    >
                                        <div style={{ marginBottom: '0.5rem' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{bucket.title}</h3>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{bucket.desc}</span>
                                        </div>
                                        
                                        {criteriaList.filter(c => bucketState[c.id] === bucket.level).map(c => {
                                            const calculatedWeights = getCalculatedWeights();
                                            const pct = calculatedWeights[c.id];
                                            return (
                                                <div 
                                                    key={c.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, c.id)}
                                                    onDragEnd={() => setDraggedItem(null)}
                                                    style={{ 
                                                        background: 'var(--bg-color)', 
                                                        padding: '0.75rem', 
                                                        borderRadius: '6px', 
                                                        border: '1px solid var(--border-glass)',
                                                        cursor: 'grab',
                                                        opacity: draggedItem === c.id ? 0.5 : 1,
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.label}</span>
                                                        <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '0.85rem' }}>{pct}%</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{c.desc}</div>
                                                </div>
                                            );
                                        })}
                                        {criteriaList.filter(c => bucketState[c.id] === bucket.level).length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--border-glass)', borderRadius: '6px' }}>
                                                Drop items here
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>`;
content = content.replace(step3Regex, step3Replacement);

fs.writeFileSync(file, content);
console.log('Successfully replaced file content');
