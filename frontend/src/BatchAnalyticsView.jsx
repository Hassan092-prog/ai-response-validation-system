import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, CheckCircle2, BarChart3, Download, Eye, EyeOff } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Results from './Results';
import './App.css';
import { API_BASE } from './config';

const BatchAnalyticsView = ({ batchId }) => {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  useEffect(() => {
    const fetchBatch = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/batch/${batchId}`);
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

  const handleExportPDF = () => {
    if (!batchData || !batchData.records) return;
    const doc = new jsPDF();
    
    // Page 1: Title & Summary
    doc.setFillColor(30, 30, 30); 
    doc.rect(0, 0, 210, 30, 'F');
    doc.setFontSize(20);
    doc.setTextColor(200, 255, 100);
    doc.setFont(undefined, 'bold');
    doc.text(`AI Response Batch Evaluation Report`, 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.text(`Batch ID: ${batchId}`, 14, 40);
    doc.text(`Total Responses Evaluated: ${batchData.records.length}`, 14, 48);
    doc.text(`Average Batch Score: ${batchAnalytics.averageScore} / 100`, 14, 56);
    doc.text(`Pass Rate: ${batchAnalytics.passRate}%`, 14, 64);
    
    const tableColumn = ["Question", "AI Response", "Status", "Score", "Scores (Acc/Rel/Hal)"];
    const tableRows = [];

    batchData.records.forEach(r => {
      const q = r.question || '';
      const a = r.ai_response || '';
      const rowData = [
        q.length > 80 ? q.substring(0, 80) + '...' : q,
        a.length > 80 ? a.substring(0, 80) + '...' : a,
        r.status,
        r.final_score ? r.final_score.toString() : '0',
        `${r.score_accuracy || 0} / ${r.score_relevance || 0} / ${r.score_hallucination || 0}`
      ];
      tableRows.push(rowData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 75,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255] }
    });

    // Detailed Records from Page 2 onwards
    batchData.records.forEach((r, index) => {
      doc.addPage();
      
      // Header
      doc.setFillColor(30, 30, 30); 
      doc.rect(0, 0, 210, 30, 'F');
      doc.setFontSize(20);
      doc.setTextColor(200, 255, 100);
      doc.setFont(undefined, 'bold');
      doc.text(`Evaluation Validation Report - Record #${index + 1}`, 14, 20);
      
      // Metadata Table
      autoTable(doc, {
        startY: 40,
        head: [["Record ID", "Batch ID", "Final Score", "Status"]],
        body: [[
          String(r.id),
          String(batchId).substring(0, 8) + '...',
          `${r.final_score || 0} / 100`,
          String(r.status).toUpperCase()
        ]],
        theme: 'grid',
        headStyles: { fillColor: [50, 50, 50], textColor: [255, 255, 255] },
        bodyStyles: { textColor: String(r.status).toUpperCase() === 'PASS' ? [34, 197, 94] : String(r.status).toUpperCase() === 'FAIL' ? [220, 38, 38] : [0, 0, 0], fontStyle: 'bold' }
      });
      
      // Breakdown Table
      const bd = r.result?.breakdown || {};
      const breakdownCols = ["Metric", "Score", "Agent Reasoning"];
      const breakdownRows = [
        ["Accuracy", `${r.score_accuracy || 0}/5`, bd.accuracy?.reasoning || "N/A"],
        ["Relevance", `${r.score_relevance || 0}/5`, bd.relevance?.reasoning || "N/A"],
        ["Completeness", `${r.score_completeness || 0}/5`, bd.completeness?.reasoning || "N/A"],
        ["Hallucination", `${r.score_hallucination || 0}/5`, bd.hallucination?.reasoning || "N/A"]
      ];
      
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [breakdownCols],
        body: breakdownRows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 30, fontStyle: 'bold' },
          1: { cellWidth: 20 },
          2: { cellWidth: 130 }
        }
      });
      
      let yPos = doc.lastAutoTable.finalY + 15;
      
      const addTextSection = (title, content) => {
        if (yPos > 270) { doc.addPage(); yPos = 20; }
        
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'bold');
        doc.text(title, 14, yPos);
        yPos += 7;
        
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.setFont(undefined, 'normal');
        const lines = doc.splitTextToSize(content || "N/A", 180);
        
        if (yPos + (lines.length * 5) > 280) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.text(lines, 14, yPos);
        yPos += (lines.length * 5) + 10;
      };
      
      addTextSection("User Question:", r.question);
      addTextSection("AI Response:", r.ai_response);
      if (r.reference_answer) addTextSection("Reference Answer:", r.reference_answer);
      if (r.source_document) addTextSection("Source Context Provided:", "Yes");
      
      const consolidated_reasoning = r.result?.consolidated_reasoning || r.result?.major_issues || "N/A";
      addTextSection("Final Verdict Reasoning:", consolidated_reasoning);
    });
    
    // Add page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, 196, 290, { align: 'right' });
    }
    
    doc.save(`batch_evaluation_report_${batchId}.pdf`);
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
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleExportPDF} className="secondary-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', borderRadius: '6px' }}>
                <Download size={16} /> Export PDF Report
              </button>
              <button onClick={handleExportBatch} className="secondary-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem', borderRadius: '6px' }}>
                <Download size={16} /> Export CSV
              </button>
            </div>
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
