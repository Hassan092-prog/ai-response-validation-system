import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [formData, setFormData] = useState({
    question: '',
    ai_response: '',
    reference_answer: '',
    source_document: ''
  })
  
  const [status, setStatus] = useState({ type: '', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
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
        setStatus({ type: 'success', message: `Evaluation ID: ${data.id}. ${data.message}` })
        setFormData({ question: '', ai_response: '', reference_answer: '', source_document: '' })
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
          {theme === 'light' ? '🌙' : '☀️'}
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

        <div className="submit-container">
          <button 
            type="submit" 
            className="submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Evaluating...' : 'Submit Evaluation'}
          </button>
        </div>
      </form>
      
      {status.message && (
        <div className={`message-box ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  )
}

export default App
