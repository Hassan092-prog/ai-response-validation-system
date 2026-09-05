import React, { useEffect, useState } from 'react';

const Results = ({ evaluationId, onBack }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const { final_score, breakdown } = data.result;

  return (
    <div className="results-container">
      <div className="results-header">
        <h2>Evaluation Complete</h2>
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
          <p>{breakdown.relevance.reasoning}</p>
        </div>

        <div className="breakdown-card">
          <div className="card-header">
            <h3>Accuracy</h3>
            <span className="score">{breakdown.accuracy.score}/5</span>
          </div>
          <p>{breakdown.accuracy.reasoning}</p>
        </div>

        <div className="breakdown-card">
          <div className="card-header">
            <h3>Completeness</h3>
            <span className="score">{breakdown.completeness.score}/5</span>
          </div>
          <p>{breakdown.completeness.reasoning}</p>
        </div>

        <div className="breakdown-card hallucination">
          <div className="card-header">
            <h3>Hallucination Penalty</h3>
            <span className="score">{breakdown.hallucination.score}/5</span>
          </div>
          <p>{breakdown.hallucination.reasoning}</p>
        </div>
      </div>
    </div>
  );
};

export default Results;
