import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

const F = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";
const ORANGE = '#f97316';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: F,
          background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
          padding: '20px'
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: 500,
            padding: '48px 40px',
            background: 'white',
            borderRadius: 24,
            boxShadow: '0 4px 40px rgba(249, 115, 22, 0.15)'
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px'
            }}>
              <AlertTriangle size={36} color={ORANGE} />
            </div>

            <h1 style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#0b1628',
              marginBottom: 12
            }}>
              Something Went Wrong
            </h1>

            <p style={{
              fontSize: 14,
              color: '#64748b',
              lineHeight: 1.6,
              marginBottom: 32
            }}>
              We encountered an unexpected error. Our team has been notified.
              Please try refreshing the page.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={this.handleReload} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                background: ORANGE,
                color: 'white',
                border: 'none',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer'
              }}>
                <RefreshCw size={16} />
                Reload Page
              </button>

              <Link to="/" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                background: 'white',
                color: '#0b1628',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none'
              }}>
                <Home size={16} />
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
