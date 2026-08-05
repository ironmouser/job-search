'use client';

import { useState, useRef } from 'react';
import { Copy, Loader2, MessageSquare, Send, ThumbsUp, RefreshCw, Minimize2, Maximize2, ChevronDown, RotateCcw, Pencil, X } from 'lucide-react';
import DownloadTextButton from './DownloadTextButton';
import UpgradePrompt from './UpgradePrompt';


export default function ApplicationQA({ jobId, planTier = 'FREE', trialEndsAt, initialQaUsed = 0, totalResumesGenerated, totalApplied }: { jobId: string; planTier?: string; trialEndsAt?: Date | string | null; initialQaUsed?: number; totalResumesGenerated?: number; totalApplied?: number; }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [previousAnswer, setPreviousAnswer] = useState('');
  const [tone, setTone] = useState('Confident and strategic');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedPref, setSavedPref] = useState(false);
  const [qaUsed, setQaUsed] = useState(initialQaUsed);

  const isInTrial = trialEndsAt && new Date(trialEndsAt) > new Date();
  const isPro = planTier === 'PRO' || isInTrial;
  const limit = 10; // Pro limit per job
  const regensLeft = limit - qaUsed;


  // Custom prompt & length limit state
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const customPromptInputRef = useRef<HTMLInputElement>(null);
  const MAX_QUESTION_CHARS = 300;
  const MAX_CUSTOM_CHARS = 200;

  const handleGenerate = async (instruction?: string) => {
    if (!question.trim() || regensLeft <= 0) return;
    
    setShowCustomPrompt(false);
    setCustomPrompt('');
    
    setIsLoading(true);
    setError('');
    if (answer) setPreviousAnswer(answer); // Save current answer as previous before generating a new one
    if (!instruction) setAnswer(''); // Only clear if it's a completely new generation, keep it if we are modifying
    setSavedPref(false);
    
    try {
      const res = await fetch(`/api/job/${jobId}/qa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question, tone, instruction }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate answer');
      }
      
      setAnswer(data.answer);
      if (data.qaGenerationsUsed !== undefined) {
        setQaUsed(data.qaGenerationsUsed);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreference = async () => {
    if (!question || !answer) return;
    
    setIsSavingPref(true);
    try {
      // Fetch current settings first
      const getRes = await fetch('/api/settings');
      const settings = await getRes.json();
      
      const existingExamples = settings.qaExamples || [];
      const updatedExamples = [...existingExamples, { question, answer }];
      
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qaExamples: updatedExamples })
      });
      
      setSavedPref(true);
    } catch (err) {
      console.error("Failed to save preference:", err);
    } finally {
      setIsSavingPref(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Free tier: show upgrade prompt instead of the Q&A form
  if (!isPro) {
    return (
      <div style={{ marginTop: '1rem' }}>
        <UpgradePrompt
          variant="inline"
          feature="qa"
          stats={{ resumesTailored: totalResumesGenerated, jobsApplied: totalApplied }}
        />
      </div>
    );
  }

  return (
    <details className="glass-card" style={{ cursor: 'pointer', margin: 0 }}>
      <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', listStyle: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0, fontWeight: 600, fontSize: '1.17em' }}>
          <MessageSquare size={20} /> Application Q&A Generator
        </div>
        <ChevronDown className="accordion-chevron" size={20} style={{ color: 'var(--text-secondary)' }} />
      </summary>
      <div style={{ cursor: 'auto', paddingTop: '1.5rem' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          <strong>Feature Overview:</strong> Use this tool to answer tricky job application questions (e.g., "Why this company?") or to prepare for your upcoming interviews. Simply paste any question below, and your agent will generate a strategic, highly tailored response that perfectly aligns your background with the specific needs of this role.
        </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION_CHARS))}
            placeholder="e.g. Why do you want to work at this company?"
            maxLength={MAX_QUESTION_CHARS}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '1rem',
              paddingBottom: '1.8rem',
              background: 'var(--bg-color)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
          <span style={{ position: 'absolute', bottom: '0.5rem', right: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {question.length}/{MAX_QUESTION_CHARS}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <select 
            value={tone} 
            onChange={(e) => setTone(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--bg-color)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem'
            }}
          >
            <option value="Confident and strategic">Confident and Strategic (Default)</option>
            <option value="Professional and direct">Professional and Direct</option>
            <option value="Creative and bold">Creative and Bold</option>
            <option value="Highly technical and detailed">Highly Technical</option>
          </select>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Generations left: {regensLeft} / {limit}
            </span>
            <button 
              onClick={() => handleGenerate()}
              disabled={isLoading || !question.trim() || regensLeft <= 0}
              className="btn-primary"
              title={regensLeft <= 0 && !isPro ? "Upgrade to Pro for more generations" : ""}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isLoading && !answer ? (
                <><Loader2 size={16} className="animate-spin" /> Generating...</>
              ) : (
                <><Send size={16} /> Generate Response</>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)', borderRadius: '8px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {answer && (
          <div style={{ 
            marginTop: '1rem', 
            background: 'var(--bg-color)', 
            padding: '1.5rem', 
            borderRadius: '8px', 
            border: '1px solid var(--border-glass)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Generated Answer
              </h4>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <DownloadTextButton textToDownload={answer} filename={`QA_Answer_${jobId.slice(0,8)}.txt`} />
                <button
                  onClick={copyToClipboard}
                  className="btn-outline"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {copied ? (
                    <span style={{ color: 'var(--success)' }}>Copied!</span>
                  ) : (
                    <><Copy size={14} /> Copy</>
                  )}
                </button>
              </div>
            </div>
            
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {answer}
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              paddingTop: '1rem', 
              borderTop: '1px solid var(--border-glass)',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => {
                  const current = answer;
                  setAnswer(previousAnswer);
                  setPreviousAnswer(current);
                }}
                disabled={!previousAnswer || isLoading}
                className="btn-outline"
                title={!previousAnswer ? 'No previous version available' : 'Revert to previous answer'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  opacity: (!previousAnswer || isLoading) ? 0.5 : 1,
                  cursor: (!previousAnswer || isLoading) ? 'not-allowed' : 'pointer'
                }}
              >
                <RotateCcw size={14} /> Previous Version
              </button>
              <button onClick={() => handleGenerate('different')} disabled={isLoading || regensLeft <= 0} title={regensLeft <= 0 && !isPro ? "Upgrade to Pro for more" : ""} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Different
              </button>
              <button onClick={() => handleGenerate('shorter')} disabled={isLoading || regensLeft <= 0} title={regensLeft <= 0 && !isPro ? "Upgrade to Pro for more" : ""} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Minimize2 size={14} />} Shorter
              </button>
              <button onClick={() => handleGenerate('longer')} disabled={isLoading || regensLeft <= 0} title={regensLeft <= 0 && !isPro ? "Upgrade to Pro for more" : ""} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Maximize2 size={14} />} Expand
              </button>
              <button
                onClick={() => {
                  setShowCustomPrompt(v => !v);
                  if (!showCustomPrompt) {
                    setTimeout(() => customPromptInputRef.current?.focus(), 50);
                  }
                }}
                disabled={isLoading || regensLeft <= 0}
                className="btn-outline"
                title={showCustomPrompt ? 'Close custom prompt' : 'Enter a custom instruction'}
                style={{
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: showCustomPrompt ? 'var(--accent-primary)' : undefined,
                  color: showCustomPrompt ? '#fff' : undefined,
                  borderColor: showCustomPrompt ? 'var(--accent-primary)' : undefined,
                }}
              >
                <Pencil size={14} /> Custom
              </button>
              
              <div style={{ flexGrow: 1 }} />
              
              <button 
                onClick={savePreference} 
                disabled={isSavingPref || savedPref} 
                style={{ 
                  padding: '0.4rem 0.8rem', 
                  fontSize: '0.8rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.4rem',
                  background: savedPref ? 'rgba(102, 252, 241, 0.1)' : 'transparent',
                  color: savedPref ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: `1px solid ${savedPref ? 'rgba(102, 252, 241, 0.3)' : 'var(--border-glass)'}`,
                  borderRadius: '4px',
                  cursor: (isSavingPref || savedPref) ? 'default' : 'pointer'
                }}
              >
                {isSavingPref ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                {savedPref ? 'Saved to Preferences' : 'Save as Preference'}
              </button>
            </div>

            {/* Custom prompt inline row */}
            {showCustomPrompt && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.75rem',
                padding: '0.75rem',
                background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                flexWrap: 'wrap',
              }}>
                <input
                  ref={customPromptInputRef}
                  type="text"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value.slice(0, MAX_CUSTOM_CHARS))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customPrompt.trim() && !isLoading && regensLeft > 0) {
                      handleGenerate(customPrompt.trim());
                    }
                    if (e.key === 'Escape') { setShowCustomPrompt(false); setCustomPrompt(''); }
                  }}
                  placeholder='e.g. "Focus on my leadership & project management metrics"'
                  maxLength={MAX_CUSTOM_CHARS}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    minWidth: '180px',
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.82rem',
                    background: 'var(--input-bg, rgba(0,0,0,0.2))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {customPrompt.length}/{MAX_CUSTOM_CHARS}
                </span>
                <button
                  onClick={() => { if (customPrompt.trim()) handleGenerate(customPrompt.trim()); }}
                  disabled={isLoading || !customPrompt.trim() || regensLeft <= 0}
                  className="btn-primary"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Generate
                </button>
                <button
                  onClick={() => { setShowCustomPrompt(false); setCustomPrompt(''); }}
                  className="btn-outline"
                  style={{ padding: '0.4rem 0.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}
                  title="Close"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </details>
  );
}
