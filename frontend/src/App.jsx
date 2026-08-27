import { useState } from 'react'
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
      // In production this URL would be relative or come from an env var.
      // We use localhost for this milestone so evaluators can run it easily.
      const response = await fetch('http://localhost:8001/api/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: formData.question,
          ai_response: formData.ai_response,
          // Only send optional fields if they have content
          ...(formData.reference_answer && { reference_answer: formData.reference_answer }),
          ...(formData.source_document && { source_document: formData.source_document })
        })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus({ type: 'success', message: `Success! Evaluation ID: ${data.id}. ${data.message}` })
        setFormData({ question: '', ai_response: '', reference_answer: '', source_document: '' }) // Clear form
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
        <h1>AI Response Validator</h1>
        <p>Evaluation Input Module (M1.3)</p>
      </header>

      <div className="glass-panel">
        <form onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label htmlFor="question">Original Question <span>*Required</span></label>
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

          <div className="form-group">
            <label htmlFor="ai_response">AI Generated Response <span>*Required</span></label>
            <textarea 
              id="ai_response"
              name="ai_response"
              value={formData.ai_response}
              onChange={handleChange}
              className="form-control"
              placeholder="e.g., The capital of France is Paris."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reference_answer">Reference Answer <span>(Optional)</span></label>
            <textarea 
              id="reference_answer"
              name="reference_answer"
              value={formData.reference_answer}
              onChange={handleChange}
              className="form-control"
              placeholder="Ground truth answer for accuracy comparison"
            />
          </div>

          <div className="form-group">
            <label htmlFor="source_document">Source Document <span>(Optional)</span></label>
            <textarea 
              id="source_document"
              name="source_document"
              value={formData.source_document}
              onChange={handleChange}
              className="form-control"
              placeholder="Paste source context or RAG chunks here"
            />
          </div>

          <button 
            type="submit" 
            className="submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Evaluation'}
          </button>
        </form>

        {status.message && (
          <div className={`message-box ${status.type}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
