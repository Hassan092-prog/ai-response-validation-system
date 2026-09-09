import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Activity, Target } from 'lucide-react';

const AnalyticsDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch('http://192.168.1.92:8001/api/evaluations/analytics');
        if (!response.ok) throw new Error('Failed to fetch analytics');
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalytics();
  }, []);

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
      <div className="results-container">
        <h2>No Data Available</h2>
        <p>Complete some evaluations to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="header-text" style={{ marginBottom: '2rem' }}>
        <h1>Analytics Overview</h1>
        <p>Monitor your AI grading performance over time</p>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <Activity size={120} color="var(--border-color)" style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.15 }} />
          <h3 style={{ position: 'relative', zIndex: 2 }}>Total Evaluations</h3>
          <span className="stat-value" style={{ position: 'relative', zIndex: 2 }}>{data.total_evaluations}</span>
        </div>
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <Target size={120} color="var(--border-color)" style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.15 }} />
          <h3 style={{ position: 'relative', zIndex: 2 }}>Average Final Score</h3>
          <span className={`stat-value ${data.average_score >= 80 ? 'text-high' : data.average_score >= 50 ? 'text-medium' : 'text-low'}`} style={{ position: 'relative', zIndex: 2 }}>
            {data.average_score} / 100
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
    </div>
  );
};

export default AnalyticsDashboard;
