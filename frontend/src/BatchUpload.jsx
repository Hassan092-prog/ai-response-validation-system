import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import './App.css';

const BatchUpload = () => {
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [batchId, setBatchId] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [isPolling, setIsPolling] = useState(false);

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
      const response = await fetch('http://192.168.1.92:8001/api/evaluate/batch', {
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
          const res = await fetch(`http://192.168.1.92:8001/api/batch/${batchId}`);
          if (res.ok) {
            const data = await res.json();
            setBatchData(data);
            
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
            <div style={{ marginTop: '2rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Question Preview</th>
                    <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Final Score</th>
                  </tr>
                </thead>
                <tbody>
                  {batchData.records.map(record => (
                    <tr key={record.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BatchUpload;
