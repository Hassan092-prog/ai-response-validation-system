import React, { useState, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, BookOpen, ChevronRight, X, ExternalLink } from 'lucide-react';

/**
 * Splits text into sentence tokens while preserving punctuation and spacing.
 */
function splitIntoSentences(text) {
  if (!text) return [];
  // Split on sentence boundaries (. ! ?) followed by whitespace or end of string
  const rawSentences = text.match(/[^.!?\n]+[.!?]+(\s+|$)|[^.!?\n]+$/g);
  if (!rawSentences) return [text.trim()];
  return rawSentences.map(s => s.trim()).filter(Boolean);
}

/**
 * Computes word overlap ratio between two strings to allow robust claim matching.
 */
function computeWordOverlap(s1, s2) {
  const words1 = new Set(s1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let matches = 0;
  for (const w of words1) {
    if (words2.has(w)) matches++;
  }
  return matches / Math.min(words1.size, words2.size);
}

export default function SentenceHeatmap({
  aiResponse = '',
  sourceDocument = '',
  referenceAnswer = '',
  hallucinationScore = 5,
  flaggedClaims = []
}) {
  const [selectedClaimIdx, setSelectedClaimIdx] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'flagged'
  const [showSourceContext, setShowSourceContext] = useState(true);

  // Effective grounding context (Source document preferred, fallback to reference answer)
  const contextText = useMemo(() => {
    return sourceDocument || referenceAnswer || '';
  }, [sourceDocument, referenceAnswer]);

  // Context split into sentences for bidirectional highlighting
  const contextSentences = useMemo(() => {
    return splitIntoSentences(contextText);
  }, [contextText]);

  // AI response split into sentences and mapped to claims
  const parsedClaims = useMemo(() => {
    const sentences = splitIntoSentences(aiResponse);

    return sentences.map((sentence, idx) => {
      // Find matching flagged claim
      let matchedFlag = null;

      for (const flag of flaggedClaims) {
        if (!flag || !flag.statement) continue;
        const sLower = sentence.toLowerCase();
        const fLower = flag.statement.toLowerCase();

        // 1. Direct Substring Match
        if (sLower.includes(fLower) || fLower.includes(sLower)) {
          matchedFlag = flag;
          break;
        }

        // 2. High Word Overlap (> 55%)
        const overlap = computeWordOverlap(sentence, flag.statement);
        if (overlap >= 0.55) {
          matchedFlag = flag;
          break;
        }
      }

      if (matchedFlag) {
        const statusType = (matchedFlag.status || '').toLowerCase().includes('contradict')
          ? 'contradiction'
          : 'unsupported';

        return {
          id: idx,
          sentence,
          status: statusType,
          explanation: matchedFlag.explanation || 'Flagged by Hallucination Detector.',
          contextQuote: matchedFlag.context_quote || '',
          flagged: true
        };
      }

      // If no flag matched:
      // If overall hallucination score is 5, it is 100% verified.
      // If hallucination score is low but no specific claim was parsed, mark as cautionary.
      if (hallucinationScore <= 2 && flaggedClaims.length === 0) {
        return {
          id: idx,
          sentence,
          status: 'contradiction',
          explanation: 'Response flagged with severe hallucination penalty by validation agents.',
          contextQuote: '',
          flagged: true
        };
      } else if (hallucinationScore <= 3 && flaggedClaims.length === 0) {
        return {
          id: idx,
          sentence,
          status: 'unsupported',
          explanation: 'Unsubstantiated claim or missing grounding details.',
          contextQuote: '',
          flagged: true
        };
      }

      return {
        id: idx,
        sentence,
        status: 'supported',
        explanation: 'Factual claim logically supported by reference ground truth.',
        contextQuote: '',
        flagged: false
      };
    });
  }, [aiResponse, hallucinationScore, flaggedClaims]);

  // Summary counts
  const counts = useMemo(() => {
    let supported = 0;
    let unsupported = 0;
    let contradiction = 0;

    for (const c of parsedClaims) {
      if (c.status === 'supported') supported++;
      else if (c.status === 'unsupported') unsupported++;
      else if (c.status === 'contradiction') contradiction++;
    }

    return { total: parsedClaims.length, supported, unsupported, contradiction };
  }, [parsedClaims]);

  // Active selected claim details
  const activeClaim = selectedClaimIdx !== null ? parsedClaims[selectedClaimIdx] : null;

  // Filtered claims for rendering
  const displayedClaims = useMemo(() => {
    if (filterMode === 'flagged') {
      return parsedClaims.filter(c => c.flagged);
    }
    return parsedClaims;
  }, [parsedClaims, filterMode]);

  // Color & Badge Tokens
  const getClaimStyle = (status, isSelected) => {
    const base = {
      padding: '4px 6px',
      margin: '2px 3px',
      borderRadius: '6px',
      display: 'inline',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      borderLeftWidth: '3px',
      borderLeftStyle: 'solid',
      lineHeight: '2.1'
    };

    if (status === 'contradiction') {
      return {
        ...base,
        backgroundColor: 'rgba(239, 68, 68, 0.14)',
        borderLeftColor: '#ef4444',
        color: 'var(--text-primary)',
        boxShadow: isSelected ? '0 0 0 2px #ef4444' : 'none'
      };
    } else if (status === 'unsupported') {
      return {
        ...base,
        backgroundColor: 'rgba(245, 158, 11, 0.14)',
        borderLeftColor: '#f59e0b',
        color: 'var(--text-primary)',
        boxShadow: isSelected ? '0 0 0 2px #f59e0b' : 'none'
      };
    } else {
      return {
        ...base,
        backgroundColor: 'rgba(34, 197, 94, 0.11)',
        borderLeftColor: '#22c55e',
        color: 'var(--text-primary)',
        boxShadow: isSelected ? '0 0 0 2px #22c55e' : 'none'
      };
    }
  };

  const renderStatusBadge = (status) => {
    if (status === 'contradiction') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <XCircle size={13} /> Direct Contradiction
        </span>
      );
    } else if (status === 'unsupported') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <AlertTriangle size={13} /> Unverified Claim
        </span>
      );
    } else {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <CheckCircle2 size={13} /> Verified Grounded
        </span>
      );
    }
  };

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--input-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--input-border)' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem', borderBottom: '1px solid var(--input-border)', paddingBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
            <Sparkles size={18} color="var(--btn-bg)" /> Sentence Hallucination Heatmap
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Interactive claim verification with bidirectional grounding against source context
          </p>
        </div>

        {/* Legend / Metrics Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterMode('all')}
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              borderRadius: '20px',
              cursor: 'pointer',
              border: '1px solid var(--input-border)',
              background: filterMode === 'all' ? 'var(--text-primary)' : 'transparent',
              color: filterMode === 'all' ? 'var(--bg-color)' : 'var(--text-primary)',
              fontWeight: '600'
            }}
          >
            All Sentences ({counts.total})
          </button>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#22c55e', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.1)' }}>
            <CheckCircle2 size={12} /> {counts.supported} Supported
          </span>

          {counts.unsupported > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#f59e0b', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)' }}>
              <AlertTriangle size={12} /> {counts.unsupported} Unverified
            </span>
          )}

          {counts.contradiction > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#ef4444', fontWeight: '600', padding: '2px 8px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)' }}>
              <XCircle size={12} /> {counts.contradiction} Contradicted
            </span>
          )}

          {(counts.unsupported > 0 || counts.contradiction > 0) && (
            <button
              onClick={() => setFilterMode(filterMode === 'flagged' ? 'all' : 'flagged')}
              style={{
                padding: '4px 10px',
                fontSize: '0.8rem',
                borderRadius: '20px',
                cursor: 'pointer',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: filterMode === 'flagged' ? '#ef4444' : 'transparent',
                color: filterMode === 'flagged' ? '#ffffff' : '#ef4444',
                fontWeight: '600'
              }}
            >
              {filterMode === 'flagged' ? 'Showing Flagged Only' : 'Filter Flagged'}
            </button>
          )}
        </div>
      </div>

      {/* Main Heatmap Response Text Box */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>AI CANDIDATE RESPONSE (CLICK ANY SENTENCE TO INSPECT & GROUND)</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Tip: Click sentence to cross-reference context</span>
        </div>

        <div
          style={{
            padding: '1.2rem',
            background: 'var(--bg-color)',
            border: '1px solid var(--input-border)',
            borderRadius: '8px',
            fontSize: '1rem',
            lineHeight: '2.1',
            color: 'var(--text-primary)'
          }}
        >
          {displayedClaims.map((claim) => {
            const isSelected = selectedClaimIdx === claim.id;
            return (
              <span
                key={claim.id}
                onClick={() => setSelectedClaimIdx(isSelected ? null : claim.id)}
                style={getClaimStyle(claim.status, isSelected)}
                title="Click to ground against source document"
              >
                {claim.sentence}{' '}
              </span>
            );
          })}
        </div>
      </div>

      {/* Inline Claim Inspector Drawer (Shown when a claim is clicked) */}
      {activeClaim && (
        <div
          style={{
            padding: '1.2rem',
            marginBottom: '1.5rem',
            background: 'var(--bg-color)',
            border: `1px solid ${activeClaim.status === 'contradiction' ? '#ef4444' : activeClaim.status === 'unsupported' ? '#f59e0b' : '#22c55e'}`,
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            position: 'relative'
          }}
        >
          <button
            onClick={() => setSelectedClaimIdx(null)}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            aria-label="Close Claim Inspector"
          >
            <X size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Claim #{activeClaim.id + 1}
            </span>
            {renderStatusBadge(activeClaim.status)}
          </div>

          <p style={{ margin: '0 0 0.8rem 0', fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', lineHeight: '1.5' }}>
            "{activeClaim.sentence}"
          </p>

          <div style={{ padding: '0.8rem 1rem', background: 'var(--input-bg)', borderRadius: '6px', border: '1px solid var(--input-border)', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Agent Reasoning: </strong>
            {activeClaim.explanation}
          </div>

          {activeClaim.contextQuote && (
            <div style={{ marginTop: '0.8rem', padding: '0.8rem 1rem', background: 'rgba(182, 242, 54, 0.08)', borderRadius: '6px', border: '1px solid rgba(182, 242, 54, 0.25)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--btn-bg)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Relevant Context Excerpt
              </span>
              <em>"{activeClaim.contextQuote}"</em>
            </div>
          )}
        </div>
      )}

      {/* Bidirectional Grounding Context Panel */}
      {contextText && (
        <div style={{ marginTop: '1rem' }}>
          <div
            onClick={() => setShowSourceContext(!showSourceContext)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.6rem 0.8rem',
              background: 'transparent',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={15} color="var(--btn-bg)" />
              GROUNDING SOURCE DOCUMENT {sourceDocument ? '(USER SOURCE)' : '(REFERENCE)'}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {showSourceContext ? 'Collapse Context' : 'Expand Context'}
            </span>
          </div>

          {showSourceContext && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '1.2rem',
                background: 'var(--bg-color)',
                border: '1px solid var(--input-border)',
                borderRadius: '8px',
                fontSize: '0.95rem',
                lineHeight: '1.8',
                color: 'var(--text-secondary)',
                maxHeight: '260px',
                overflowY: 'auto'
              }}
            >
              {contextSentences.map((ctxSent, cIdx) => {
                // Check if this context sentence matches the active claim's quote or text
                let isGroundingMatch = false;
                if (activeClaim) {
                  if (activeClaim.contextQuote && ctxSent.toLowerCase().includes(activeClaim.contextQuote.toLowerCase())) {
                    isGroundingMatch = true;
                  } else {
                    const overlap = computeWordOverlap(ctxSent, activeClaim.sentence);
                    if (overlap >= 0.4) isGroundingMatch = true;
                  }
                }

                return (
                  <span
                    key={cIdx}
                    style={{
                      padding: '2px 4px',
                      borderRadius: '4px',
                      backgroundColor: isGroundingMatch
                        ? activeClaim?.status === 'contradiction'
                          ? 'rgba(239, 68, 68, 0.22)'
                          : 'rgba(182, 242, 54, 0.22)'
                        : 'transparent',
                      color: isGroundingMatch ? 'var(--text-primary)' : 'inherit',
                      fontWeight: isGroundingMatch ? '600' : 'normal',
                      borderBottom: isGroundingMatch ? '2px solid var(--btn-bg)' : 'none',
                      transition: 'all 0.25s ease'
                    }}
                  >
                    {ctxSent}{' '}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
