import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { 
  MapPin, Clock, Package, ShoppingBag, 
  CheckCircle, User, Phone as PhoneIcon, X,
  TrendingUp, Zap, ZapOff, Bell, Truck
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LeadFeed.css';

// Statuses that should never appear in the live feed
const EXCLUDED_STATUSES = new Set([
  'REJECTED_FAKE',
  'PENDING_MANUAL_REVIEW',
  'Pending Verification',
]);

const isDistributable = (lead) => !EXCLUDED_STATUSES.has(lead.status);

export default function LeadFeed() {
  const { API_URL, token, user, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  // Purchase flow state
  const [confirmLead, setConfirmLead] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Audio for notifications
  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));

  // Declare fetchInitialLeads before useEffect so the reference is stable
  // when the effect captures it on first mount.
  const fetchInitialLeads = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/leads`, {
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        // Only show leads that are ready for distribution
        setLeads(data.filter(l => l.status === 'READY_FOR_DISTRIBUTION'));
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => {
    fetchInitialLeads();

    // Setup Socket Connection
    const socket = io(API_URL.replace('/api', ''), {
      auth: { token },
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to server');
      setSocketConnected(true);
    });

    socket.on('connection_established', (data) => {
      console.log('[Socket] Authenticated:', data);
    });

    socket.on('NEW_LEAD_AVAILABLE', (newLead) => {
      // Guard: only process leads that are actually distributable.
      // Rejects REJECTED_FAKE, PENDING_MANUAL_REVIEW, Pending Verification.
      if (!isDistributable(newLead)) {
        console.warn('[Socket] Ignoring non-distributable lead:', newLead.status);
        return;
      }

      console.log('[Socket] New lead received:', newLead);
      audioRef.current.play().catch(e => console.warn('Audio play blocked:', e));
      setLeads(prev => [newLead, ...prev]);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [API_URL, token, fetchInitialLeads]);

  const purchaseLead = async (lead) => {
    setPurchasing(true);
    try {
      const res = await fetch(`${API_URL}/leads/${lead.id || lead._id}/claim`, {
        method: 'POST',
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json' 
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Failed to purchase lead');
      
      setConfirmLead(null);
      setSuccessData({ lead: data.lead || lead, balance: data.balance });
      setLeads(prev => prev.filter(l => (l.id || l._id) !== (lead.id || lead._id)));
      refreshUser();
    } catch (err) {
      alert(err.message);
    } finally {
      setPurchasing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'TBD';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <DashboardLayout>
      <div className="lead-feed-container">
        <header className="feed-header">
          <div className="header-content">
            <h1 className="feed-title">Live Lead Feed</h1>
            <p className="feed-subtitle">Instant notifications for leads in your coverage area</p>
          </div>
          <div className={`connection-badge ${socketConnected ? 'online' : 'offline'}`}>
            <div className="pulse-dot"></div>
            <span>{socketConnected ? 'Live Connection' : 'Reconnecting...'}</span>
          </div>
        </header>

        {loading ? (
          <div className="feed-loading">
            <div className="spinner"></div>
            <span>Scanning for live opportunities...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="empty-feed">
            <div className="empty-icon-box">
              <ZapOff size={32} />
            </div>
            <h3>No Live Leads Right Now</h3>
            <p>We'll notify you with a sound as soon as a new lead hits your territory.</p>
          </div>
        ) : (
          <div className="leads-grid">
            {leads.map((lead, index) => (
              <div key={lead.id || lead._id} className="lead-card" style={{ animationDelay: `${index * 0.05}s` }}>
                <div className="card-top">
                  <div className="route-info">
                    <div className="city-pill origin">{lead.originCity}</div>
                    <div className="route-arrow">
                      <Truck size={14} />
                    </div>
                    <div className="city-pill destination">{lead.destinationCity}</div>
                  </div>
                  <div className="lead-price-tag">${lead.price || 25}</div>
                </div>

                <div className="card-body">
                  <div className="data-row">
                    <div className="data-item">
                      <Calendar size={14} className="icon" />
                      <span>{formatDate(lead.moveDate)}</span>
                    </div>
                    <div className="data-item">
                      <Package size={14} className="icon" />
                      <span>{lead.homeSize}</span>
                    </div>
                  </div>
                  <div className="data-row">
                    <div className="data-item">
                      <MapPin size={14} className="icon" />
                      <span>{lead.originZip} serve radius</span>
                    </div>
                    <div className="data-item">
                      <Clock size={14} className="icon" />
                      <span>Available Now</span>
                    </div>
                  </div>
                </div>

                <div className="card-footer">
                  <button 
                    className="buy-btn"
                    onClick={() => setConfirmLead(lead)}
                  >
                    <ShoppingBag size={16} />
                    <span>Purchase Lead</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Purchase Confirmation Modal ═══ */}
      {confirmLead && (
        <div className="modal-overlay">
          <div className="modal-content purchase-modal">
            <div className="modal-header">
              <h3>Confirm Purchase</h3>
              <button onClick={() => setConfirmLead(null)} className="close-btn"><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="purchase-summary">
                <div className="summary-route">
                  <strong>{confirmLead.originCity} → {confirmLead.destinationCity}</strong>
                  <span>{confirmLead.homeSize} • {formatDate(confirmLead.moveDate)}</span>
                </div>
                <div className="price-info">
                  <div className="price-row">
                    <span>Lead Cost</span>
                    <span className="amount">${confirmLead.price || 25}</span>
                  </div>
                  <div className="price-row">
                    <span>Current Balance</span>
                    <span className="balance">${(user?.balance || 0).toFixed(2)}</span>
                  </div>
                  <div className="price-row total">
                    <span>Remaining</span>
                    <span className={`balance-after ${((user?.balance || 0) < (confirmLead.price || 25)) ? 'insufficient' : ''}`}>
                      ${((user?.balance || 0) - (confirmLead.price || 25)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {(user?.balance || 0) < (confirmLead.price || 25) && (
                <div className="alert-box error">
                  Insufficient balance. Please top up in the billing section.
                </div>
              )}

              <div className="modal-actions">
                <button 
                  className="cancel-btn"
                  onClick={() => setConfirmLead(null)}
                >
                  Cancel
                </button>
                <button 
                  className="confirm-btn"
                  disabled={purchasing || (user?.balance || 0) < (confirmLead.price || 25)}
                  onClick={() => purchaseLead(confirmLead)}
                >
                  {purchasing ? 'Processing...' : `Confirm & Pay $${confirmLead.price || 25}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Success Modal ═══ */}
      {successData && (
        <div className="modal-overlay">
          <div className="modal-content success-modal">
            <div className="success-icon-box">
              <CheckCircle size={48} />
            </div>
            <h2>Lead Unlocked!</h2>
            <p>You now have full access to the customer's contact details.</p>

            <div className="contact-details-box">
              <div className="detail-item">
                <User size={18} />
                <div>
                  <label>Customer Name</label>
                  <span>{successData.lead.customerName}</span>
                </div>
              </div>
              <div className="detail-item">
                <PhoneIcon size={18} />
                <div>
                  <label>Phone Number</label>
                  <span>{successData.lead.customerPhone}</span>
                </div>
              </div>
              <div className="detail-item">
                <Truck size={18} />
                <div>
                  <label>Move Target</label>
                  <span>{successData.lead.originCity} to {successData.lead.destinationCity}</span>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button 
                className="view-btn" 
                onClick={() => { setSuccessData(null); navigate('/dashboard/customers'); }}
              >
                Go to My Customers
              </button>
              <button 
                className="close-success-btn"
                onClick={() => setSuccessData(null)}
              >
                Continue Feeding
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

// Add simple Calendar icon if not already in lucide-react (it usually is)
const Calendar = ({ size, className }) => (
  <svg 
    width={size} height={size} viewBox="0 0 24 24" fill="none" 
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" 
    strokeLinejoin="round" className={className}
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
