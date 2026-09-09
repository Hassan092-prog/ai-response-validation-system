import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { diffWords } from 'diff';
import { Copy, Check, Download, ChevronDown, ChevronRight, FileSpreadsheet, FileJson } from 'lucide-react';

const Results = ({ evaluationId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRag, setShowRag] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.results-export-dropdown')) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let intervalId;

    const fetchResult = async () => {
      try {
        const response = await fetch(`http://192.168.1.92:8001/api/results/${evaluationId}`);
        if (!response.ok) throw new Error("Result not found");
        const json = await response.json();
        
        if (json.status === "completed" || json.status === "failed") {
          setData(json);
          setLoading(false);
          clearInterval(intervalId);
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
        clearInterval(intervalId);
      }
    };

    fetchResult(); // initial fetch
    intervalId = setInterval(fetchResult, 3000); // poll every 3s

    return () => clearInterval(intervalId);
  }, [evaluationId]);

  if (loading) {
    return (
      <div className="results-container loading">
        <div className="spinner"></div>
        <h2>AI Agents are evaluating the response...</h2>
        <p>Checking relevance, accuracy, completeness, and hallucination.</p>
      </div>
    );
  }

  if (error || data?.status === "failed") {
    return (
      <div className="results-container">
        <h2>Evaluation Failed</h2>
        <p>{error || data?.result?.error}</p>
        <button onClick={onBack} className="submit-btn secondary-btn" style={{marginTop: '2rem'}}>Go Back</button>
      </div>
    );
  }

  const { final_score, breakdown, rag_context } = data.result;

  const handleCopy = () => {
    const md = `# AI Validation Report
**Score:** ${final_score}/100

## 1. Relevance (${breakdown.relevance.score}/5)
${breakdown.relevance.reasoning}

## 2. Accuracy (${breakdown.accuracy.score}/5)
${breakdown.accuracy.reasoning}

## 3. Completeness (${breakdown.completeness.score}/5)
${breakdown.completeness.reasoning}

## 4. Hallucination Penalty (${breakdown.hallucination.score}/5)
${breakdown.hallucination.reasoning}
`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(md).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => console.error("Copy failed", err));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = md;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-${data.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    const escapeCSV = (str) => `"${String(str).replace(/"/g, '""')}"`;
    const header = ["ID", "Status", "Final Score", "Question", "AI Response", "Reference Answer", "Source Context"];
    const row = [
      data.id, 
      data.status, 
      final_score, 
      data.question, 
      data.ai_response, 
      data.reference_answer || "", 
      data.source_document || ""
    ];
    
    const csvContent = header.join(",") + "\r\n" + row.map(escapeCSV).join(",");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-${data.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const renderDiff = () => {
    if (!data.reference_answer) return null;
    
    const diff = diffWords(data.reference_answer, data.ai_response);
    
    return (
      <div className="diff-viewer" style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--input-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--input-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Textual Diff</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Comparing AI Response to Reference Answer</span>
        </div>
        
        <div className="diff-content" style={{ fontSize: '0.95rem', lineHeight: '1.6', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {diff.map((part, index) => {
            const isAdded = part.added;
            const isRemoved = part.removed;
            let style = { padding: '0 2px', borderRadius: '3px' };
            
            if (isAdded) {
              style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
              style.color = '#22c55e';
            } else if (isRemoved) {
              style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              style.color = '#ef4444';
              style.textDecoration = 'line-through';
            } else {
              style.color = 'var(--text-primary)';
            }
            
            return (
              <span key={index} style={style}>{part.value}</span>
            );
          })}
        </div>
        
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', fontSize: '0.8rem', fontWeight: '500' }}>
          <span style={{ color: '#ef4444' }}>■ Missing from AI Response</span>
          <span style={{ color: '#22c55e' }}>■ Added by AI Response</span>
        </div>
      </div>
    );
  };

  return (
    <div className="results-container">
      <div className="results-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Evaluation Complete</h2>
          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem' }}>
            <button onClick={handleCopy} className="secondary-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} 
              {copied ? 'Copied!' : 'Copy as Markdown'}
            </button>
            <div className="results-export-dropdown" style={{ position: 'relative' }}>
              <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="secondary-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={14} /> Export <ChevronDown size={14} />
              </button>
              {isExportMenuOpen && (
                <div className="dropdown-menu" style={{
                  position: 'absolute', left: 0, top: '100%', marginTop: '4px',
                  background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                  borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10,
                  minWidth: '180px', overflow: 'hidden'
                }}>
                  <button 
                    onClick={handleDownloadCSV} 
                    style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--input-border)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                  >
                    <FileSpreadsheet size={14} /> Export as CSV
                  </button>
                  <button 
                    onClick={() => { handleDownloadJSON(); setIsExportMenuOpen(false); }} 
                    style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                  >
                    <FileJson size={14} /> Export as JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={`score-badge ${final_score >= 80 ? 'high' : final_score >= 50 ? 'medium' : 'low'}`}>
          {final_score} / 100
        </div>
      </div>

      <div className="breakdown-grid">
        <div className="breakdown-card">
          <div className="card-header">
            <h3>Relevance</h3>
            <span className="score">{breakdown.relevance.score}/5</span>
          </div>
          <div className="markdown-body">
            <ReactMarkdown>{breakdown.relevance.reasoning}</ReactMarkdown>
          </div>
        </div>

        <div className="breakdown-card">
          <div className="card-header">
            <h3>Accuracy</h3>
            <span className="score">{breakdown.accuracy.score}/5</span>
          </div>
          <div className="markdown-body">
            <ReactMarkdown>{breakdown.accuracy.reasoning}</ReactMarkdown>
          </div>
        </div>

        <div className="breakdown-card">
          <div className="card-header">
            <h3>Completeness</h3>
            <span className="score">{breakdown.completeness.score}/5</span>
          </div>
          <div className="markdown-body">
            <ReactMarkdown>{breakdown.completeness.reasoning}</ReactMarkdown>
          </div>
        </div>

        <div className="breakdown-card hallucination">
          <div className="card-header">
            <h3>Hallucination Penalty</h3>
            <span className="score">{breakdown.hallucination.score}/5</span>
          </div>
          <div className="markdown-body">
            <ReactMarkdown>{breakdown.hallucination.reasoning}</ReactMarkdown>
          </div>
        </div>
      </div>
      
      {/* Visual Diff Tool */}
      {data.reference_answer && (
        <div style={{ marginTop: '2rem' }}>
          <button 
            onClick={() => setShowDiff(!showDiff)}
            className="rag-toggle-btn"
            style={{
              background: 'transparent', border: '1px solid var(--input-border)', color: 'var(--text-primary)',
              padding: '0.8rem 1.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500', width: '100%'
            }}
          >
            {showDiff ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Visual Diff: Reference vs AI Response
          </button>
          
          {showDiff && renderDiff()}
        </div>
      )}

      {/* RAG Context */}
      {rag_context && (
        <div className="rag-context-section" style={{ marginTop: '1rem' }}>
          <button 
            className="rag-toggle-btn"
            onClick={() => setShowRag(!showRag)}
            style={{
              background: 'transparent', border: '1px solid var(--input-border)', color: 'var(--text-primary)',
              padding: '0.8rem 1.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '500', width: '100%'
            }}
          >
            {showRag ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            View Knowledge Base Sources Used
          </button>
          
          {showRag && (
            <div 
              className="rag-context-content"
              style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}
            >
              {rag_context}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Results;
