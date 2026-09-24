import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, CheckCircle2, BarChart3, Download, Eye, EyeOff } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Results from './Results';
import './App.css';

const BatchAnalyticsView = ({ batchId }) => {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  useEffect(() => {
    const fetchBatch = async () => {
      try {
        const res = await fetch(`http://192.168.1.92:8005/api/batch/${batchId}`);
        if (res.ok) {
          const data = await res.json();
          setBatchData(data);
        }
      } catch (e) {
        console.error("Error fetching batch", e);
      } finally {
        setLoading(false);
      }
    };
    fetchBatch();
  }, [batchId]);

  const batchAnalytics = useMemo(() => {
    if (!batchData || !batchData.records || batchData.progress.total === 0) return null;
    
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

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="spinner" size={24} /></div>;
  if (!batchData) return <div style={{ padding: '2rem', textAlign: 'center' }}>Batch data not found.</div>;

  return (
    <div style={{ padding: '1rem' }}>
      {/* Analytics Dashboard */}
      {batchAnalytics && (
        <div style={{ marginBottom: '3rem', padding: '2rem', background: 'var(--bg-color)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={20} color="var(--accent-color)" />
              Batch Results Analytics
            </h3>
            <button onClick={handleExportBatch} className="secondary-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', borderRadius: '6px' }}>
              <Download size={16} /> Export CSV
            </button>
          </div>
          
          <div className="stats-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Total Processed</h4>
              <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{batchData.records.length}</span>
            </div>
            <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Average Score</h4>
              <span style={{ fontSize: '2rem', fontWeight: 'bold', color: batchAnalytics.averageScore >= 80 ? 'var(--btn-bg)' : batchAnalytics.averageScore >= 50 ? '#f59e0b' : '#ef4444' }}>
                {batchAnalytics.averageScore} / 100
              </span>
            </div>
            <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Pass Rate</h4>
              <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{batchAnalytics.passRate}%</span>
            </div>
          </div>
          
          <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '2rem', display: 'grid' }}>
            <div style={{ background: 'var(--input-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Status Distribution</h4>
              <div style={{ height: '250px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={batchAnalytics.pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" isAnimationActive={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {batchAnalytics.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip itemStyle={{ color: 'var(--tooltip-text-color)' }} labelStyle={{ color: 'var(--tooltip-text-color)' }} contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div style={{ background: 'var(--input-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
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

      {/* Individual Records Table */}
      <h3 style={{ marginBottom: '1rem' }}>Individual Batch Responses</h3>
      <div style={{ overflowX: 'auto', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Question Preview</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Final Score</th>
              <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {batchData.records.map(record => (
              <React.Fragment key={record.id}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem' }}>
                    <span className={`status-dot ${record.status}`}></span>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', textTransform: 'capitalize' }}>{record.status}</span>
                  </td>
                  <td style={{ padding: '1rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {record.question}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {record.final_score !== null ? (
                      <span className={`score-badge ${record.final_score >= 80 ? 'high' : record.final_score >= 50 ? 'medium' : 'low'}`} style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                        {record.final_score}/100
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button 
                      className="secondary-btn"
                      onClick={() => setExpandedRecordId(expandedRecordId === record.id ? null : record.id)}
                      style={{ padding: '0.4rem', borderRadius: '6px' }}
                    >
                      {expandedRecordId === record.id ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </td>
                </tr>
                {expandedRecordId === record.id && (
                  <tr style={{ background: 'var(--input-bg)' }}>
                    <td colSpan="4" style={{ padding: 0 }}>
                       <div style={{ borderBottom: '1px solid var(--input-border)' }}>
                          <Results evaluationId={record.id} onBack={() => setExpandedRecordId(null)} />
                       </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BatchAnalyticsView;
