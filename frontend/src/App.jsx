import { useState, useEffect } from 'react'
import './App.css'
import Results from './Results'

function App() {
  const [formData, setFormData] = useState({
    question: '',
    ai_response: '',
    reference_answer: '',
    source_document: ''
  })
  
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [evaluationId, setEvaluationId] = useState(null)
  
  const [theme, setTheme] = useState('light')
  const [history, setHistory] = useState([])
  
  // Layout Navigation State
  const [activeTab, setActiveTab] = useState('new') // 'new' | 'history'
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.export-dropdown-container')) {
        setIsExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setTheme(savedTheme)
      document.body.setAttribute('data-theme', savedTheme)
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.body.setAttribute('data-theme', 'dark')
    }
    fetchHistory(1)
  }, [])

  const fetchHistory = async (page = 1) => {
    try {
      const response = await fetch(`http://192.168.1.92:8001/api/evaluations/history?page=${page}&limit=10`)
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history)
        setCurrentPage(data.current_page)
        setTotalPages(data.total_pages)
        setTotalRecords(data.total_records)
      }
    } catch (e) {
      console.error("Failed to fetch history", e)
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.body.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const handleExport = (format) => {
    window.open(`http://192.168.1.92:8001/api/evaluations/export?format=${format}`, '_blank')
    setIsExportMenuOpen(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit(e)
    }
  }

  useEffect(() => {
    if (status.message) {
      const timer = setTimeout(() => setStatus({ type: '', message: '' }), 4000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const fillTestData = () => {
    setFormData({
      question: 'What happens if you crack your knuckles a lot?',
      ai_response: 'Cracking your knuckles causes arthritis and permanent joint damage.',
      reference_answer: 'Cracking your knuckles does not cause arthritis. It is harmless.',
      source_document: 'Medical studies have shown that the popping sound is just gas bubbles bursting in the synovial fluid. There is no link to arthritis.'
    })
  }

  const clearInput = () => {
    setFormData({
      question: '',
      ai_response: '',
      reference_answer: '',
      source_document: ''
    })
    setEvaluationId(null)
    setStatus({ type: '', message: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: '', message: '' })

    try {
      const response = await fetch('http://192.168.1.92:8001/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: formData.question,
          ai_response: formData.ai_response,
          ...(formData.reference_answer && { reference_answer: formData.reference_answer }),
          ...(formData.source_document && { source_document: formData.source_document })
        })
      })

      const data = await response.json()

      if (response.ok) {
        setEvaluationId(data.id)
        fetchHistory()
      } else {
        setStatus({ type: 'error', message: `Error: ${data.detail ? JSON.stringify(data.detail) : 'Failed to submit'}` })
      }
    } catch (error) {
      console.error(error)
      setStatus({ type: 'error', message: 'Failed to connect to the backend server. Is it running on port 8001?' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setIsUploading(true)
    setStatus({ type: '', message: 'Extracting text from document...' })
    
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('http://192.168.1.92:8001/api/extract-text', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (response.ok) {
        setFormData(prev => ({
          ...prev,
          source_document: prev.source_document ? prev.source_document + "\n\n" + data.extracted_text : data.extracted_text
        }))
        setStatus({ type: 'success', message: 'Text extracted successfully!' })
      } else {
        setStatus({ type: 'error', message: `Error: ${data.detail || 'Failed to extract text'}` })
      }
    } catch (error) {
      console.error(error)
      setStatus({ type: 'error', message: 'Failed to connect to the backend server.' })
    } finally {
      setIsUploading(false)
      e.target.value = null
    }
  }

  return (
    <div className="app-wrapper">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>Validation AI</h2>
          <button onClick={toggleTheme} className="theme-toggle-btn" aria-label="Toggle Theme">
            {theme === 'light' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            )}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => { setActiveTab('new'); setEvaluationId(null); }}
          >
            New Evaluation
          </button>
          <button 
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); fetchHistory(1); }}
          >
            History
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="main-scroll-area">
          
          {/* Toast Notification */}
          {status.message && (
            <div className={`toast-notification ${status.type}`}>
              <div className="toast-content">
                {status.type === 'error' ? '⚠️ ' : '✅ '}
                {status.message}
              </div>
            </div>
          )}

          {/* TAB: NEW EVALUATION */}
          {activeTab === 'new' && (
            <div className="tab-container">
              {!evaluationId ? (
                <>
                  <div className="header-text">
                    <h1>Evaluation Module</h1>
                    <p>Submit responses for AI validation</p>
                  </div>
                  
                  <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="form-layout">
                    <div className="form-grid">
                      <div className="grid-col">
                        <div className="input-wrapper">
                          <div className="input-header"><label>Original Question</label></div>
                          <textarea 
                            name="question" value={formData.question} onChange={handleChange}
                            className="form-control" placeholder="e.g., What is the capital of France?" required
                          />
                        </div>
                        <div className="input-wrapper flex-grow">
                          <div className="input-header"><label>AI Response</label></div>
                          <textarea 
                            name="ai_response" value={formData.ai_response} onChange={handleChange}
                            className="form-control large" placeholder="The generated response to evaluate..." required
                          />
                        </div>
                      </div>

                      <div className="grid-col">
                        <div className="input-wrapper">
                          <div className="input-header">
                            <label>Reference Answer</label><span className="badge">Optional</span>
                          </div>
                          <textarea 
                            name="reference_answer" value={formData.reference_answer} onChange={handleChange}
                            className="form-control" placeholder="Ground truth answer for accuracy comparison"
                          />
                        </div>
                        <div className="input-wrapper flex-grow">
                          <div className="input-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <label>Source Context</label><span className="badge">Optional</span>
                            </div>
                            <label className="secondary-btn" style={{ cursor: 'pointer', fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                              {isUploading ? '⏳ Extracting...' : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                  </svg>
                                  Upload PDF/Doc
                                </>
                              )}
                              <input type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                          </div>
                          <textarea 
                            name="source_document" value={formData.source_document} onChange={handleChange}
                            className="form-control large" placeholder="Paste source context or RAG chunks here"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="submit-container" style={{ gap: '1rem', display: 'flex' }}>
                      <button type="button" className="submit-btn secondary-btn" onClick={fillTestData}>Test Data</button>
                      <button type="button" className="submit-btn secondary-btn" onClick={clearInput}>Clear Input</button>
                      <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Evaluating...' : 'Submit Evaluation'}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <Results evaluationId={evaluationId} onBack={() => setEvaluationId(null)} />
              )}
            </div>
          )}

          {/* TAB: HISTORY LIST */}
          {activeTab === 'history' && (
            <div className="tab-container history-list-view">
              <div className="history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h2>Evaluation History</h2>
                  <span className="badge">{totalRecords} Total</span>
                </div>
                
                {history.length > 0 && (
                  <div className="export-dropdown-container" style={{ position: 'relative' }}>
                    <button 
                      className="secondary-btn" 
                      onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                      style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      📥 Export Options ▼
                    </button>
                    {isExportMenuOpen && (
                      <div className="dropdown-menu" style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10,
                        minWidth: '150px', overflow: 'hidden'
                      }}>
                        <button 
                          onClick={() => handleExport('csv')} 
                          style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          📄 Export as CSV
                        </button>
                        <button 
                          onClick={() => handleExport('json')} 
                          style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                          {`{}`} Export as JSON
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {history.length === 0 ? (
                <p>No evaluations yet.</p>
              ) : (
                <div className="history-list-container">
                  {history.map(item => (
                    <div key={item.id} className={`history-row-wrapper ${expandedHistoryId === item.id ? 'expanded' : ''}`}>
                      <div 
                        className="history-list-row"
                        onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                      >
                        <span className={`status-dot ${item.status}`}></span>
                        <div className="history-row-content">
                          <span className="history-date">
                            {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}
                          </span>
                          <p className="history-question-preview">
                            {item.question.length > 80 ? item.question.substring(0, 80) + '...' : item.question}
                          </p>
                        </div>
                        
                        <div className="history-row-actions">
                          {item.score !== null && (
                            <span className={`history-score ${item.score >= 80 ? 'high' : item.score >= 50 ? 'medium' : 'low'}`}>
                              {Math.round(item.score)}/100
                            </span>
                          )}
                          <span className="expand-icon">{expandedHistoryId === item.id ? '▼' : '▶'}</span>
                        </div>
                      </div>
                      
                      {/* Accordion Dropdown Results */}
                      {expandedHistoryId === item.id && (
                        <div className="history-accordion-body">
                          <Results evaluationId={item.id} onBack={() => setExpandedHistoryId(null)} />
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {totalPages > 1 && (
                    <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '2rem', paddingBottom: '1rem' }}>
                      <button 
                        className="secondary-btn" 
                        disabled={currentPage === 1} 
                        onClick={() => fetchHistory(currentPage - 1)}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                      >
                        Previous
                      </button>
                      
                      {[...Array(totalPages)].map((_, i) => (
                        <button 
                          key={i + 1}
                          className="secondary-btn"
                          style={{ 
                            padding: '0.4rem 0.8rem', 
                            borderRadius: '4px',
                            background: currentPage === i + 1 ? 'var(--accent-color)' : 'var(--input-bg)', 
                            color: currentPage === i + 1 ? '#fff' : 'var(--text-primary)',
                            border: currentPage === i + 1 ? 'none' : '1px solid var(--input-border)',
                            cursor: 'pointer'
                          }}
                          onClick={() => fetchHistory(i + 1)}
                        >
                          {i + 1}
                        </button>
                      ))}
                      
                      <button 
                        className="secondary-btn" 
                        disabled={currentPage === totalPages} 
                        onClick={() => fetchHistory(currentPage + 1)}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default App
