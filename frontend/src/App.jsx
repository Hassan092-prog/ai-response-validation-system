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
  const [evaluationId, setEvaluationId] = useState(null)
  
  const [theme, setTheme] = useState('light')
  const [history, setHistory] = useState([])
  
  // Layout Navigation State
  const [activeTab, setActiveTab] = useState('new') // 'new' | 'history'
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setTheme(savedTheme)
      document.body.setAttribute('data-theme', savedTheme)
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.body.setAttribute('data-theme', 'dark')
    }
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://192.168.1.92:8001/api/evaluations/history')
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history)
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
            onClick={() => { setActiveTab('history'); fetchHistory(); }}
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
                          <div className="input-header">
                            <label>Source Context</label><span className="badge">Optional</span>
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
              <div className="history-header">
                <h2>Evaluation History</h2>
                <span className="badge">{history.length} Total</span>
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
