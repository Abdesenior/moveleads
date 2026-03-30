import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { MessageSquareWarning, CheckCircle, Send, AlertCircle, Clock } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';

export default function ResolutionCenter() {
  const { token, API_URL } = useContext(AuthContext);
  const [complaints, setComplaints] = useState([]);
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchComplaints = async () => {
    try {
      const res = await fetch(`${API_URL}/complaints`, {
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      setComplaints(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
    // eslint-disable-next-line
  }, []);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selected) return;

    try {
      const res = await fetch(`${API_URL}/complaints/${selected._id}/messages`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText, sender: 'mover' })
      });
      const updated = await res.json();

      // Update local state
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
      setSelected(updated);
      setReplyText('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await fetch(`${API_URL}/complaints/${selected._id}/status`, {
        method: 'PATCH',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const updated = await res.json();
      setComplaints(prev => prev.map(c => c._id === updated._id ? updated : c));
      setSelected(updated);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <DashboardLayout><div style={{ padding: 40, color: '#64748b' }}>Loading tickets...</div></DashboardLayout>;

  return (
    <DashboardLayout>
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', background: '#f8fafc', margin: '-36px -40px' }}>

      {/* Left Sidebar: Complaint List */}
      <div style={{ width: 340, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Resolution Center</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Manage customer feedback</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {complaints.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No complaints found. Great job!</div>
          ) : (
            complaints.map(c => (
              <div
                key={c._id}
                onClick={() => setSelected(c)}
                style={{
                  padding: '16px 24px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: selected?._id === c._id ? '#eff6ff' : '#fff',
                  borderLeft: selected?._id === c._id ? '3px solid #3b82f6' : '3px solid transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{c.customerName}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                    background: c.status === 'Resolved' ? '#dcfce7' : '#fee2e2',
                    color: c.status === 'Resolved' ? '#166534' : '#991b1b'
                  }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.issueType}: {c.description}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Side: Chat / Ticket Details */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {selected ? (
          <>
            {/* Header */}
            <div style={{ padding: '20px 32px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{selected.customerName}</h3>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 13, color: '#64748b' }}>
                  <span><strong>Move Date:</strong> {new Date(selected.lead?.moveDate).toLocaleDateString()}</span>
                  <span><strong>Route:</strong> {selected.lead?.route}</span>
                </div>
              </div>
              <select
                value={selected.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', outline: 'none', fontWeight: 600, cursor: 'pointer' }}
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            {/* Chat History */}
            <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
              {/* Initial Complaint Bubble */}
              <div style={{ display: 'flex', marginBottom: 24 }}>
                <div style={{ maxWidth: '75%', background: '#fff', padding: '16px 20px', borderRadius: '0 16px 16px 16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', marginBottom: 4, textTransform: 'uppercase' }}>{selected.issueType}</div>
                  <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>{selected.description}</p>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{new Date(selected.createdAt).toLocaleString()}</div>
                </div>
              </div>

              {/* Thread Messages */}
              {selected.messages.map((msg, i) => {
                const isMover = msg.sender === 'mover';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isMover ? 'flex-end' : 'flex-start', marginBottom: 24 }}>
                    <div style={{
                      maxWidth: '75%', padding: '12px 18px',
                      borderRadius: isMover ? '16px 0 16px 16px' : '0 16px 16px 16px',
                      background: isMover ? '#3b82f6' : '#fff',
                      color: isMover ? '#fff' : '#334155',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      border: isMover ? 'none' : '1px solid #e2e8f0'
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, marginBottom: 4 }}>
                        {isMover ? 'You' : msg.sender === 'admin' ? 'MoveLeads Admin' : selected.customerName}
                      </div>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input */}
            <div style={{ padding: 24, background: '#fff', borderTop: '1px solid #e2e8f0' }}>
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: 12 }}>
                <input
                  type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  placeholder="Type your reply to the customer..."
                  style={{ flex: 1, padding: '14px 20px', borderRadius: 999, border: '1px solid #e2e8f0', outline: 'none', fontSize: 14, background: '#f8fafc' }}
                />
                <button type="submit" disabled={!replyText.trim()} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 999, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: replyText.trim() ? 'pointer' : 'not-allowed', opacity: replyText.trim() ? 1 : 0.5 }}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 15 }}>Select a ticket to view details</div>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}