import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-black text-white font-mono flex-col gap-4">
          <h1 className="text-2xl text-red-500">CRITICAL SYSTEM FAILURE</h1>
          <p className="text-gray-400">Simulation parameters exceeded safety thresholds.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-cyan-500 text-cyan-500 hover:bg-cyan-500 hover:text-black transition-colors"
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
