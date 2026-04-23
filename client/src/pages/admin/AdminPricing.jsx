import React, { useState, useEffect, useContext } from 'react';
import { DollarSign, Plus, Trash2, Edit2, CheckCircle, XCircle, AlertCircle, Info, ArrowLeft, Loader } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';

const CATEGORIES = [
  { id: 'HOME_SIZE', label: 'Home Size' },
  { id: 'DISTANCE', label: 'Distance' },
  { id: 'MOVE_DATE', label: 'Move Date' },
];

export default function AdminPricing() {
  const { API_URL, token } = useContext(AuthContext);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Rule Form State
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    category: 'HOME_SIZE',
    matchValue: '',
    multiplier: 1.0,
    description: ''
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/pricing`, {
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      if (Array.isArray(data)) setRules(data);
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId ? `${API_URL}/admin/pricing/${editingId}` : `${API_URL}/admin/pricing`;
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.msg || 'Failed to save rule');
      }
      
      await fetchRules();
      setShowForm(false);
      setEditingId(null);
      setFormData({ category: 'HOME_SIZE', matchValue: '', multiplier: 1.0, description: '' });
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule) => {
    try {
      await fetch(`${API_URL}/admin/pricing/${rule._id}`, {
        method: 'PUT',
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !rule.isActive })
      });
      setRules(rules.map(r => r._id === rule._id ? { ...r, isActive: !r.isActive } : r));
    } catch (err) {
      console.error('Error toggling rule:', err);
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await fetch(`${API_URL}/admin/pricing/${id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
      });
      setRules(rules.filter(r => r._id !== id));
    } catch (err) {
      console.error('Error deleting rule:', err);
    }
  };

  const editRule = (rule) => {
    setEditingId(rule._id);
    setFormData({
      category: rule.category,
      matchValue: rule.matchValue,
      multiplier: rule.multiplier,
      description: rule.description || ''
    });
    setShowForm(true);
  };

  return (
    <AdminLayout>
      <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: 'Poppins' }}>Pricing Rules</h1>
          <p>Configure dynamic lead prices based on move characteristics</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); }} className="btn-primary" style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12
        }}>
          <Plus size={18} /> Add Rule
        </button>
      </header>

      {showForm && (
        <div className="panel" style={{ marginBottom: 24, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ marginBottom: 20 }}>{editingId ? 'Edit Pricing Rule' : 'New Pricing Rule'}</h3>
          <form onSubmit={saveRule} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#64748b' }}>CATEGORY</label>
              <select 
                value={formData.category} 
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
              >
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#64748b' }}>MATCH VALUE (Exact)</label>
              <input 
                type="text" 
                value={formData.matchValue}
                onChange={(e) => setFormData({...formData, matchValue: e.target.value})}
                placeholder="e.g. 3 Bedroom House, Long Distance"
                required
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#64748b' }}>MULTIPLIER (e.g. 1.5)</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.multiplier}
                onChange={(e) => setFormData({...formData, multiplier: parseFloat(e.target.value)})}
                required
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#64748b' }}>DESCRIPTION</label>
              <input 
                type="text" 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Brief explanation of this pricing rule"
                style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '10px 24px' }}>
                {saving ? 'Saving...' : 'Save Rule'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{
                background: '#fff', border: '1px solid #e2e8f0', padding: '10px 24px', borderRadius: 8, cursor: 'pointer'
              }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>Rule Description</th>
              <th>Category</th>
              <th>Value</th>
              <th>Multiplier</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: 24 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ padding: 40, textAlign: 'center' }}><Loader className="spinner" /></td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan="6" className="table-empty">No dynamic pricing rules set. Using global base price.</td></tr>
            ) : (
              rules.map((rule, i) => (
                <tr key={rule._id} style={{ opacity: rule.isActive ? 1 : 0.6 }}>
                  <td style={{ paddingLeft: 24 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{rule.description || 'No description'}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: 4 }}>
                      {rule.category}
                    </span>
                  </td>
                  <td><code style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: 4 }}>{rule.matchValue}</code></td>
                  <td>
                    <strong style={{ color: rule.multiplier > 1 ? '#16a34a' : rule.multiplier < 1 ? '#dc2626' : '#64748b' }}>
                      {rule.multiplier}x
                    </strong>
                  </td>
                  <td>
                    <button 
                      onClick={() => toggleRule(rule)}
                      style={{ 
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: rule.isActive ? '#16a34a' : '#94a3b8'
                      }}
                    >
                      {rule.isActive ? <CheckCircle size={20} /> : <XCircle size={20} />}
                    </button>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 24 }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => editRule(rule)} className="btn-icon" style={{ background: '#f1f5f9', color: '#2563eb' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteRule(rule._id)} className="btn-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, padding: 20, background: '#eff6ff', borderRadius: 12, display: 'flex', gap: 16 }}>
        <Info size={24} color="#3b82f6" />
        <div>
          <h4 style={{ color: '#1e40af', margin: '0 0 4px' }}>How stacking works</h4>
          <p style={{ margin: 0, fontSize: 13, color: '#1e40af', opacity: 0.8 }}>
            Multiple rules are applied <strong>multiplicatively</strong>. For example, if a lead is 'Long Distance' (1.5x) AND '3 Bedroom House' (1.2x), the final price multiplier will be <strong>1.8x</strong> (1.5 * 1.2).
          </p>
        </div>
      </div>
      
      <style>{`
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .btn-icon { width: 32px; height: 32px; border: none; border-radius: 8px; cursor: pointer; display: flex; alignItems: center; justifyContent: center; transition: all 0.2s; }
        .btn-icon:hover { transform: translateY(-1px); filter: brightness(0.95); }
      `}</style>
    </AdminLayout>
  );
}
