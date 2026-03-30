import React, { useState, useEffect, useContext, useRef } from 'react';
import {
  MessageSquareWarning, CheckCircle2, Clock, AlertTriangle,
  ShieldAlert, ChevronRight, X, Send, Loader2,
  RefreshCw, MapPin, Calendar, Home, User
} from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { AuthContext } from '../../context/AuthContext';

/* ── Constants ─────────────────────────────────────────────── */
const ISSUE_META = {
  'Damage':           { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Lateness':         { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Unprofessional':   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Billing/Pricing':  { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Other':            { color: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
};

const STATUS_META = {
  'Open':                { color: '#dc2626', bg: '#fef2f2', icon: <AlertTriangle size={11} /> },
  'In Progress':         { color: '#d97706', bg: '#fffbeb', icon: <Clock size={11} /> },
  'Resolved':            { color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircle2 size={11} /> },
  'Escalated to Admin':  { color: '#7c3aed', bg: '#f5f3ff', icon: <ShieldAlert size={11} /> },
};

const VALID_STATUSES = ['Open', 'In Progress', 'Resolved', 'Escalated to Admin'];

const PANEL_W = 520; // px width of the detail slide-over

/* ── Helpers ────────────────────────────────────────────────── */
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Sub-components ─────────────────────────────────────────── */
function IssueBadge({ type }) {
  const m = ISSUE_META[type] || ISSUE_META['Other'];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META['Open'];
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
      color: m.color, background: m.bg,
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      {m.icon} {status}
    </span>
  );
}

function StatPill({ label, count, color, bg }) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}22`,
      borderRadius: 16, padding: '18px 24px',
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: 120,
    }}>
      <span style={{ fontSize: 28, fontWeight: 800, color, fontFamily: "'Poppins', sans-serif", lineHeight: 1 }}>
        {count}
      </span>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

/* ── Chat Message Bubble ─────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isMover = msg.sender === 'mover';
  const isAdmin = msg.sender === 'admin';
  return (
    <div style={{
      display: 'flex',
      flexDirection: isMover ? 'row-reverse' : 'row',
      gap: 8, marginBottom: 12,
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: isMover ? '#0a192f' : isAdmin ? '#7c3aed' : '#f97316',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, color: '#fff',
        marginTop: 4,
      }}>
        {isMover ? 'M' : isAdmin ? 'A' : 'C'}
      </div>
      {/* Bubble */}
      <div style={{ maxWidth: '72%' }}>
        <div style={{
          background: isMover ? '#0a192f' : '#f1f5f9',
          color: isMover ? '#fff' : '#0f172a',
          borderRadius: isMover ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          padding: '10px 14px',
          fontSize: 13, lineHeight: 1.55,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {msg.text}
        </div>
        <div style={{
          fontSize: 10, color: '#94a3b8', marginTop: 4,
          textAlign: isMover ? 'right' : 'left',
        }}>
          {isMover ? 'You' : isAdmin ? 'Admin' : 'Customer'} · {timeAgo(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function ResolutionCenter() {
  const { API_URL, token } = useContext(AuthContext);

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // The currently open complaint detail
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchComplaints = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/complaints`, {
        headers: { 'x-auth-token': token },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setComplaints(data);
        // Sync the selected panel if it's open
        if (selected) {
          const updated = data.find(c => c._id === selected._id);
          if (updated) setSelected(updated);
        }
      }
    } catch (err) {
      console.error('[ResolutionCenter]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchComplaints(); }, []); // eslint-disable-line

  // Scroll chat to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.messages?.length]);

  /* ── Derived stats ──────────────────────────────────────── */
  const stats = {
    open:       complaints.filter(c => c.status === 'Open').length,
    inProgress: complaints.filter(c => c.status === 'In Progress').length,
    resolved:   complaints.filter(c => c.status === 'Resolved').length,
    escalated:  complaints.filter(c => c.status === 'Escalated to Admin').length,
  };

  /* ── Handlers ───────────────────────────────────────────── */
  const handleSendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/complaints/${selected._id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ text: replyText.trim(), sender: 'mover' }),
      });
      const updated = await res.json();
      setSelected(updated);
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
      setReplyText('');
      textareaRef.current?.focus();
    } catch (err) {
      console.error('[Send Reply]', err);
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!selected || newStatus === selected.status) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`${API_URL}/complaints/${selected._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ status: newStatus }),
      });
      const updated = await res.json();
      setSelected(updated);
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
    } catch (err) {
      console.error('[Update Status]', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendReply();
  };

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <DashboardLayout>
      <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 72px)', overflow: 'hidden', margin: '-36px -40px', position: 'relative' }}>

        {/* ── Left Panel: List ────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '36px 32px',
          background: '#f8fafc',
          transition: 'width 0.3s',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquareWarning size={20} color="#dc2626" />
                </div>
                <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins', sans-serif", letterSpacing: '-0.4px' }}>
                  Resolution Center
                </h1>
              </div>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                Manage and resolve customer complaints privately
              </p>
            </div>
            <button
              onClick={() => fetchComplaints(true)}
              disabled={refreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 16px', borderRadius: 10,
                border: '1px solid #e2e8f0', background: '#fff',
                color: '#64748b', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.18s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#334155'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#64748b'; }}
            >
              <RefreshCw size={14} style={{ transition: 'transform 0.5s', transform: refreshing ? 'rotate(360deg)' : 'none' }} />
              Refresh
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
            <StatPill label="Open"             count={stats.open}       color="#dc2626" bg="#fef2f2" />
            <StatPill label="In Progress"      count={stats.inProgress} color="#d97706" bg="#fffbeb" />
            <StatPill label="Resolved"         count={stats.resolved}   color="#16a34a" bg="#f0fdf4" />
            <StatPill label="Escalated"        count={stats.escalated}  color="#7c3aed" bg="#f5f3ff" />
          </div>

          {/* Complaint list */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ height: 90, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', animation: 'rcPulse 1.4s ease infinite' }} />
              ))}
            </div>
          ) : complaints.length === 0 ? (
            /* Empty state */
            <div style={{
              textAlign: 'center', padding: '80px 24px',
              background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <CheckCircle2 size={28} color="#22c55e" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>
                All clear!
              </h3>
              <p style={{ color: '#64748b', fontSize: 14, maxWidth: 320, margin: '0 auto' }}>
                No customer complaints have been filed yet. Keep up the great work!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {complaints.map(complaint => {
                const isSelected = selected?._id === complaint._id;
                const route = complaint.lead
                  ? `${complaint.lead.originCity || ''}${complaint.lead.originCity && complaint.lead.destinationCity ? ' → ' : ''}${complaint.lead.destinationCity || ''}`
                  : null;
                return (
                  <div
                    key={complaint._id}
                    onClick={() => setSelected(complaint)}
                    style={{
                      background: isSelected ? '#fff7ed' : '#fff',
                      border: `1.5px solid ${isSelected ? '#f97316' : '#e2e8f0'}`,
                      borderRadius: 16, padding: '18px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                      boxShadow: isSelected ? '0 4px 16px rgba(249,115,22,0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
                    }}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; } }}
                    onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; } }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: "'Poppins', sans-serif" }}>
                            {complaint.customerName}
                          </span>
                          <IssueBadge type={complaint.issueType} />
                          <StatusBadge status={complaint.status} />
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {complaint.description}
                        </p>
                        {route && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                            <MapPin size={11} color="#94a3b8" />
                            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{route}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {timeAgo(complaint.createdAt)}
                        </span>
                        {complaint.messages?.length > 0 && (
                          <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                            {complaint.messages.length} msg{complaint.messages.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        <ChevronRight size={14} color="#94a3b8" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right Panel: Detail + Chat ───────────────────── */}
        <div style={{
          width: selected ? PANEL_W : 0,
          minWidth: selected ? PANEL_W : 0,
          overflow: 'hidden',
          background: '#fff',
          borderLeft: selected ? '1px solid #e2e8f0' : 'none',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1), min-width 0.3s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: selected ? '-8px 0 32px rgba(15,23,42,0.07)' : 'none',
        }}>
          {selected && (
            <>
              {/* Panel header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                flexShrink: 0,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <IssueBadge type={selected.issueType} />
                    <StatusBadge status={selected.status} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a', fontFamily: "'Poppins', sans-serif", lineHeight: 1.2 }}>
                    {selected.customerName}
                  </h2>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    {selected.customerEmail} · Filed {formatDate(selected.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Lead info strip */}
              {selected.lead && (
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {selected.lead.originCity && selected.lead.destinationCity && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                      <MapPin size={12} color="#94a3b8" />
                      {selected.lead.originCity} → {selected.lead.destinationCity}
                    </div>
                  )}
                  {selected.lead.homeSize && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                      <Home size={12} color="#94a3b8" />
                      {selected.lead.homeSize}
                    </div>
                  )}
                  {selected.lead.moveDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b' }}>
                      <Calendar size={12} color="#94a3b8" />
                      {formatDate(selected.lead.moveDate)}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Complaint Description
                </p>
                <p style={{ margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.65 }}>
                  {selected.description}
                </p>
              </div>

              {/* Status control */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', flexShrink: 0 }}>Update Status:</span>
                <div style={{ position: 'relative', flex: 1 }}>
                  <select
                    value={selected.status}
                    onChange={e => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 9,
                      border: '1.5px solid #e2e8f0', background: '#fafbfc',
                      fontSize: 13, fontWeight: 600, color: '#0f172a',
                      cursor: 'pointer', outline: 'none',
                      fontFamily: "'Inter', sans-serif",
                      appearance: 'none',
                      opacity: updatingStatus ? 0.6 : 1,
                    }}
                  >
                    {VALID_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {updatingStatus && <Loader2 size={16} color="#94a3b8" style={{ animation: 'rcSpin 0.8s linear infinite', flexShrink: 0 }} />}
              </div>

              {/* Chat thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                {selected.messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                    <User size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>No messages yet — send the first reply below.</p>
                  </div>
                ) : (
                  selected.messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Reply composer */}
              <div style={{
                padding: '14px 16px',
                borderTop: '1px solid #f1f5f9',
                background: '#fff',
                flexShrink: 0,
              }}>
                <div style={{
                  border: '1.5px solid #e2e8f0', borderRadius: 14, overflow: 'hidden',
                  background: '#fafbfc',
                  transition: 'border-color 0.18s, box-shadow 0.18s',
                }}
                  onFocusCapture={e => { e.currentTarget.style.borderColor = '#0a192f'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(10,25,47,0.08)'; }}
                  onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <textarea
                    ref={textareaRef}
                    rows={3}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your reply... (⌘ + Enter to send)"
                    disabled={sending}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '12px 14px',
                      border: 'none', outline: 'none', background: 'transparent',
                      fontSize: 13, lineHeight: 1.6, color: '#0f172a',
                      resize: 'none', fontFamily: "'Inter', sans-serif",
                    }}
                  />
                  <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      Your reply is sent as the company representative
                    </span>
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 16px', borderRadius: 9, border: 'none',
                        background: !replyText.trim() || sending ? '#e2e8f0' : 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)',
                        color: !replyText.trim() || sending ? '#94a3b8' : '#fff',
                        fontSize: 13, fontWeight: 700, cursor: !replyText.trim() || sending ? 'not-allowed' : 'pointer',
                        fontFamily: "'Poppins', sans-serif",
                        transition: 'all 0.18s',
                      }}
                    >
                      {sending
                        ? <><Loader2 size={13} style={{ animation: 'rcSpin 0.8s linear infinite' }} /> Sending…</>
                        : <><Send size={13} /> Send Reply</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes rcPulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes rcSpin  { to { transform: rotate(360deg); } }
      `}</style>
    </DashboardLayout>
  );
}
