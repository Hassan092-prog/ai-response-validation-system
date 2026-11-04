import React, { useState, useEffect } from 'react';
import { 
  Award, TrendingUp, TrendingDown, Minus, 
  CheckCircle2, ShieldAlert, ShieldCheck, RefreshCw, Trash2, 
  GitCompare, Loader2
} from 'lucide-react';
import { API_BASE } from './config';

const Benchmarks = () => {
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Comparison State
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);
  const [comparisonBatchId, setComparisonBatchId] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [compareError, setCompareError] = useState(null);

  // Deletion State
  const [deletingId, setDeletingId] = useState(null);

  const fetchBenchmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/benchmarks`);
      if (!res.ok) {
        throw new Error("Failed to load golden benchmarks.");
      }
      const data = await res.json();
      setBenchmarks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBenchmarks();
  }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete benchmark "${name}"?`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/benchmarks/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error("Failed to delete benchmark.");
      }
      if (selectedBenchmark?.id === id) {
        setSelectedBenchmark(null);
        setComparisonResult(null);
      }
      await fetchBenchmarks();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRunComparison = async (e) => {
    e.preventDefault();
    if (!selectedBenchmark || !comparisonBatchId.trim()) return;

    setIsComparing(true);
    setCompareError(null);
    setComparisonResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/benchmarks/${selectedBenchmark.id}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparison_batch_id: comparisonBatchId.trim() })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Failed to compare batch against benchmark.");
      }

      const data = await res.json();
      setComparisonResult(data);
    } catch (err) {
      setCompareError(err.message);
    } finally {
      setIsComparing(false);
    }
  };

  if (loading) {
    return (
      <div className="tab-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '1rem' }}>
        <Loader2 className="spinner" size={32} />
        <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Loading Golden Benchmarks...</h3>
      </div>
    );
  }

  return (
    <div className="tab-container">
      {/* Page Header */}
      <div className="header-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1>Regression Benchmarking & CI</h1>
          <p>Snapshot golden evaluation baselines, track quality trends, and detect regressions automatically</p>
        </div>
        <button 
          onClick={fetchBenchmarks} 
          className="secondary-btn" 
          style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      {/* Benchmarks Catalog */}
      {benchmarks.length === 0 ? (
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          background: 'var(--input-bg)',
          borderRadius: '12px',
          border: '1px solid var(--input-border)',
          marginBottom: '2rem'
        }}>
          <Award size={48} color="var(--btn-bg)" style={{ margin: '0 auto 1rem auto', opacity: 0.8 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No Golden Benchmarks Saved Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 1.5rem auto', lineHeight: 1.6, fontSize: '0.9rem' }}>
            Run a batch evaluation in <strong>Batch Process</strong> or browse <strong>History</strong>, then click <em>"Save as Benchmark"</em> to establish your golden reference baseline for automated regression gating.
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Award size={18} color="var(--btn-bg)" /> Saved Golden Benchmarks ({benchmarks.length})
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.2rem' }}>
            {benchmarks.map((bm) => {
              const isSelected = selectedBenchmark?.id === bm.id;
              return (
                <div 
                  key={bm.id} 
                  style={{
                    background: 'var(--input-bg)',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid var(--btn-bg)' : '1px solid var(--input-border)',
                    padding: '1.2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isSelected ? '0 4px 12px rgba(182, 242, 54, 0.1)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {bm.name}
                      </h4>
                      <button 
                        onClick={() => handleDelete(bm.id, bm.name)}
                        disabled={deletingId === bm.id}
                        title="Delete Benchmark"
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      >
                        {deletingId === bm.id ? <Loader2 size={14} className="spinner" /> : <Trash2 size={14} />}
                      </button>
                    </div>

                    {bm.description && (
                      <p style={{ margin: '0 0 0.8rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {bm.description}
                      </p>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginTop: '0.8rem', padding: '0.8rem', background: 'var(--sidebar-hover)', borderRadius: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Avg Score</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: bm.avg_final_score >= 70 ? 'var(--btn-bg)' : '#f59e0b' }}>
                          {bm.avg_final_score} / 100
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Pass Rate</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: bm.pass_rate >= 70 ? 'var(--btn-bg)' : '#ef4444' }}>
                          {bm.pass_rate}%
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Dataset Size</span>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                          {bm.total_records} rows
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Hallucination</span>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                          {bm.avg_hallucination} / 5.0
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--input-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      Batch: {bm.batch_id ? (bm.batch_id.length > 8 ? `${bm.batch_id.substring(0, 8)}...` : bm.batch_id) : 'N/A'}
                    </span>
                    <button 
                      onClick={() => {
                        setSelectedBenchmark(bm);
                        setComparisonResult(null);
                        setCompareError(null);
                      }}
                      className={isSelected ? "submit-btn" : "secondary-btn"}
                      style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', width: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <GitCompare size={14} /> {isSelected ? "Selected" : "Compare"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Regression Comparison Playground */}
      {selectedBenchmark && (
        <div style={{
          background: 'var(--input-bg)',
          borderRadius: '12px',
          border: '1px solid var(--input-border)',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitCompare size={18} color="var(--btn-bg)" /> Run Regression Analysis vs. "{selectedBenchmark.name}"
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.2rem 0' }}>
            Provide a candidate batch ID to verify whether model, prompt, or knowledge base adjustments caused a regression.
          </p>

          <form onSubmit={handleRunComparison} style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <div style={{ flex: '1', minWidth: '280px' }}>
              <input 
                type="text"
                placeholder="Enter Candidate Batch ID (e.g. 3a7f82b1-4c12-...)"
                value={comparisonBatchId}
                onChange={(e) => setComparisonBatchId(e.target.value)}
                className="form-input"
                style={{ width: '100%', height: '42px', boxSizing: 'border-box' }}
              />
            </div>
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={isComparing || !comparisonBatchId.trim()}
              style={{ width: 'auto', minWidth: '170px', height: '42px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isComparing ? <Loader2 size={16} className="spinner" /> : <TrendingUp size={16} />}
              {isComparing ? "Analyzing..." : "Evaluate Regression"}
            </button>
          </form>

          {compareError && (
            <div style={{ padding: '0.8rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {compareError}
            </div>
          )}

          {/* Regression Delta Report */}
          {comparisonResult && (
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--input-border)', paddingTop: '1.5rem' }}>
              {/* Overall Verdict Banner */}
              <div style={{
                padding: '1.2rem 1.5rem',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '1.5rem',
                background: comparisonResult.overall_verdict === 'REGRESSION_DETECTED' 
                  ? 'rgba(239, 68, 68, 0.12)' 
                  : comparisonResult.overall_verdict === 'IMPROVED' 
                    ? 'rgba(34, 197, 94, 0.12)' 
                    : 'rgba(59, 130, 246, 0.12)',
                border: `1px solid ${
                  comparisonResult.overall_verdict === 'REGRESSION_DETECTED'
                    ? 'rgba(239, 68, 68, 0.3)'
                    : comparisonResult.overall_verdict === 'IMPROVED'
                      ? 'rgba(34, 197, 94, 0.3)'
                      : 'rgba(59, 130, 246, 0.3)'
                }`
              }}>
                {comparisonResult.overall_verdict === 'REGRESSION_DETECTED' ? (
                  <ShieldAlert size={32} color="#ef4444" />
                ) : comparisonResult.overall_verdict === 'IMPROVED' ? (
                  <CheckCircle2 size={32} color="#22c55e" />
                ) : (
                  <ShieldCheck size={32} color="#3b82f6" />
                )}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: comparisonResult.overall_verdict === 'REGRESSION_DETECTED'
                        ? '#ef4444'
                        : comparisonResult.overall_verdict === 'IMPROVED'
                          ? '#22c55e'
                          : '#3b82f6'
                    }}>
                      VERDICT: {comparisonResult.overall_verdict.replace('_', ' ')}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {comparisonResult.verdict_reason}
                  </p>
                </div>
              </div>

              {/* Per-Dimension Comparison Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--input-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.8rem 1rem' }}>Evaluation Dimension</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center' }}>Golden Baseline</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center' }}>Candidate Batch</th>
                      <th style={{ padding: '0.8rem', textAlign: 'center' }}>Delta</th>
                      <th style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonResult.deltas && Object.entries(comparisonResult.deltas).map(([key, delta]) => {
                      const labelMap = {
                        avg_final_score: "Average Final Score",
                        pass_rate_percent: "Pass Rate",
                        avg_accuracy: "Accuracy Score",
                        avg_relevance: "Relevance Score",
                        avg_completeness: "Completeness Score",
                        avg_hallucination: "Hallucination Resistance"
                      };
                      const isPositive = delta.trend === 'improved';
                      const isNegative = delta.trend === 'degraded';

                      return (
                        <tr key={key} style={{ borderBottom: '1px solid var(--input-border)' }}>
                          <td style={{ padding: '0.8rem 1rem', fontWeight: 600 }}>
                            {labelMap[key] || key}
                          </td>
                          <td style={{ padding: '0.8rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {delta.baseline}{key === 'pass_rate_percent' ? '%' : ''}
                          </td>
                          <td style={{ padding: '0.8rem', textAlign: 'center', fontWeight: 600 }}>
                            {delta.current}{key === 'pass_rate_percent' ? '%' : ''}
                          </td>
                          <td style={{
                            padding: '0.8rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            color: isPositive ? '#22c55e' : isNegative ? '#ef4444' : 'var(--text-secondary)'
                          }}>
                            {delta.delta}
                          </td>
                          <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background: isPositive 
                                ? 'rgba(34, 197, 94, 0.12)' 
                                : isNegative 
                                  ? 'rgba(239, 68, 68, 0.12)' 
                                  : 'rgba(156, 163, 175, 0.12)',
                              color: isPositive ? '#22c55e' : isNegative ? '#ef4444' : 'var(--text-secondary)'
                            }}>
                              {isPositive ? <TrendingUp size={12} /> : isNegative ? <TrendingDown size={12} /> : <Minus size={12} />}
                              {delta.trend}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Benchmarks;
