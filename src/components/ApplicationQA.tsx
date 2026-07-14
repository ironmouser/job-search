'use client';

import { useState } from 'react';
import { Copy, Loader2, MessageSquare, Send, ThumbsUp, RefreshCw, Minimize2, Maximize2 } from 'lucide-react';

export default function ApplicationQA({ jobId }: { jobId: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [tone, setTone] = useState('Confident and strategic');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedPref, setSavedPref] = useState(false);

  const handleGenerate = async (instruction?: string) => {
    if (!question.trim()) return;
    
    setIsLoading(true);
    setError('');
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

  return (
    <details className="glass-card" style={{ cursor: 'pointer', margin: 0 }}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-primary)', margin: 0, fontWeight: 600, fontSize: '1.17em' }}>
        <MessageSquare size={20} /> Application Q&A Generator
      </summary>
      <div style={{ cursor: 'auto', paddingTop: '1.5rem' }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Paste a question from the job application below, and the AI will generate a tailored response based on your profile and the job description.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Why do you want to work at this company?"
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '1rem',
            background: 'var(--bg-color)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />

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
          
          <button 
            onClick={() => handleGenerate()}
            disabled={isLoading || !question.trim()}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {isLoading && !answer ? (
              <><Loader2 size={16} className="animate-spin" /> Generating...</>
            ) : (
              <><Send size={16} /> Generate Response</>
            )}
          </button>
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
              <button onClick={() => handleGenerate('different')} disabled={isLoading} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Different
              </button>
              <button onClick={() => handleGenerate('shorter')} disabled={isLoading} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Minimize2 size={14} />} Shorter
              </button>
              <button onClick={() => handleGenerate('longer')} disabled={isLoading} className="btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Maximize2 size={14} />} Expand
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
          </div>
        )}
      </div>
      </div>
    </details>
  );
}
