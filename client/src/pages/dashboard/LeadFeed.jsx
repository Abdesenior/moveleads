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

// Statuses that are purchasable and should appear in the live feed
const FEED_STATUSES = new Set(['Available', 'READY_FOR_DISTRIBUTION']);

const isDistributable = (lead) => FEED_STATUSES.has(lead.status);

// ─── Slide-to-confirm purchase modal ────────────────────────────────────────
function PurchaseModal({ lead, balance, purchasing, onConfirm, onClose, onTopUp, formatDate }) {
  const price = lead.price || 25;
  const hasFunds = balance >= price;
  const trackRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);

  const THUMB = 56;

  const getTrackWidth = () => (trackRef.current ? trackRef.current.clientWidth : 300);

  const onPointerDown = (e) => {
    if (!hasFunds || purchasing || confirmed) return;
    dragging.current = true;
    startX.current = e.clientX - dragX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const max = getTrackWidth() - THUMB;
    const next = Math.max(0, Math.min(e.clientX - startX.current, max));
    setDragX(next);
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const max = getTrackWidth() - THUMB;
    if (dragX >= max * 0.88) {
      setConfirmed(true);
      onConfirm();
    } else {
      setDragX(0); // snap back
    }
  };

  const fillPct = Math.round((dragX / Math.max(1, getTrackWidth() - THUMB)) * 100);

  return (
    <div className="modal-overlay">
      <div className="modal-content purchase-modal">
        <div className="modal-header">
          <h3>Confirm Purchase</h3>
          <button onClick={onClose} className="close-btn"><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="purchase-summary">
            <div className="summary-route">
              <strong>{lead.originCity} → {lead.destinationCity}</strong>
              <span>{lead.homeSize} • {formatDate(lead.moveDate)}</span>
            </div>
            <div className="price-info">
              <div className="price-row">
                <span>Lead Cost</span>
                <span className="amount">${price}</span>
              </div>
              <div className="price-row">
                <span>Current Balance</span>
                <span className="balance">${balance.toFixed(2)}</span>
              </div>
              <div className="price-row total">
                <span>Remaining</span>
                <span className={`balance-after ${!hasFunds ? 'insufficient' : ''}`}>
                  ${(balance - price).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {hasFunds ? (
            <div style={{ marginTop: 24 }}>
              {/* Slide-to-confirm track */}
              <div
                ref={trackRef}
                style={{
                  position: 'relative', height: THUMB, borderRadius: THUMB,
                  background: confirmed ? '#dcfce7' : '#f1f5f9',
                  overflow: 'hidden', userSelect: 'none', cursor: purchasing ? 'wait' : 'default',
                  border: '2px solid ' + (confirmed ? '#22c55e' : '#e2e8f0'),
                  transition: 'border-color 0.3s',
                }}
              >
                {/* Fill bar */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${fillPct}%`,
                  background: 'linear-gradient(90deg, #22c55e22, #22c55e44)',
                  transition: dragging.current ? 'none' : 'width 0.3s',
                  borderRadius: THUMB,
                }} />
                {/* Track label */}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: '#94a3b8',
                  pointerEvents: 'none', letterSpacing: 0.5,
                  opacity: confirmed ? 0 : 1, transition: 'opacity 0.3s',
                }}>
                  {purchasing ? 'Processing…' : '← slide to confirm →'}
                </div>
                {/* Confirmed label */}
                {confirmed && (
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#16a34a',
                    pointerEvents: 'none',
                  }}>
                    <CheckCircle size={16} style={{ marginRight: 6 }} /> Confirmed!
                  </div>
                )}
                {/* Thumb */}
                {!confirmed && (
                  <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                    style={{
                      position: 'absolute', top: 0, left: dragX,
                      width: THUMB, height: THUMB, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'grab', boxShadow: '0 4px 16px rgba(10,25,47,0.25)',
                      transition: dragging.current ? 'none' : 'left 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                      zIndex: 2,
                    }}
                  >
                    <ShoppingBag size={20} color="#fff" />
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: '#cbd5e1' }}>
                Drag the handle all the way to purchase
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <div className="alert-box error" style={{ marginBottom: 16 }}>
                Insufficient balance — add at least ${(price - balance).toFixed(2)} to purchase this lead.
              </div>
              <div className="modal-actions">
                <button className="cancel-btn" onClick={onClose}>Cancel</button>
                <button
                  className="confirm-btn"
                  onClick={onTopUp}
                  style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
                >
                  Add Credits
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// socketStatus: 'connecting' | 'connected' | 'reconnecting'

export default function LeadFeed() {
  const { API_URL, SOCKET_URL, token, user, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socketStatus, setSocketStatus] = useState('connecting');

  // Purchase flow state
  const [confirmLead, setConfirmLead] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Audio for notifications
  const audioRef = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'));
  const pollRef = useRef(null);

  const fetchInitialLeads = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/leads`, {
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      console.log('[LeadFeed] raw response:', data);
      if (Array.isArray(data)) {
        const visible = data.filter(isDistributable);
        console.log('[LeadFeed] after filter:', visible.length, '/', data.length,
          'statuses:', data.map(l => l.status));
        setLeads(visible);
      } else {
        console.warn('[LeadFeed] response is not an array:', data);
      }
    } catch (err) {
      console.error('[LeadFeed] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [API_URL, token]);

  // Start REST polling every 30 s while socket is down (Render free tier spin-up)
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchInitialLeads, 30_000);
  }, [fetchInitialLeads]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    fetchInitialLeads();

    const socket = io(SOCKET_URL, {
      auth: { token },
      // polling first — lets the connection succeed while Render is still waking up,
      // then upgrades to WebSocket once the server is fully ready.
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,       // start at 2 s
      reconnectionDelayMax: 30_000,  // cap at 30 s (Render spin-up time)
      timeout: 20_000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected');
      setSocketStatus('connected');
      stopPolling();
      fetchInitialLeads(); // refresh list on every (re)connect
    });

    socket.on('connection_established', (data) => {
      console.log('[Socket] Authenticated:', data);
    });

    socket.on('NEW_LEAD_AVAILABLE', (newLead) => {
      if (!isDistributable(newLead)) {
        console.warn('[Socket] Ignoring non-distributable lead:', newLead.status);
        return;
      }
      audioRef.current.play().catch(e => console.warn('Audio play blocked:', e));
      setLeads(prev => [newLead, ...prev]);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected — falling back to REST polling');
      setSocketStatus('reconnecting');
      startPolling();
    });

    socket.on('connect_error', () => {
      setSocketStatus('reconnecting');
      startPolling();
    });

    return () => {
      stopPolling();
      socket.disconnect();
    };
  }, [SOCKET_URL, token, fetchInitialLeads, startPolling, stopPolling]);

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
          <div className={`connection-badge ${socketStatus === 'connected' ? 'online' : socketStatus === 'reconnecting' ? 'reconnecting' : 'offline'}`}>
            <div className="pulse-dot"></div>
            <span>
              {socketStatus === 'connected' ? 'Live' :
               socketStatus === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
            </span>
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
        <PurchaseModal
          lead={confirmLead}
          balance={user?.balance || 0}
          purchasing={purchasing}
          onConfirm={() => purchaseLead(confirmLead)}
          onClose={() => setConfirmLead(null)}
          onTopUp={() => { setConfirmLead(null); navigate('/dashboard/billing'); }}
          formatDate={formatDate}
        />
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
