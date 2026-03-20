import { useState, useRef } from 'react';
import { Search, Zap, TrendingUp, MapPin, ArrowRight, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './LeadVolumeWidget.css';

const _base = import.meta.env.VITE_API_URL || 'http://localhost:5005';
const API_URL = _base.endsWith('/api') ? _base : `${_base}/api`;

// Demand-level config drives colour + copy
const DEMAND_CONFIG = {
  'Very High': { color: '#22c55e', bg: '#f0fdf4', border: '#86efac', barWidth: '95%', pulse: true },
  'High':      { color: '#f97316', bg: '#fff7ed', border: '#fed7aa', barWidth: '70%', pulse: true },
  'Active':    { color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', barWidth: '45%', pulse: false },
  'Emerging':  { color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', barWidth: '20%', pulse: false }
};

export default function LeadVolumeWidget({ onSignupClick }) {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const check = async (e) => {
    e.preventDefault();
    const clean = zip.replace(/\D/g, '').slice(0, 5);
    if (clean.length !== 5) {
      setError('Please enter a valid 5-digit zip code.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/public/lead-volume/${clean}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Could not fetch data');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleZipChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 5);
    setZip(v);
    if (error) setError('');
    if (result) setResult(null);
  };

  const cfg = result ? DEMAND_CONFIG[result.demandLabel] ?? DEMAND_CONFIG['Emerging'] : null;

  const headline = () => {
    if (!result) return null;
    if (result.count >= 1) {
      return (
        <>
          We generated{' '}
          <span className="lvw-hl-num">{result.count}</span>{' '}
          verified moving lead{result.count !== 1 ? 's' : ''} in{' '}
          <span className="lvw-hl-zip">{result.zipcode}</span> this week.
        </>
      );
    }
    if (result.nearbyCount >= 1) {
      return (
        <>
          <span className="lvw-hl-num">{result.nearbyCount}</span>{' '}
          leads generated near{' '}
          <span className="lvw-hl-zip">{result.zipcode}</span> this week — high-demand area.
        </>
      );
    }
    return (
      <>
        <span className="lvw-hl-zip">{result.zipcode}</span> is an{' '}
        <span className="lvw-hl-num" style={{ color: '#8b5cf6' }}>Emerging Market</span> —
        be the first mover in your territory.
      </>
    );
  };

  const subline = () => {
    if (!result) return null;
    const n = result.count || result.nearbyCount;
    if (n >= 1) return `Sign up now to start claiming these leads before your competitors do.`;
    return `We're expanding into this area. Claim your territory early and get leads at launch pricing.`;
  };

  return (
    <div className="lvw-card">
      <div className="lvw-header">
        <div className="lvw-header-icon"><TrendingUp size={20} /></div>
        <div>
          <h3 className="lvw-title">Check Lead Volume In Your Area</h3>
          <p className="lvw-subtitle">See exactly how many verified leads dropped in your zip this week.</p>
        </div>
      </div>

      <form className="lvw-form" onSubmit={check}>
        <div className="lvw-input-wrap">
          <MapPin size={16} className="lvw-input-icon" />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            value={zip}
            onChange={handleZipChange}
            placeholder="Enter zip code…"
            className="lvw-input"
            maxLength={5}
            aria-label="Zip code"
          />
        </div>
        <button type="submit" className="lvw-btn" disabled={loading || zip.length !== 5}>
          {loading
            ? <Loader size={16} className="lvw-spin" />
            : <><Search size={15} /> Check</>
          }
        </button>
      </form>

      {error && <p className="lvw-error">{error}</p>}

      {result && cfg && (
        <div className="lvw-result" style={{ background: cfg.bg, borderColor: cfg.border }}>
          {/* Demand badge */}
          <div className="lvw-demand-row">
            <span
              className={`lvw-demand-badge ${cfg.pulse ? 'lvw-pulse' : ''}`}
              style={{ background: cfg.color }}
            >
              {result.demandLabel} Demand
            </span>
            <span className="lvw-window">Last 7 days</span>
          </div>

          {/* Big stat */}
          <div className="lvw-stat-row">
            <div className="lvw-stat-num" style={{ color: cfg.color }}>
              {result.count > 0 ? result.count : result.nearbyCount > 0 ? `~${result.nearbyCount}` : '0+'}
            </div>
            <div className="lvw-stat-label">verified leads</div>
          </div>

          {/* Activity bar */}
          <div className="lvw-bar-track">
            <div
              className="lvw-bar-fill"
              style={{ width: cfg.barWidth, background: cfg.color }}
            />
          </div>

          {/* Copy */}
          <p className="lvw-headline">{headline()}</p>
          <p className="lvw-subline">{subline()}</p>

          {/* CTA */}
          <button
            className="lvw-cta"
            style={{ background: cfg.color }}
            onClick={onSignupClick ?? (() => navigate('/register'))}
          >
            Claim These Leads Now <ArrowRight size={15} />
          </button>

          {/* Nearby note */}
          {result.count === 0 && result.nearbyCount > 0 && (
            <p className="lvw-nearby-note">
              <Zap size={11} /> Showing leads from surrounding zip codes in the same metro area.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
