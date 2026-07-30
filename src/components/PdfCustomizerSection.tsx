"use client";

import { useState, useEffect, useRef } from 'react';
import { 
    Palette, Copy, RotateCcw, CheckCircle2, 
    AlignLeft, AlignCenter, ChevronDown, Columns
} from 'lucide-react';
import { generateStyledPdfHtml, PDF_TEMPLATES, PdfStyleOptions } from '@/lib/pdfGeneratorHelper';
import DownloadPdfButton from './DownloadPdfButton';

interface PdfCustomizerSectionProps {
    settings: any;
    onChange: (key: string, value: any) => void;
}

const SAMPLE_RESUME = `# Jane Doe
Senior Software Engineer | San Francisco, CA | jane.doe@example.com | (555) 019-2834

## Professional Summary
Accomplished Senior Software Engineer with 8+ years of experience engineering high-throughput distributed systems, modern web applications, and AI integrations.

## Work Experience
### Lead Engineer — TechCorp Inc.
*2021 - Present | San Francisco, CA*
- Scaled distributed backend infrastructure to serve over 2M daily active users with 99.99% system availability.
- Reduced database query latency by 45% using Redis caching strategies and optimized SQL queries.
- Mentored a team of 6 engineers and established standard CI/CD deployment pipelines.

### Senior Full-Stack Developer — CloudScale Systems
*2018 - 2021 | Austin, TX*
- Architected microservices platform handling $10M+ in quarterly transactions using Node.js and PostgreSQL.
- Reduced initial frontend web app load time from 3.2 seconds down to 800ms.

## Technical Skills
- **Languages & Frameworks:** TypeScript, React, Next.js, Node.js, Python, SQL, HTML5, CSS3
- **Cloud & DevOps:** AWS, Docker, Kubernetes, PostgreSQL, Redis, Git, CI/CD pipelines`;

const SAMPLE_COVER_LETTER = `# Jane Doe
jane.doe@example.com | (555) 019-2834 | San Francisco, CA

July 30, 2026

Hiring Manager
Acme Innovations Inc.

Dear Hiring Manager,

I am writing to express my strong interest in the Senior Software Engineer role at Acme Innovations Inc. With over 8 years of experience building scalable cloud architecture and leading high-performing engineering teams, I am confident in my ability to contribute significantly to your team's mission.

In my recent work at TechCorp Inc., I led the engineering effort to scale our distributed systems to support 2 million daily active users while maintaining 99.99% uptime. Furthermore, at CloudScale Systems, I designed microservices processing over $10M in transaction volume. These accomplishments align directly with Acme's goals of scaling platform infrastructure and optimizing performance.

I welcome the opportunity to discuss how my technical expertise and collaborative approach can drive results for Acme Innovations Inc. Thank you for your consideration, and I look forward to speaking with you.

Sincerely,
Jane Doe`;

export default function PdfCustomizerSection({ settings, onChange }: PdfCustomizerSectionProps) {
    const [activeTab, setActiveTab] = useState<'resume' | 'coverLetter'>('resume');
    const [previewHtml, setPreviewHtml] = useState<string>('');
    const [copiedMatch, setCopiedMatch] = useState(false);

    const headerColorInputRef = useRef<HTMLInputElement>(null);
    const textColorInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const hash = window.location.hash;
            if (hash.startsWith('#pdf-styling')) {
                if (hash.includes('cover-letter')) {
                    setActiveTab('coverLetter');
                } else if (hash.includes('resume')) {
                    setActiveTab('resume');
                }
                setTimeout(() => {
                    const el = document.getElementById('pdf-styling');
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);
            }
        }
    }, []);

    const prefix = activeTab === 'resume' ? 'resumePdf' : 'coverLetterPdf';

    const currentTemplate = settings[`${prefix}Template`] || 'classic';
    const currentFontFamily = settings[`${prefix}FontFamily`] || 'Helvetica, Arial, sans-serif';
    const currentFontSize = settings[`${prefix}FontSize`] || '11pt';
    const currentLineHeight = settings[`${prefix}LineHeight`] || '1.5';
    const currentPrimaryColor = settings[`${prefix}PrimaryColor`] || '#1e3a8a';
    const currentTextColor = settings[`${prefix}TextColor`] || '#111827';
    const currentMargin = settings[`${prefix}Margin`] || '0.5in';
    const currentHeaderLayout = settings[`${prefix}HeaderLayout`] || 'left';

    const currentMarkdown = activeTab === 'resume' 
        ? (settings.resumeMarkdown || SAMPLE_RESUME)
        : SAMPLE_COVER_LETTER;

    // Render HTML preview synchronously when settings or tab changes
    useEffect(() => {
        const options: PdfStyleOptions = {
            template: currentTemplate,
            fontFamily: currentFontFamily,
            fontSize: currentFontSize,
            lineHeight: currentLineHeight,
            primaryColor: currentPrimaryColor,
            textColor: currentTextColor,
            margin: currentMargin,
            headerLayout: currentHeaderLayout
        };
        setPreviewHtml(generateStyledPdfHtml(currentMarkdown, options));
    }, [
        activeTab, 
        currentTemplate, 
        currentFontFamily, 
        currentFontSize, 
        currentLineHeight, 
        currentPrimaryColor, 
        currentTextColor, 
        currentMargin, 
        currentHeaderLayout,
        currentMarkdown
    ]);

    const handleApplyTemplate = (templateKey: string) => {
        const tpl = PDF_TEMPLATES[templateKey];
        if (!tpl) return;
        onChange(`${prefix}Template`, templateKey);
        onChange(`${prefix}FontFamily`, tpl.fontFamily);
        onChange(`${prefix}FontSize`, tpl.fontSize);
        onChange(`${prefix}LineHeight`, tpl.lineHeight);
        onChange(`${prefix}PrimaryColor`, tpl.primaryColor);
        onChange(`${prefix}TextColor`, tpl.textColor);
        onChange(`${prefix}Margin`, tpl.margin);
        onChange(`${prefix}HeaderLayout`, tpl.headerLayout);
    };

    const handleStyleCoverLetterToMatch = () => {
        onChange('coverLetterPdfTemplate', settings.resumePdfTemplate || 'classic');
        onChange('coverLetterPdfFontFamily', settings.resumePdfFontFamily || 'Helvetica, Arial, sans-serif');
        onChange('coverLetterPdfFontSize', settings.resumePdfFontSize || '11pt');
        onChange('coverLetterPdfLineHeight', settings.resumePdfLineHeight || '1.5');
        onChange('coverLetterPdfPrimaryColor', settings.resumePdfPrimaryColor || '#1e3a8a');
        onChange('coverLetterPdfTextColor', settings.resumePdfTextColor || '#111827');
        onChange('coverLetterPdfMargin', settings.resumePdfMargin || '0.5in');
        onChange('coverLetterPdfHeaderLayout', settings.resumePdfHeaderLayout || 'left');
    };

    const isMatched = (
        (settings.coverLetterPdfTemplate || 'classic') === (settings.resumePdfTemplate || 'classic') &&
        (settings.coverLetterPdfFontFamily || 'Helvetica, Arial, sans-serif') === (settings.resumePdfFontFamily || 'Helvetica, Arial, sans-serif') &&
        (settings.coverLetterPdfFontSize || '11pt') === (settings.resumePdfFontSize || '11pt') &&
        (settings.coverLetterPdfLineHeight || '1.5') === (settings.resumePdfLineHeight || '1.5') &&
        (settings.coverLetterPdfPrimaryColor || '#1e3a8a') === (settings.resumePdfPrimaryColor || '#1e3a8a') &&
        (settings.coverLetterPdfTextColor || '#111827') === (settings.resumePdfTextColor || '#111827') &&
        (settings.coverLetterPdfMargin || '0.5in') === (settings.resumePdfMargin || '0.5in') &&
        (settings.coverLetterPdfHeaderLayout || 'left') === (settings.resumePdfHeaderLayout || 'left')
    );

    const handleMatchCheckboxChange = (checked: boolean) => {
        if (checked) {
            handleStyleCoverLetterToMatch();
        }
    };

    return (
        <div className="glass-card" id="pdf-styling" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header Title */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
                        <Palette size={18} className="text-accent" /> PDF Document Styling
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0 0' }}>
                        Customize layout, typography, colors, and margins for exported PDF documents
                    </p>
                </div>
            </div>

            {/* Target Selector Tabs (Resume / Cover Letter) */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('resume')}
                    style={{
                        padding: '0.4rem 1rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        background: activeTab === 'resume' ? '#2563eb' : 'transparent',
                        color: activeTab === 'resume' ? '#ffffff' : 'var(--text-primary)',
                        border: 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    Resume PDF Styles
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('coverLetter')}
                    style={{
                        padding: '0.4rem 1rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        background: activeTab === 'coverLetter' ? '#2563eb' : 'transparent',
                        color: activeTab === 'coverLetter' ? '#ffffff' : 'var(--text-primary)',
                        border: 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    Cover Letter PDF Styles
                </button>
            </div>

            {/* ========================================================= */}
            {/* COMPACT STYLING TOOLBAR (EXACT MATCH TO REFERENCE IMAGE)  */}
            {/* ========================================================= */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-glass)',
                borderRadius: '14px',
                padding: '0.85rem 1.1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)'
            }}>
                
                {/* ROW 1: Presets, Header Palette & Alignment, Margins, Text Color Palette */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    flexWrap: 'wrap', 
                    gap: '0.85rem'
                }}>
                    {/* Presets Select */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Presets
                        </span>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <select
                                value={currentTemplate}
                                onChange={(e) => handleApplyTemplate(e.target.value)}
                                style={{
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundColor: '#f1f5f9',
                                    color: '#0f172a',
                                    padding: '0.3rem 1.7rem 0.3rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    fontSize: '0.82rem',
                                    border: '1px solid var(--border-glass)',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <option value="classic">Classic</option>
                                <option value="modern">Modern</option>
                                <option value="executive">Executive</option>
                                <option value="tech">Tech Mono</option>
                                <option value="minimal">Minimal</option>
                                <option value="custom">Custom</option>
                            </select>
                            <ChevronDown size={14} color="#0f172a" style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        </div>
                    </div>

                    {/* Header Controls (Palette + Segmented Alignment) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            Header
                        </span>
                        
                        {/* Header Color Palette Button */}
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                                type="button"
                                title="Change Header / Accent Color"
                                onClick={() => headerColorInputRef.current?.click()}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#9ca3af',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.35rem 0.6rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                    position: 'relative'
                                }}
                            >
                                <Palette size={16} color="#ffffff" />
                                <span style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: currentPrimaryColor,
                                    border: '1px solid #ffffff'
                                }} />
                            </button>
                            <input
                                ref={headerColorInputRef}
                                type="color"
                                value={currentPrimaryColor}
                                onChange={(e) => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}PrimaryColor`, e.target.value);
                                }}
                                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                            />
                        </div>

                        {/* Segmented Alignment Buttons */}
                        <div style={{
                            display: 'flex',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-glass)',
                            background: '#a1a1aa'
                        }}>
                            <button
                                type="button"
                                title="Left Aligned"
                                onClick={() => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}HeaderLayout`, 'left');
                                }}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    border: 'none',
                                    background: currentHeaderLayout === 'left' ? '#4a433d' : 'transparent',
                                    color: currentHeaderLayout === 'left' ? '#ffffff' : '#3f3f46',
                                    cursor: 'pointer'
                                }}
                            >
                                <AlignLeft size={15} />
                            </button>
                            <button
                                type="button"
                                title="Centered"
                                onClick={() => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}HeaderLayout`, 'centered');
                                }}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    border: 'none',
                                    background: currentHeaderLayout === 'centered' ? '#4a433d' : 'transparent',
                                    color: currentHeaderLayout === 'centered' ? '#ffffff' : '#3f3f46',
                                    cursor: 'pointer'
                                }}
                            >
                                <AlignCenter size={15} />
                            </button>
                            <button
                                type="button"
                                title="Split Header"
                                onClick={() => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}HeaderLayout`, 'split');
                                }}
                                style={{
                                    padding: '0.35rem 0.65rem',
                                    border: 'none',
                                    background: currentHeaderLayout === 'split' ? '#4a433d' : 'transparent',
                                    color: currentHeaderLayout === 'split' ? '#ffffff' : '#3f3f46',
                                    cursor: 'pointer'
                                }}
                            >
                                <Columns size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Margins Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'lowercase' }}>
                            margins
                        </span>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <select
                                value={currentMargin}
                                onChange={(e) => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}Margin`, e.target.value);
                                }}
                                style={{
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundColor: '#f1f5f9',
                                    color: '#0f172a',
                                    padding: '0.3rem 1.6rem 0.3rem 0.75rem',
                                    borderRadius: '8px',
                                    fontWeight: 500,
                                    fontSize: '0.82rem',
                                    border: '1px solid var(--border-glass)',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                <option value="0.3in">0.3 in</option>
                                <option value="0.4in">0.4 in</option>
                                <option value="0.5in">0.5 in</option>
                                <option value="0.6in">0.6 in</option>
                                <option value="0.65in">0.65 in</option>
                            </select>
                            <ChevronDown size={14} color="#0f172a" style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        </div>
                    </div>

                    {/* Text Color Palette Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Text Color</span>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                                type="button"
                                title="Change Text Color"
                                onClick={() => textColorInputRef.current?.click()}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: '#9ca3af',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '0.35rem 0.6rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                                    position: 'relative'
                                }}
                            >
                                <Palette size={16} color="#ffffff" />
                                <span style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    backgroundColor: currentTextColor,
                                    border: '1px solid #ffffff'
                                }} />
                            </button>
                            <input
                                ref={textColorInputRef}
                                type="color"
                                value={currentTextColor}
                                onChange={(e) => {
                                    onChange(`${prefix}Template`, 'custom');
                                    onChange(`${prefix}TextColor`, e.target.value);
                                }}
                                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
                            />
                        </div>
                    </div>
                </div>

                {/* ROW 2: Font family, Font Size, Line Spacing Full-Width Dropdowns */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                    gap: '0.75rem'
                }}>
                    {/* Font Family Dropdown */}
                    <div style={{ position: 'relative' }}>
                        <select
                            value={currentFontFamily}
                            onChange={(e) => {
                                onChange(`${prefix}Template`, 'custom');
                                onChange(`${prefix}FontFamily`, e.target.value);
                            }}
                            style={{
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-glass)',
                                color: '#0f172a',
                                padding: '0.45rem 1.8rem 0.45rem 0.75rem',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                width: '100%',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <option value="Helvetica, Arial, sans-serif">Font family: Helvetica / Arial</option>
                            <option value="Inter, -apple-system, BlinkMacSystemFont, sans-serif">Font family: Inter (Modern)</option>
                            <option value="Roboto, Arial, sans-serif">Font family: Roboto (Neat)</option>
                            <option value="Georgia, 'Times New Roman', serif">Font family: Georgia (Serif)</option>
                            <option value="Merriweather, Georgia, serif">Font family: Merriweather (Editorial)</option>
                            <option value='"Courier New", Courier, monospace'>Font family: Courier New (Tech Mono)</option>
                        </select>
                        <ChevronDown size={14} color="#0f172a" style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>

                    {/* Font Size Dropdown */}
                    <div style={{ position: 'relative' }}>
                        <select
                            value={currentFontSize}
                            onChange={(e) => {
                                onChange(`${prefix}Template`, 'custom');
                                onChange(`${prefix}FontSize`, e.target.value);
                            }}
                            style={{
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-glass)',
                                color: '#0f172a',
                                padding: '0.45rem 1.8rem 0.45rem 0.75rem',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                width: '100%',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <option value="9.5pt">Font Size: 9.5 pt (Compact)</option>
                            <option value="10pt">Font Size: 10 pt (Small)</option>
                            <option value="10.5pt">Font Size: 10.5 pt (Standard)</option>
                            <option value="11pt">Font Size: 11 pt (Medium)</option>
                            <option value="12pt">Font Size: 12 pt (Large)</option>
                        </select>
                        <ChevronDown size={14} color="#0f172a" style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>

                    {/* Line Spacing Dropdown */}
                    <div style={{ position: 'relative' }}>
                        <select
                            value={currentLineHeight}
                            onChange={(e) => {
                                onChange(`${prefix}Template`, 'custom');
                                onChange(`${prefix}LineHeight`, e.target.value);
                            }}
                            style={{
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                background: '#f1f5f9',
                                border: '1px solid var(--border-glass)',
                                color: '#0f172a',
                                padding: '0.45rem 1.8rem 0.45rem 0.75rem',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                width: '100%',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <option value="1.3">Line Spacing: 1.3 (Tight)</option>
                            <option value="1.45">Line Spacing: 1.45 (Standard)</option>
                            <option value="1.5">Line Spacing: 1.5 (Normal)</option>
                            <option value="1.65">Line Spacing: 1.65 (Relaxed)</option>
                        </select>
                        <ChevronDown size={14} color="#0f172a" style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                </div>

            </div>
            {/* ========================================================= */}
            {/* END TOOLBAR COMPONENT */}
            {/* ========================================================= */}


            {/* Live PDF Preview Display (Sits Directly Below the Toolbar) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Live PDF Preview ({activeTab === 'resume' ? 'Base Resume' : 'Cover Letter'})
                        </span>
                        <button
                            type="button"
                            onClick={() => handleApplyTemplate('classic')}
                            title={`Reset ${activeTab === 'resume' ? 'Resume' : 'Cover Letter'} styles to default`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid var(--border-glass)',
                                borderRadius: '6px',
                                padding: '0.25rem 0.45rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            <RotateCcw size={13} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500, userSelect: 'none' }}>
                            <input 
                                type="checkbox"
                                checked={isMatched}
                                onChange={(e) => handleMatchCheckboxChange(e.target.checked)}
                                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            <span>Style cover letter to match resume</span>
                        </label>

                        <DownloadPdfButton
                            filename={activeTab === 'resume' ? 'Test_Resume.pdf' : 'Test_Cover_Letter.pdf'}
                            label="Download Test PDF"
                            html={previewHtml}
                        />
                    </div>
                </div>

                <div style={{
                    background: '#525659',
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    overflowX: 'auto',
                    minHeight: '450px',
                    border: '1px solid var(--border-glass)'
                }}>
                    <div 
                        style={{
                            background: '#ffffff',
                            width: '100%',
                            minHeight: '750px',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                </div>
            </div>
        </div>
    );
}
