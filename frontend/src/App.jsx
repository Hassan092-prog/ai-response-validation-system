import React, { useState, useEffect } from 'react'
import { PlusCircle, History, BarChart3, Moon, Sun, ChevronDown, ChevronRight, Paperclip, Download, FileSpreadsheet, FileJson, Eye, EyeOff } from 'lucide-react'
import './App.css'
import Results from './Results'
import BatchAnalyticsView from './BatchAnalyticsView'
import AnalyticsDashboard from './AnalyticsDashboard'
import BatchUpload from './BatchUpload'

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
  const [testCaseIndex, setTestCaseIndex] = useState(0)
  
  const [theme, setTheme] = useState('light')
  const [history, setHistory] = useState([])
  const [kpis, setKpis] = useState({ total_evaluations: 0, total_singles: 0, total_batches: 0 })
  
  // Layout Navigation State
  const [activeTab, setActiveTab] = useState('new') // 'new' | 'history' | 'analytics'
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
      const response = await fetch(`http://192.168.1.92:8005/api/evaluations/history?page=${page}&limit=10`)
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history)
        setCurrentPage(data.current_page)
        setTotalPages(data.total_pages)
        setTotalRecords(data.total_records)
        if (data.kpis) setKpis(data.kpis)
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
    window.open(`http://192.168.1.92:8005/api/evaluations/export?format=${format}`, '_blank')
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
    const testCases = [
      { // 1. Perfect Score (Accurate & Complete) -> PASS
        question: 'What is the capital of France?',
        ai_response: 'The capital of France is Paris.',
        reference_answer: 'Paris is the capital of France.',
        source_document: 'France is a country in Western Europe. Its capital and largest city is Paris.'
      },
      { // 2. Bad Score (Hallucination/Inaccurate) -> FAIL
        question: 'What happens if you crack your knuckles a lot?',
        ai_response: 'Cracking your knuckles causes arthritis and permanent joint damage.',
        reference_answer: 'Cracking your knuckles does not cause arthritis. It is harmless.',
        source_document: 'Medical studies have shown that the popping sound is just gas bubbles bursting in the synovial fluid. There is no link to arthritis.'
      },
      { // 3. Partial Score (Incomplete) -> NEEDS IMPROVEMENT
        question: 'Name three primary colors.',
        ai_response: 'The primary colors include red and blue.',
        reference_answer: 'The three primary colors are red, blue, and yellow.',
        source_document: 'In traditional color theory, the primary colors are red, yellow, and blue.'
      },
      { // 4. Terrible Score (Irrelevant) -> FAIL
        question: 'How do you bake a chocolate cake?',
        ai_response: 'To fix a flat tire, you need a jack and a lug wrench. First, loosen the lug nuts...',
        reference_answer: 'To bake a chocolate cake, you need flour, sugar, cocoa powder, eggs, and butter. Mix and bake at 350F for 30 minutes.',
        source_document: 'Baking a cake requires mixing dry and wet ingredients and baking them at specific temperatures.'
      },
      { // 5. Conflicting Information (Subtle Hallucination) -> FAIL
        question: 'Who is the CEO of Apple as of 2023?',
        ai_response: 'Tim Cook is the CEO of Apple, having taken over from Elon Musk in 2011.',
        reference_answer: 'Tim Cook is the CEO of Apple. He succeeded Steve Jobs in 2011.',
        source_document: 'Tim Cook has been the chief executive officer of Apple Inc. since 2011. He previously served as the company\'s chief operating officer under its co-founder Steve Jobs.'
      },
      { // 6. Slightly Inaccurate (Minor errors) -> NEEDS IMPROVEMENT
        question: 'When did the Apollo 11 moon landing happen?',
        ai_response: 'The Apollo 11 moon landing occurred on July 20, 1968.',
        reference_answer: 'The Apollo 11 moon landing occurred on July 20, 1969.',
        source_document: 'Apollo 11 was the spaceflight that first landed humans on the Moon. Commander Neil Armstrong and lunar module pilot Buzz Aldrin formed the American crew that landed the Apollo Lunar Module Eagle on July 20, 1969.'
      },
      { // 7. Correct but Missing Details (Context heavily underutilized) -> NEEDS IMPROVEMENT
        question: 'What are the main causes of the French Revolution?',
        ai_response: 'The French Revolution was caused by people being unhappy with the King.',
        reference_answer: 'The French Revolution was driven by social inequality, tax burden on the lower classes, the rise of Enlightenment ideas, and a severe financial crisis.',
        source_document: 'The causes of the French Revolution are complex, but generally include extreme social inequality, heavy taxation on the Third Estate, widespread famine, Enlightenment philosophies challenging absolute monarchy, and national bankruptcy caused by involvement in foreign wars.'
      }
    ];
    
    setFormData(testCases[testCaseIndex]);
    setTestCaseIndex((prevIndex) => (prevIndex + 1) % testCases.length);
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
      const response = await fetch('http://192.168.1.92:8005/api/evaluate', {
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
      setStatus({ type: 'error', message: 'Failed to connect to the backend server. Is it running on port 8005?' })
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
      const response = await fetch('http://192.168.1.92:8005/api/extract-text', {
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
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => { setActiveTab('new'); setEvaluationId(null); }}
          >
            <PlusCircle className="icon" size={18} /> New Evaluation
          </button>
          <button 
            className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => { setActiveTab('history'); fetchHistory(1); }}
          >
            <History className="icon" size={18} /> History
          </button>
          <button 
            className={`nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart3 className="icon" size={18} /> Analytics
          </button>
          <button 
            className={`nav-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            <FileSpreadsheet className="icon" size={18} /> Batch Process
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
                                  <Paperclip size={14} />
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
              
              {evaluationId && (
                <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
                  <Results evaluationId={evaluationId} onBack={() => setEvaluationId(null)} />
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTORY LIST */}
          {activeTab === 'history' && (
            <div className="tab-container history-list-view">
              <div className="history-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h2>Evaluation History</h2>
                  <span className="badge">{totalRecords} Total Events</span>
                </div>
                
                {history.length > 0 && (
                  <div className="export-dropdown-container" style={{ position: 'relative' }}>
                    <button 
                      className="secondary-btn" 
                      onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                      style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download size={16} /> Export Options <ChevronDown size={16} />
                    </button>
                    {isExportMenuOpen && (
                      <div className="dropdown-menu" style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                        borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10,
                        minWidth: '180px', overflow: 'hidden'
                      }}>
                        <button 
                          onClick={() => handleExport('csv')} 
                          style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--input-border)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                        >
                          <FileSpreadsheet size={16} /> Export as CSV
                        </button>
                        <button 
                          onClick={() => handleExport('json')} 
                          style={{ width: '100%', padding: '0.6rem 1rem', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                        >
                          <FileJson size={16} /> Export as JSON
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {history.length === 0 ? (
                <p>No evaluations yet.</p>
              ) : (
                <>
                  <div className="stats-grid" style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
                      <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Total Evaluations</h4>
                      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{kpis.total_evaluations}</span>
                    </div>
                    <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
                      <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Single Evaluations</h4>
                      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{kpis.total_singles}</span>
                    </div>
                    <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
                      <h4 style={{ color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Batch Evaluations</h4>
                      <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{kpis.total_batches}</span>
                    </div>
                  </div>

                  <div className="history-table-container" style={{ overflowX: 'auto', background: 'var(--input-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--input-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed', minWidth: '950px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--input-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <th style={{ padding: '1rem 1rem', fontWeight: '600', width: '28%' }}>Question</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '12%', textAlign: 'center' }}>Verdict</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '9%', textAlign: 'center' }}>Score</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '9%', textAlign: 'center' }}>Accuracy</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '9%', textAlign: 'center' }}>Relevance</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '10%', textAlign: 'center' }}>Hallucination</th>
                        <th style={{ padding: '1rem 0.5rem', fontWeight: '600', width: '15%', textAlign: 'center' }}>Date / Time</th>
                        <th style={{ padding: '1rem 1rem', fontWeight: '600', textAlign: 'right', width: '8%' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(item => {
                        let verdict = "PENDING";
                        let verdictColor = "var(--text-secondary)";
                        let verdictBg = "transparent";
                        
                        if (item.status === 'failed') { 
                          verdict = "FAIL"; 
                          verdictColor = "#ef4444"; 
                          verdictBg = "rgba(239, 68, 68, 0.1)";
                        } else if (item.status === 'completed' && item.score !== null) {
                            if (item.score < 50 || item.hallucination <= 2 || item.accuracy <= 1) { 
                              verdict = "FAIL"; 
                              verdictColor = "#ef4444"; 
                              verdictBg = "rgba(239, 68, 68, 0.1)";
                            } else if (item.score < 80) { 
                              verdict = "IMPROVEMENT"; 
                              verdictColor = "#f59e0b"; 
                              verdictBg = "rgba(245, 158, 11, 0.1)";
                            } else { 
                              verdict = "PASS"; 
                              verdictColor = "var(--btn-bg)";
                              verdictBg = "var(--btn-glow)";
                            }
                        }

                        const isExpanded = expandedHistoryId === item.id;

                        return (
                          <React.Fragment key={item.id}>
                            <tr 
                              style={{ 
                                borderBottom: '1px solid var(--input-border)', 
                                transition: 'background-color 0.2s',
                                backgroundColor: isExpanded ? 'var(--sidebar-hover)' : 'transparent'
                              }}
                            >
                              <td style={{ padding: '1.2rem 1rem', overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.question}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.ai_response || "No response provided"}
                                </div>
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', textAlign: 'center' }}>
                                <span style={{ 
                                  padding: '4px 8px', 
                                  borderRadius: '4px', 
                                  fontSize: '0.75rem', 
                                  fontWeight: '700', 
                                  letterSpacing: '0.5px',
                                  color: verdictColor,
                                  backgroundColor: verdictBg,
                                  border: `1px solid ${verdictColor}`
                                }}>
                                  {verdict}
                                </span>
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-primary)', textAlign: 'center' }}>
                                {item.score !== null ? `${Math.round(item.score)}/100` : '-'}
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', color: 'var(--text-secondary)', fontWeight: '500', textAlign: 'center' }}>
                                {item.accuracy !== null ? `${item.accuracy}/5` : '-'}
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', color: 'var(--text-secondary)', fontWeight: '500', textAlign: 'center' }}>
                                {item.relevance !== null ? `${item.relevance}/5` : '-'}
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', color: 'var(--text-secondary)', fontWeight: '500', textAlign: 'center' }}>
                                {item.hallucination !== null ? (
                                  <span style={{ color: item.hallucination <= 2 ? '#ef4444' : 'inherit' }}>
                                    {item.hallucination <= 2 ? 'HIGH' : 'LOW'}
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ padding: '1.2rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                {new Date(item.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td style={{ padding: '1.2rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button 
                                  className="secondary-btn"
                                  onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                                  title={isExpanded ? "Hide Details" : "View Details"}
                                  style={{ padding: '0.5rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
                                >
                                  {isExpanded ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                              </td>
                            </tr>
                            
                            {/* Expandable Results Row */}
                            {isExpanded && (
                              <tr style={{ background: 'var(--bg-color)' }}>
                                <td colSpan="8" style={{ padding: '0' }}>
                                  <div className="history-accordion-body" style={{ borderBottom: '1px solid var(--input-border)', borderTop: 'none' }}>
                                    {item.is_batch ? (
                                      <BatchAnalyticsView batchId={item.id} />
                                    ) : (
                                      <Results evaluationId={item.id} onBack={() => setExpandedHistoryId(null)} />
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  
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
                </>
              )}
            </div>
          )}

          {/* TAB: ANALYTICS DASHBOARD */}
          {activeTab === 'analytics' && (
            <div className="tab-container">
              <AnalyticsDashboard />
            </div>
          )}

          {/* TAB: BATCH UPLOAD */}
          {activeTab === 'batch' && (
            <BatchUpload />
          )}

        </div>
      </main>
    </div>
  )
}

export default App
