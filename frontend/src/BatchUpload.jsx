import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileSpreadsheet, Loader2, CheckCircle2, BarChart3, Download, RefreshCw, Eye, EyeOff, Search, AlertTriangle, XCircle, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Results from './Results';
import './App.css';
import { API_BASE } from './config';

const BatchUpload = () => {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [batchId, setBatchId] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const lastCompletedCount = useRef(0);
  const [toastState, setToastState] = useState({ show: false, message: '' });

  // Phase 3: Smart Risk Filtering & In-Row Claim Inspector State
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'hallucinations' | 'failed' | 'passed'
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  const batchAnalytics = useMemo(() => {
    if (!batchData || !batchData.records || isPolling || batchData.progress.completed !== batchData.progress.total || batchData.progress.total === 0) {
      return null;
    }

    const records = batchData.records;
    let totalScore = 0;
    let passCount = 0;
    let improveCount = 0;
    let failCount = 0;
    
    let totalAccuracy = 0;
    let totalRelevance = 0;
    let totalHallucination = 0;

    records.forEach(r => {
      const score = r.final_score || 0;
      totalScore += score;
      
      if (score < 50 || r.score_hallucination <= 2 || r.score_accuracy <= 1) failCount++;
      else if (score < 80) improveCount++;
      else passCount++;

      totalAccuracy += r.score_accuracy || 0;
      totalRelevance += r.score_relevance || 0;
      totalHallucination += r.score_hallucination || 0;
    });

    const count = records.length;
    return {
      averageScore: Math.round(totalScore / count),
      passRate: Math.round((passCount / count) * 100),
      pieData: [
        { name: 'Pass', value: passCount, color: 'var(--btn-bg)' },
        { name: 'Improve', value: improveCount, color: '#f59e0b' },
        { name: 'Fail', value: failCount, color: '#ef4444' }
      ].filter(d => d.value > 0),
      barData: [
        { name: 'Accuracy', score: Math.round((totalAccuracy / count) * 20) },
        { name: 'Relevance', score: Math.round((totalRelevance / count) * 20) },
        { name: 'Hallucination', score: Math.round((totalHallucination / count) * 20) }
      ]
    };
  }, [batchData, isPolling]);

  // Phase 3: Filtered Records Calculation
  const filteredRecords = useMemo(() => {
    if (!batchData?.records) return [];
    return batchData.records.filter(r => {
      if (filterMode === 'hallucinations') {
        const hasHallucination = (r.score_hallucination !== null && r.score_hallucination <= 2) || 
          r.result?.breakdown?.hallucination?.flagged_claims?.length > 0;
        if (!hasHallucination) return false;
      } else if (filterMode === 'failed') {
        const isFailed = r.status === 'failed' || (r.final_score !== null && r.final_score < 50) || 
          (r.score_hallucination !== null && r.score_hallucination <= 2) || (r.score_accuracy !== null && r.score_accuracy <= 1);
        if (!isFailed) return false;
      } else if (filterMode === 'passed') {
        const isPassed = r.final_score !== null && r.final_score >= 80 && (r.score_hallucination === null || r.score_hallucination > 2);
        if (!isPassed) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const qMatch = (r.question || '').toLowerCase().includes(term);
        const aMatch = (r.ai_response || '').toLowerCase().includes(term);
        if (!qMatch && !aMatch) return false;
      }

      return true;
    });
  }, [batchData, filterMode, searchTerm]);

  // Phase 3: Dynamic Filter Counts
  const filterCounts = useMemo(() => {
    if (!batchData?.records) return { all: 0, hallucinations: 0, failed: 0, passed: 0 };
    let hallucinations = 0;
    let failed = 0;
    let passed = 0;
    for (const r of batchData.records) {
      if ((r.score_hallucination !== null && r.score_hallucination <= 2) || r.result?.breakdown?.hallucination?.flagged_claims?.length > 0) {
        hallucinations++;
      }
      if (r.status === 'failed' || (r.final_score !== null && r.final_score < 50) || (r.score_hallucination !== null && r.score_hallucination <= 2) || (r.score_accuracy !== null && r.score_accuracy <= 1)) {
        failed++;
      } else if (r.final_score !== null && r.final_score >= 80) {
        passed++;
      }
    }
    return { all: batchData.records.length, hallucinations, failed, passed };
  }, [batchData]);

  const handleExportBatch = () => {
    if (!batchData || !batchData.records) return;
    
    const headers = ["ID", "Question", "AI Response", "Status", "Final Score", "Accuracy", "Relevance", "Hallucination"];
    const rows = batchData.records.map(r => [
      r.id,
      `"${(r.question || '').replace(/"/g, '""')}"`,
      `"${(r.ai_response || '').replace(/"/g, '""')}"`,
      r.status,
      r.final_score,
      r.score_accuracy,
      r.score_relevance,
      r.score_hallucination
    ].join(','));
    
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + "\n" + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `batch_results_${batchId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setFile(null);
    setUploadStatus('');
    setBatchId(null);
    setBatchData(null);
    setIsPolling(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const submitBatch = async () => {
    if (!file) return;
    setUploadStatus('uploading');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/api/evaluate/batch`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      
      if (response.ok) {
        setBatchId(data.batch_id);
        setUploadStatus('success');
        setIsPolling(true);
      } else {
        setUploadStatus('error');
        alert(data.detail || 'Failed to upload batch');
      }
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
    }
  };

  useEffect(() => {
    let intervalId;
    if (isPolling && batchId) {
      const fetchStatus = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/batch/${batchId}`);
          if (res.ok) {
            const data = await res.json();
            setBatchData(data);
            
            if (data.progress.completed > lastCompletedCount.current) {
              const completedRecords = data.records.filter(r => r.status === 'completed');
              const latestRecord = completedRecords[completedRecords.length - 1];
              if (latestRecord) {
                setToastState({ show: true, message: `Row ${data.progress.completed}/${data.progress.total} evaluated — Score: ${latestRecord.final_score}` });
                setTimeout(() => setToastState(prev => ({ ...prev, show: false })), 3000);
              }
              lastCompletedCount.current = data.progress.completed;
            }
            
            if (data.progress.completed === data.progress.total) {
              setIsPolling(false);
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      };
      
      fetchStatus();
      intervalId = setInterval(fetchStatus, 5000);
    }
    return () => clearInterval(intervalId);
  }, [isPolling, batchId]);

  return (
    <div className="tab-container">
      <div className="header-text" style={{ marginBottom: '2rem' }}>
        <h1>Batch Processing</h1>
        <p>Upload a CSV file to evaluate multiple responses at once.</p>
      </div>

      {!batchId ? (
        <div 
          className="dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            border: '2px dashed var(--input-border)',
            borderRadius: '12px',
            padding: '4rem 2rem',
            textAlign: 'center',
            background: 'var(--input-bg)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <input 
            type="file" 
            id="batch-upload" 
            accept=".csv" 
            style={{ display: 'none' }} 
            onChange={handleFileSelect}
          />
          <label htmlFor="batch-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <FileSpreadsheet size={48} color="var(--accent-color)" />
            <h3 style={{ margin: 0 }}>{file ? file.name : "Drag & Drop your CSV here"}</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              {file ? "File selected. Click Upload to begin." : "or click to browse from your computer"}
            </p>
          </label>

          {file && (
            <button 
              className="submit-btn" 
              onClick={submitBatch}
              disabled={uploadStatus === 'uploading'}
              style={{ marginTop: '2rem', minWidth: '200px' }}
            >
              {uploadStatus === 'uploading' ? 'Uploading...' : 'Start Batch Evaluation'}
            </button>
          )}
        </div>
      ) : (
        <div className="batch-status-container">
          <div style={{ background: 'var(--input-bg)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isPolling ? <Loader2 className="spinner" size={20} /> : <CheckCircle2 size={20} color="#22c55e" />}
                Batch Progress
              </h3>
              <span className="badge" style={{ fontSize: '1rem' }}>
                {batchData?.progress?.percent || 0}%
              </span>
            </div>
            
            <div style={{ width: '100%', height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
              <div style={{ 
                height: '100%', 
                width: `${batchData?.progress?.percent || 0}%`, 
                background: 'var(--accent-color)',
                transition: 'width 0.5s ease'
              }}></div>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Completed {batchData?.progress?.completed || 0} out of {batchData?.progress?.total || 0} rows.
              {isPolling && " (Processing at ~3 rows per minute due to API Limits)"}
            </p>
          </div>

          {batchData && batchData.records && (
            <div style={{ marginTop: '2rem' }}>
              {/* Smart Quick-Filter Bar & Search */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => setFilterMode('all')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.85rem',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      border: '1px solid var(--input-border)',
                      background: filterMode === 'all' ? 'var(--text-primary)' : 'var(--input-bg)',
                      color: filterMode === 'all' ? 'var(--bg-color)' : 'var(--text-primary)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    All Records ({filterCounts.all})
                  </button>

                  <button
                    onClick={() => setFilterMode('hallucinations')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.85rem',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      background: filterMode === 'hallucinations' ? '#ef4444' : 'rgba(239, 68, 68, 0.1)',
                      color: filterMode === 'hallucinations' ? '#ffffff' : '#ef4444',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <AlertTriangle size={14} /> Hallucinations Only ({filterCounts.hallucinations})
                  </button>

                  <button
                    onClick={() => setFilterMode('failed')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.85rem',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      background: filterMode === 'failed' ? '#f59e0b' : 'rgba(245, 158, 11, 0.1)',
                      color: filterMode === 'failed' ? '#000000' : '#f59e0b',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <XCircle size={14} /> Failed Only ({filterCounts.failed})
                  </button>

                  <button
                    onClick={() => setFilterMode('passed')}
                    style={{
                      padding: '5px 12px',
                      fontSize: '0.85rem',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      background: filterMode === 'passed' ? 'var(--btn-bg)' : 'rgba(34, 197, 94, 0.1)',
                      color: filterMode === 'passed' ? 'var(--btn-text)' : '#22c55e',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <CheckCircle2 size={14} /> Passed Only ({filterCounts.passed})
                  </button>
                </div>

                {/* Keyword Search */}
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search batch queries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 12px 6px 32px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '20px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Filterable Table */}
              <div style={{ overflowX: 'auto', background: 'var(--input-bg)', borderRadius: '10px', border: '1px solid var(--input-border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--input-border)', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '1rem' }}>Status</th>
                      <th style={{ padding: '1rem' }}>Question Preview</th>
                      <th style={{ padding: '1rem' }}>Score</th>
                      <th style={{ padding: '1rem' }}>Hallucination Risk</th>
                      <th style={{ padding: '1rem', textAlign: 'right' }}>Claim Inspector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No records match the active filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map(record => {
                        const isExpanded = expandedRecordId === record.id;
                        const hasHallucination = (record.score_hallucination !== null && record.score_hallucination <= 2) || 
                          record.result?.breakdown?.hallucination?.flagged_claims?.length > 0;

                        return (
                          <React.Fragment key={record.id}>
                            <tr style={{ borderBottom: '1px solid var(--input-border)', background: isExpanded ? 'var(--sidebar-hover)' : 'transparent' }}>
                              <td style={{ padding: '1rem' }}>
                                <span className={`status-dot ${record.status}`}></span>
                                <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', textTransform: 'capitalize' }}>{record.status}</span>
                              </td>
                              <td style={{ padding: '1rem', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {record.question}
                              </td>
                              <td style={{ padding: '1rem' }}>
                                {record.final_score !== null ? (
                                  <span className={`score-badge ${record.final_score >= 80 ? 'high' : record.final_score >= 50 ? 'medium' : 'low'}`} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                                    {record.final_score}/100
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ padding: '1rem' }}>
                                {hasHallucination ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>
                                    <AlertTriangle size={12} /> HIGH RISK
                                  </span>
                                ) : record.score_hallucination !== null ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', fontSize: '0.75rem', fontWeight: 700 }}>
                                    <CheckCircle2 size={12} /> GROUNDED
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ padding: '1rem', textAlign: 'right' }}>
                                <button
                                  className="secondary-btn"
                                  onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                                  title={isExpanded ? "Collapse Claims" : "Inspect Sentence Heatmap & Claims"}
                                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                                  {isExpanded ? 'Close' : 'Inspect'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr style={{ background: 'var(--bg-color)' }}>
                                <td colSpan="5" style={{ padding: '0' }}>
                                  <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--input-border)' }}>
                                    <Results evaluationId={record.id} onBack={() => setExpandedRecordId(null)} />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {batchAnalytics && (
            <div style={{ marginTop: '3rem', padding: '2rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={20} color="var(--accent-color)" />
                  Batch Results Analytics
                </h3>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={handleExportBatch} className="secondary-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', borderRadius: '6px' }}>
                    <Download size={16} /> Export CSV
                  </button>
                  <button onClick={handleReset} className="secondary-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', borderRadius: '6px', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
                    <RefreshCw size={16} /> New Batch
                  </button>
                </div>
              </div>
              
              <div className="stats-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Total Processed</h4>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{batchData.records.length}</span>
                </div>
                <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Average Score</h4>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold', color: batchAnalytics.averageScore >= 80 ? 'var(--btn-bg)' : batchAnalytics.averageScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                    {batchAnalytics.averageScore} / 100
                  </span>
                </div>
                <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Pass Rate</h4>
                  <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{batchAnalytics.passRate}%</span>
                </div>
              </div>
              
              <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', display: 'grid' }}>
                <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Status Distribution</h4>
                  <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={batchAnalytics.pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          isAnimationActive={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {batchAnalytics.pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip itemStyle={{ color: 'var(--tooltip-text-color)' }} labelStyle={{ color: 'var(--tooltip-text-color)' }} contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div style={{ background: 'var(--bg-color)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Average Metrics (Scaled)</h4>
                  <div style={{ height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={batchAnalytics.barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                        <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip itemStyle={{ color: 'var(--tooltip-text-color)' }} labelStyle={{ color: 'var(--tooltip-text-color)' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                        <Bar dataKey="score" fill="var(--chart-bar-fill)" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {createPortal(
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          right: toastState.show ? '2rem' : '-20rem',
          opacity: toastState.show ? 1 : 0,
          transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          background: 'var(--btn-bg)',
          color: 'var(--btn-text)',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontWeight: '500',
          zIndex: 100000,
        }}>
          {toastState.message}
        </div>,
        document.body
      )}
    </div>
  );
};

export default BatchUpload;
