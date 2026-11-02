import React, { useState, useEffect } from 'react';
import { 
  Database, Search, Trash2, UploadCloud, FileText, 
  CheckCircle2, AlertTriangle, RefreshCw, Loader2, Layers, X
} from 'lucide-react';
import { API_BASE } from './config';

const KnowledgeBase = () => {
  const [status, setStatus] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Ingestion state
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Search playground state
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Deletion state
  const [deletingId, setDeletingId] = useState(null);

  const fetchStatusAndDocs = async () => {
    setLoading(true);
    try {
      const statusRes = await fetch(`${API_BASE}/api/kb/status`);
      if (statusRes.status === 503) {
        const errJson = await statusRes.json();
        setStatus({ available: false, reason: errJson.reason || "ChromaDB is unavailable on this tier." });
        setLoading(false);
        return;
      }
      if (!statusRes.ok) throw new Error("Failed to load Knowledge Base status.");
      const statusData = await statusRes.json();
      setStatus(statusData);

      if (statusData.available) {
        const docsRes = await fetch(`${API_BASE}/api/kb/documents`);
        if (docsRes.ok) {
          const docsData = await docsRes.json();
          setDocuments(docsData.documents || []);
        }
      }
    } catch (err) {
      setStatus({ available: false, reason: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatusAndDocs();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadMessage(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const fn = file.name.toLowerCase();
      if (fn.endsWith('.pdf') || fn.endsWith('.docx') || fn.endsWith('.txt') || fn.endsWith('.md')) {
        setUploadFile(file);
        setUploadMessage(null);
      } else {
        setUploadMessage({ type: 'error', text: 'Unsupported format. Please upload PDF, DOCX, TXT, or MD.' });
      }
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setIsUploading(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch(`${API_BASE}/api/kb/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to upload and ingest document.");
      }

      const resData = await res.json();
      setUploadMessage({ 
        type: 'success', 
        text: `Successfully ingested "${resData.filename}" (${resData.chunks_added} chunks embedded).` 
      });
      setUploadFile(null);
      await fetchStatusAndDocs();
    } catch (err) {
      setUploadMessage({ type: 'error', text: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId, filename) => {
    if (!window.confirm(`Are you sure you want to remove "${filename}" from the Knowledge Base? All associated embeddings will be deleted.`)) {
      return;
    }
    setDeletingId(docId);
    try {
      const res = await fetch(`${API_BASE}/api/kb/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete document.");
      }
      await fetchStatusAndDocs();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kb/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, top_k: parseInt(topK) }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Semantic search failed.");
      }
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="tab-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '1rem' }}>
        <Loader2 className="spinner" size={32} />
        <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Connecting to ChromaDB Vector Store...</h3>
      </div>
    );
  }

  // Graceful offline cloud view
  if (status && !status.available) {
    return (
      <div className="tab-container">
        <div className="header-text" style={{ marginBottom: '1.5rem' }}>
          <h1>Knowledge Base Management</h1>
          <p>Vector database and domain context ingestion</p>
        </div>

        <div style={{
          padding: '2.5rem',
          background: 'var(--input-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
          maxWidth: '650px',
          margin: '2rem auto'
        }}>
          <AlertTriangle size={48} color="#f59e0b" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.3rem', marginBottom: '0.8rem' }}>Vector Store Unavailable</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {status.reason || "ChromaDB vector store is running in lightweight cloud tier mode."}
          </p>
          <div style={{
            padding: '1rem',
            background: 'rgba(245, 158, 11, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            fontSize: '0.85rem',
            color: 'var(--text-primary)',
            textAlign: 'left'
          }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>💡 What this means:</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.5 }}>
              <li>Evaluations continue working seamlessly using user-provided reference answers or uploaded source context.</li>
              <li>To enable local vector search and ingestion, run locally with ChromaDB and SentenceTransformers installed.</li>
            </ul>
          </div>
          <button 
            onClick={fetchStatusAndDocs} 
            className="secondary-btn" 
            style={{ marginTop: '1.5rem', padding: '0.5rem 1.2rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-container kb-management-view">
      {/* Page Header */}
      <div className="header-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1>Knowledge Base Management</h1>
          <p>Manage domain documents, inspect vector embeddings, and test semantic retrieval</p>
        </div>
        <button 
          onClick={fetchStatusAndDocs} 
          className="secondary-btn" 
          title="Refresh stats and document catalog"
          style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h4 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.85rem' }}>Vector Store Status</h4>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 8px', borderRadius: '12px' }}>
              <CheckCircle2 size={12} /> ONLINE
            </span>
          </div>
          <span style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>ChromaDB</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Collection: <strong>{status.collection_name || 'knowledge_base'}</strong>
          </div>
        </div>

        <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
          <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Indexed Documents</h4>
          <span style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{status.total_documents || documents.length}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Active knowledge sources
          </div>
        </div>

        <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
          <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Total Vector Chunks</h4>
          <span style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--btn-bg)' }}>{status.total_chunks}</span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Model: <strong>{status.embedding_model || 'all-MiniLM-L6-v2'}</strong>
          </div>
        </div>
      </div>

      {/* Document Ingestion Card */}
      <div style={{
        background: 'var(--input-bg)',
        borderRadius: '12px',
        border: '1px solid var(--input-border)',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UploadCloud size={18} color="var(--btn-bg)" /> Ingest New Domain Document
        </h3>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: isDragging ? '2px dashed var(--btn-bg)' : '1.5px dashed var(--input-border)',
            borderRadius: '10px',
            padding: '2rem',
            textAlign: 'center',
            background: isDragging ? 'rgba(182, 242, 54, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onClick={() => document.getElementById('kb-file-input')?.click()}
        >
          <input 
            type="file" 
            id="kb-file-input" 
            accept=".pdf,.docx,.txt,.md" 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />
          <UploadCloud size={36} color="var(--text-secondary)" style={{ margin: '0 auto 0.8rem auto', display: 'block', opacity: 0.7 }} />
          <p style={{ margin: '0 0 0.4rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>
            {uploadFile ? uploadFile.name : "Drag & drop PDF, DOCX, TXT, or MD here"}
          </p>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {uploadFile ? `${(uploadFile.size / 1024).toFixed(1)} KB selected` : "or click to browse your file system"}
          </span>
        </div>

        {uploadFile && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '0.8rem 1rem', background: 'var(--sidebar-hover)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="var(--btn-bg)" />
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{uploadFile.name}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setUploadFile(null)} 
                className="secondary-btn" 
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                disabled={isUploading}
              >
                Cancel
              </button>
              <button 
                onClick={handleUpload} 
                className="submit-btn" 
                style={{ padding: '0.4rem 1.2rem', fontSize: '0.85rem', width: 'auto', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="spinner" size={14} /> Ingesting & Embedding...
                  </>
                ) : (
                  <>
                    <Layers size={14} /> Chunk & Ingest to ChromaDB
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {uploadMessage && (
          <div style={{
            marginTop: '1rem',
            padding: '0.8rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: uploadMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: uploadMessage.type === 'success' ? '#22c55e' : '#ef4444',
            border: `1px solid ${uploadMessage.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
          }}>
            {uploadMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {uploadMessage.text}
          </div>
        )}
      </div>

      {/* Document Catalog Table */}
      <div style={{
        background: 'var(--input-bg)',
        borderRadius: '12px',
        border: '1px solid var(--input-border)',
        overflow: 'hidden',
        marginBottom: '2rem'
      }}>
        <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--input-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="var(--btn-bg)" /> Ingested Domain Documents ({documents.length})
          </h3>
        </div>

        {documents.length === 0 ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <FileText size={40} style={{ opacity: 0.4, margin: '0 auto 1rem auto' }} />
            <h4 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>No documents in vector store</h4>
            <p style={{ maxWidth: '400px', margin: '0 auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Upload your first domain PDF, DOCX, or TXT file above to build your private retrieval knowledge base.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--input-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '1rem 1.5rem', width: '35%' }}>Document Name / Source</th>
                  <th style={{ padding: '1rem', width: '15%', textAlign: 'center' }}>Vector Chunks</th>
                  <th style={{ padding: '1rem', width: '22%' }}>Date Added</th>
                  <th style={{ padding: '1rem', width: '20%' }}>Sample Preview</th>
                  <th style={{ padding: '1rem 1.5rem', width: '8%', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.doc_id} style={{ borderBottom: '1px solid var(--input-border)', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="var(--text-secondary)" />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{doc.filename}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                        ID: {doc.doc_id}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'var(--sidebar-hover)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--btn-bg)' }}>
                        {doc.chunk_count} chunks
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {doc.uploaded_at || "Pre-seeded Dataset"}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.sample_preview || "No preview"}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(doc.doc_id, doc.filename)}
                        disabled={deletingId === doc.doc_id}
                        title="Delete document and remove all chunks from ChromaDB"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        {deletingId === doc.doc_id ? <Loader2 size={15} className="spinner" /> : <Trash2 size={15} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Semantic Search Playground */}
      <div style={{
        background: 'var(--input-bg)',
        borderRadius: '12px',
        border: '1px solid var(--input-border)',
        padding: '1.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.3rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={18} color="var(--btn-bg)" /> Semantic Search Playground
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Test how ChromaDB queries your embedded knowledge base using cosine similarity
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.8rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '260px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter search query (e.g. 'What are the rules of photosynthesis?')..."
              className="form-input"
              style={{ width: '100%', height: '42px', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ width: '110px' }}>
            <select
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              className="form-input"
              style={{ width: '100%', height: '42px', boxSizing: 'border-box', cursor: 'pointer' }}
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
            </select>
          </div>
          <button
            type="submit"
            className="submit-btn"
            disabled={isSearching || !searchQuery.trim()}
            style={{ width: 'auto', minWidth: '130px', height: '42px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isSearching ? <Loader2 size={15} className="spinner" /> : <Search size={15} />}
            {isSearching ? "Searching..." : "Search KB"}
          </button>
        </form>

        {searchError && (
          <div style={{ padding: '0.8rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            {searchError}
          </div>
        )}

        {searchResults && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--input-border)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                Found {searchResults.count} matching chunks for "{searchResults.query}"
              </span>
              <button 
                onClick={() => setSearchResults(null)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={13} /> Clear Results
              </button>
            </div>

            {searchResults.results.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>
                No relevant chunks found in the database.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {searchResults.results.map((res, i) => (
                  <div 
                    key={res.chunk_id || i}
                    style={{
                      padding: '1rem 1.2rem',
                      background: 'var(--sidebar-hover)',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text-primary)' }}>
                          Rank #{i + 1}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Source: <strong>{res.metadata?.filename || res.metadata?.dataset || "Document"}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Distance: {res.distance}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: res.similarity_score >= 70 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: res.similarity_score >= 70 ? '#22c55e' : '#f59e0b',
                          border: `1px solid ${res.similarity_score >= 70 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}>
                          {res.similarity_score}% Match
                        </span>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {res.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
