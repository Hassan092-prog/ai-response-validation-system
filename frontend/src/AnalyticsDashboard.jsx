import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Activity, Target, Filter, Inbox } from 'lucide-react';
import { API_BASE } from './config';

const HeatmapCalendar = ({ data }) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // Available years based on data, defaulting to current year if no data
  const years = useMemo(() => {
    if (!data || data.length === 0) return [currentYear];
    const uniqueYears = new Set(data.map(d => parseInt(d.date.split('-')[0])));
    uniqueYears.add(currentYear);
    return Array.from(uniqueYears).sort((a, b) => b - a);
  }, [data, currentYear]);

  // Generate grid for selected year
  const gridData = useMemo(() => {
    const start = new Date(selectedYear, 0, 1);
    const end = new Date(selectedYear, 11, 31);
    
    // Pad start so Sunday is top row
    const startDayOfWeek = start.getDay();
    const days = [];
    
    // Pre-fill empty slots
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ type: 'empty' });
    }
    
    const today = new Date();
    
    // Fill days
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const isFuture = d > today;
      const record = data.find(x => x.date === dateStr);
      days.push({
        type: 'day',
        date: dateStr,
        count: record ? record.count : 0,
        isFuture,
        month: d.getMonth()
      });
    }
    return days;
  }, [selectedYear, data]);

  // Calculate month labels positions
  const monthLabels = useMemo(() => {
    const labels = [];
    let currentMonth = -1;
    gridData.forEach((cell, idx) => {
      if (cell.type === 'day' && cell.month !== currentMonth) {
        currentMonth = cell.month;
        const colIndex = Math.floor(idx / 7);
        // Ensure month labels don't overlap too much
        if (labels.length === 0 || colIndex - labels[labels.length - 1].colIndex > 3) {
          labels.push({ colIndex, label: new Date(selectedYear, currentMonth).toLocaleString('default', { month: 'short' }) });
        }
      }
    });
    return labels;
  }, [gridData, selectedYear]);

  const totalContributions = data.filter(d => d.date.startsWith(selectedYear.toString())).reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="chart-card" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'row', gap: '1.5rem', flexWrap: 'nowrap' }}>
      <div style={{ flex: 1, minWidth: '0', overflowX: 'auto' }}>
        <h3 style={{ marginBottom: '1.5rem' }}>{totalContributions} evaluations in {selectedYear}</h3>
        
        <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: '4px', fontSize: '0.75rem', lineHeight: '12px', color: 'var(--text-secondary)', textAlign: 'right', paddingRight: '4px', marginTop: '20px' }}>
              <span style={{ visibility: 'hidden' }}>S</span>
              <span>Mon</span>
              <span style={{ visibility: 'hidden' }}>T</span>
              <span>Wed</span>
              <span style={{ visibility: 'hidden' }}>T</span>
              <span>Fri</span>
              <span style={{ visibility: 'hidden' }}>S</span>
            </div>
            
            <div style={{ position: 'relative' }}>
              {/* Month Labels */}
              <div style={{ height: '20px', position: 'relative', width: '100%' }}>
                {monthLabels.map((m, i) => (
                  <span key={i} style={{ position: 'absolute', left: `${m.colIndex * 16}px`, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {m.label}
                  </span>
                ))}
              </div>
              
              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gridAutoFlow: 'column', gap: '4px' }}>
                {gridData.map((d, i) => {
                   if (d.type === 'empty') {
                     return <div key={i} style={{ width: '12px', height: '12px', background: 'transparent' }} />;
                   }
                   
                   let level = 0;
                   if (!d.isFuture) {
                       if (d.count > 0) level = 1;
                       if (d.count > 2) level = 2;
                       if (d.count > 5) level = 3;
                       if (d.count > 10) level = 4;
                   }
                   
                   return (
                     <div 
                       key={i} 
                       title={!d.isFuture ? `${d.count} evaluations on ${d.date}` : `No evaluations on ${d.date}`} 
                       style={{ 
                         width: '12px', 
                         height: '12px', 
                         borderRadius: '2px', 
                         background: `var(--heatmap-${level})`,
                         outline: '1px solid rgba(27,31,35,0.06)',
                         outlineOffset: '-1px'
                       }}
                     />
                   );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Year Selector */}
      <div style={{ width: '120px', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '3.5rem' }}>
        {years.map(year => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            style={{
              padding: '0.6rem',
              borderRadius: '6px',
              border: 'none',
              background: year === selectedYear ? 'var(--chart-line)' : 'transparent',
              color: year === selectedYear ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'center',
              fontWeight: year === selectedYear ? '600' : '400',
              transition: 'all 0.2s'
            }}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
};

const AnalyticsDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [batchId, setBatchId] = useState('');

  const [weights, setWeights] = useState({
    accuracy: 40,
    relevance: 20,
    completeness: 20,
    hallucination: 20
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const dynamicAverageScore = useMemo(() => {
    if (!data || !data.radar_data) return 0;
    
    const metrics = {};
    data.radar_data.forEach(item => {
      metrics[item.metric.toLowerCase()] = item.score;
    });
    
    let score = 0;
    score += (metrics.accuracy || 0) * (weights.accuracy / 100);
    score += (metrics.relevance || 0) * (weights.relevance / 100);
    score += (metrics.completeness || 0) * (weights.completeness / 100);
    score -= (metrics.hallucination || 0) * (weights.hallucination / 100);
    
    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  }, [data, weights]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/api/evaluations/analytics?`;
      if (minScore) url += `min_score=${minScore}&`;
      if (maxScore) url += `max_score=${maxScore}&`;
      if (batchId) url += `batch_id=${batchId}&`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeights = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/config/weights`);
      if (response.ok) {
        const json = await response.json();
        setWeights(json);
      }
    } catch (err) {
      console.error("Failed to load global weights", err);
    }
  };

  const saveWeights = async () => {
    setIsSaving(true);
    setSaveStatus('');
    try {
      const response = await fetch(`${API_BASE}/api/config/weights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(weights)
      });
      if (!response.ok) throw new Error('Failed to save');
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setSaveStatus('Error saving');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchWeights();
  }, []);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchAnalytics();
  };

  if (loading) {
    return (
      <div className="results-container loading">
        <div className="spinner"></div>
        <h2>Loading Analytics...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results-container">
        <h2>Failed to load analytics</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (data.total_evaluations === 0) {
    return (
      <div className="tab-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 2rem', color: 'var(--text-secondary)', textAlign: 'center', background: 'var(--input-bg)', borderRadius: '12px', border: '1px dashed var(--input-border)', height: '400px' }}>
        <Inbox size={48} style={{ opacity: 0.5, marginBottom: '1rem', color: 'var(--text-secondary)' }} />
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Data Available</h3>
        <p style={{ maxWidth: '300px', lineHeight: 1.5 }}>Complete some evaluations to generate analytics.</p>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="header-text" style={{ marginBottom: '1rem' }}>
        <h1>Analytics Overview</h1>
        <p>Monitor your AI grading performance over time</p>
      </div>

      <form onSubmit={handleFilterSubmit} style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', padding: '1rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Min Score (0-100)</label>
          <input type="number" min="0" max="100" value={minScore} onChange={e => setMinScore(e.target.value)} className="form-input" placeholder="e.g. 50" style={{ padding: '0.5rem', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Max Score (0-100)</label>
          <input type="number" min="0" max="100" value={maxScore} onChange={e => setMaxScore(e.target.value)} className="form-input" placeholder="e.g. 80" style={{ padding: '0.5rem', width: '100%' }} />
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Batch ID Filter</label>
          <input type="text" value={batchId} onChange={e => setBatchId(e.target.value)} className="form-input" placeholder="Enter Batch ID" style={{ padding: '0.5rem', width: '100%' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', visibility: 'hidden' }}>Submit</label>
          <button type="submit" className="submit-btn" style={{ padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', height: '39px', width: 'auto', minWidth: 'auto', fontSize: '0.9rem' }}>
            <Filter size={16} /> Apply Filters
          </button>
        </div>
      </form>

      <div className="stats-grid">
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <Activity size={120} color="var(--border-color)" style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.15 }} />
          <h3 style={{ position: 'relative', zIndex: 2 }}>Total Evaluations</h3>
          <span className="stat-value" style={{ position: 'relative', zIndex: 2 }}>{data.total_evaluations}</span>
        </div>
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <Target size={120} color="var(--border-color)" style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.15 }} />
          <h3 style={{ position: 'relative', zIndex: 2 }}>Average Final Score</h3>
          <span className={`stat-value ${dynamicAverageScore >= 80 ? 'text-high' : dynamicAverageScore >= 50 ? 'text-medium' : 'text-low'}`} style={{ position: 'relative', zIndex: 2 }}>
            {dynamicAverageScore} / 100
          </span>
        </div>
      </div>
      
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Scores Over Time</h3>
          <div className="chart-wrapper" style={{ height: '300px', marginTop: '1.5rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.time_series} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="score" stroke="var(--chart-line)" strokeWidth={3} dot={{ r: 4, fill: 'var(--chart-line)' }} activeDot={{ r: 8, fill: 'var(--chart-line)' }} />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" vertical={false} opacity={0.2} />
                <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} tickMargin={10} />
                <YAxis stroke="var(--text-secondary)" domain={[0, 100]} fontSize={12} tickMargin={10} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="chart-card">
          <h3>Average Metric Breakdown</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Scaled to 100%</p>
          <div className="chart-wrapper" style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data.radar_data}>
                <PolarGrid stroke="var(--border-color)" />
                <PolarAngleAxis dataKey="metric" stroke="var(--text-secondary)" fontSize={13} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Score" dataKey="score" stroke="var(--chart-radar-stroke)" fill="var(--chart-radar-fill)" />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      
      <div className="chart-card" style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3>Configurable Scoring Weights</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Adjust the evaluation weights in real-time. Save to apply globally to all future evaluations.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {saveStatus && <span style={{ fontSize: '0.85rem', color: 'var(--btn-bg)' }}>{saveStatus}</span>}
            <button 
              onClick={saveWeights} 
              disabled={isSaving} 
              className="submit-btn" 
              style={{ padding: '0.5rem 1.5rem', height: 'auto', minWidth: 'auto', fontSize: '0.9rem' }}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
          {Object.entries(weights).map(([key, value]) => {
            const maxAvailable = 100 - Object.values(weights).reduce((a, b) => a + b, 0);
            const currentMax = value + maxAvailable;
            
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{ textTransform: 'capitalize', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{key} {key === 'hallucination' && '(Penalty)'}</label>
                  <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{value}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setWeights({...weights, [key]: Math.max(0, value - 1)})}
                    className="secondary-btn" 
                    style={{ padding: '0 8px', height: '24px', minWidth: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    -
                  </button>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={value} 
                    onChange={(e) => {
                      let val = parseInt(e.target.value);
                      if (val > currentMax) val = currentMax;
                      setWeights({ ...weights, [key]: val });
                    }}
                    style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--btn-bg)' }}
                  />
                  <button 
                    type="button" 
                    onClick={() => setWeights({...weights, [key]: Math.min(currentMax, value + 1)})}
                    className="secondary-btn" 
                    style={{ padding: '0 8px', height: '24px', minWidth: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {data.heatmap_data && <HeatmapCalendar data={data.heatmap_data} />}
    </div>
  );
};

export default AnalyticsDashboard;
