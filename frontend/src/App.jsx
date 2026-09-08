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

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      setTheme(savedTheme)
      document.body.setAttribute('data-theme', savedTheme)
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.body.setAttribute('data-theme', 'dark')
    }
  }, [])

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
  }

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
    <div className="app-container">
      <header className="header">
        <div className="header-text">
          <h1>Evaluation Module</h1>
          <p>Submit responses for AI validation</p>
        </div>
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
      </header>

      <form onSubmit={handleSubmit} className="form-layout">
        <div className="form-grid">
              {/* LEFT COLUMN - Core Input */}
              <div className="grid-col">
                <div className="input-wrapper">
                  <div className="input-header">
                    <label htmlFor="question">Original Question</label>
                  </div>
                  <textarea 
                    id="question"
                    name="question"
                    value={formData.question}
                    onChange={handleChange}
                    className="form-control"
                    placeholder="e.g., What is the capital of France?"
                    required
                  />
                </div>

                <div className="input-wrapper flex-grow">
                  <div className="input-header">
                    <label htmlFor="ai_response">AI Response</label>
                  </div>
                  <textarea 
                    id="ai_response"
                    name="ai_response"
                    value={formData.ai_response}
                    onChange={handleChange}
                    className="form-control large"
                    placeholder="The generated response to evaluate..."
                    required
                  />
                </div>
              </div>

              {/* RIGHT COLUMN - Context */}
              <div className="grid-col">
                <div className="input-wrapper">
                  <div className="input-header">
                    <label htmlFor="reference_answer">Reference Answer</label>
                    <span className="badge">Optional</span>
                  </div>
                  <textarea 
                    id="reference_answer"
                    name="reference_answer"
                    value={formData.reference_answer}
                    onChange={handleChange}
                    className="form-control"
                    placeholder="Ground truth answer for accuracy comparison"
                  />
                </div>

                <div className="input-wrapper flex-grow">
                  <div className="input-header">
                    <label htmlFor="source_document">Source Context</label>
                    <span className="badge">Optional</span>
                  </div>
                  <textarea 
                    id="source_document"
                    name="source_document"
                    value={formData.source_document}
                    onChange={handleChange}
                    className="form-control large"
                    placeholder="Paste source context or RAG chunks here"
                  />
                </div>
              </div>
            </div>

            <div className="submit-container" style={{ gap: '1rem', display: 'flex' }}>
              <button 
                type="button" 
                className="submit-btn secondary-btn"
                onClick={fillTestData}
              >
                Test Data
              </button>
              <button 
                type="button" 
                className="submit-btn secondary-btn"
                onClick={clearInput}
              >
                Clear Input
              </button>
              <button 
                type="submit" 
                className="submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Evaluating...' : 'Submit Evaluation'}
              </button>
            </div>
      </form>
      
      {!evaluationId && status.message && (
        <div className={`message-box ${status.type}`}>
          {status.message}
        </div>
      )}

      {evaluationId && (
        <div style={{ marginTop: '2rem', width: '100%', display: 'flex', justifyContent: 'center', borderTop: '1px solid var(--input-border)', paddingTop: '3rem' }}>
          <Results evaluationId={evaluationId} onBack={() => setEvaluationId(null)} />
        </div>
      )}
    </div>
  )
}

export default App
