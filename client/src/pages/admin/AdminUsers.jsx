import { useState, useEffect, useContext } from 'react';
import { ShieldAlert, Trash2, Search, Users, UserCheck, UserX, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

export default function AdminUsers() {
  const { API_URL, token, user: currentUser, impersonate } = useContext(AuthContext);
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [suspending, setSuspending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('dateJoined');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { setPage(1); }, [searchTerm, sortKey, sortDir]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`, { headers: { 'x-auth-token': token } });
      setUsers(await res.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_URL}/users/${id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.msg || 'Failed to delete user');
        return;
      }
      fetchUsers();
    } catch (err) { alert(err.message); }
  };

  const handleSuspendToggle = async (id, nextIsSuspended) => {
    try {
      setSuspending(true);
      const res = await fetch(`${API_URL}/users/${id}/suspend`, {
        method: 'PUT',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuspended: nextIsSuspended })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || 'Failed to update suspension');
      fetchUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setSuspending(false);
    }
  };

  const handleImpersonate = async (targetUser) => {
    try {
      const res = await fetch(`${API_URL}/admin/impersonate/${targetUser._id}`, {
        method: 'POST',
        headers: { 'x-auth-token': token }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Impersonation failed');

      impersonate(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filteredUsers = users.filter((u) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (u.companyName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'companyName') return String(a.companyName || '').localeCompare(String(b.companyName || '')) * dir;
    if (sortKey === 'balance') return ((a.balance || 0) - (b.balance || 0)) * dir;
    if (sortKey === 'leadsPurchased') return ((a.leadsPurchased || 0) - (b.leadsPurchased || 0)) * dir;
    const av = new Date(a.dateJoined).getTime();
    const bv = new Date(b.dateJoined).getTime();
    return ((Number.isFinite(av) ? av : 0) - (Number.isFinite(bv) ? bv : 0)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedUsers = sortedUsers.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const activeUsers = users.filter(u => !u.isSuspended && u.role !== 'admin').length;
  const suspendedUsers = users.filter(u => u.isSuspended).length;

  return (
    <AdminLayout>
      <header className="dashboard-header">
        <h1 style={{ fontFamily: 'Poppins' }}>Manage Users</h1>
        <p>Monitor and control all registered customer accounts</p>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Total Users</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={16} color="#3b82f6" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{users.length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Active</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserCheck size={16} color="#22c55e" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#22c55e' }}>{activeUsers}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Suspended</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserX size={16} color="#ef4444" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#ef4444' }}>{suspendedUsers}</div>
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 800, fontFamily: 'Poppins', color: 'var(--bg-navy)', fontSize: 16 }}>Customer Directory</div>
          <div style={{ position: 'relative', minWidth: 260, flex: '1 1 260px' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by company or email..."
              style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 13 }}
            />
          </div>
        </div>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('companyName')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'companyName' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Company {sortKey === 'companyName' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>Email</th>
              <th>DOT / MC</th>
              <th>
                <button type="button" onClick={() => toggleSort('balance')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'balance' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Balance {sortKey === 'balance' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('leadsPurchased')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'leadsPurchased' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Leads {sortKey === 'leadsPurchased' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('dateJoined')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'dateJoined' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Joined {sortKey === 'dateJoined' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={7} />
            ) : pagedUsers.length === 0 ? (
              <tr><td colSpan="7" className="table-empty">No users found.</td></tr>
            ) : (
              pagedUsers.map((u, i) => (
              <tr key={u._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                <td style={{ paddingLeft: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: u.isSuspended ? '#fee2e2' : 'linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: u.isSuspended ? '#ef4444' : '#3b82f6', fontSize: 12, fontWeight: 700, flexShrink: 0
                    }}>{getInitials(u.companyName)}</div>
                    <div>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{u.companyName}</span>
                      {u.role === 'admin' && (
                        <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 800, border: '1px solid #fca5a5', padding: '2px 6px', borderRadius: 4, marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Admin</span>
                      )}
                      {u.isSuspended && (
                        <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 800, border: '1px solid #fcd34d', padding: '2px 6px', borderRadius: 4, marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Suspended</span>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: '#475569' }}>{u.email}</td>
                <td style={{ fontSize: 13, color: '#475569' }}>{u.dotNumber || 'N/A'} / {u.mcNumber || 'N/A'}</td>
                <td>
                  <span style={{
                    fontWeight: 700, fontSize: 13, color: '#16a34a',
                    background: '#f0fdf4', padding: '4px 10px', borderRadius: 8
                  }}>${u.balance.toFixed(2)}</span>
                </td>
                <td style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{u.leadsPurchased}</td>
                <td style={{ fontSize: 13, color: '#64748b' }}>{new Date(u.dateJoined).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      title={u.isSuspended ? 'Unsuspend User' : 'Suspend User'}
                      disabled={suspending}
                      onClick={() => handleSuspendToggle(u._id, !u.isSuspended)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: '1px solid',
                        borderColor: u.isSuspended ? '#bbf7d0' : '#fecaca',
                        color: u.isSuspended ? '#16a34a' : '#ef4444',
                        background: u.isSuspended ? '#f0fdf4' : '#fef2f2',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                    >
                      <ShieldAlert size={13} /> {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                    {currentUser?.role === 'super_admin' && u.role === 'customer' && (
                      <button
                        title="Impersonate User"
                        onClick={() => handleImpersonate(u)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                          border: '1px solid #e2e8f0', color: '#0f172a', background: '#fff',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <UserPlus size={13} /> Impersonate
                      </button>
                    )}
                    <button onClick={() => { setSelectedUserId(u._id); setShowConfirm(true); }}
                      style={{ width: 34, height: 34, borderRadius: 8, background: '#fef2f2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', transition: 'all 0.2s' }}
                      title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && totalPages > 1 && (
          <div style={{ padding: '0 24px 24px' }}>
            <TablePagination page={pageSafe} totalPages={totalPages} pageSize={pageSize}
              onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={showConfirm} 
        onClose={() => { setShowConfirm(false); setSelectedUserId(null); }}
        onConfirm={() => handleDelete(selectedUserId)}
        title="Delete User"
        message="Are you sure you want to permanently remove this customer from the platform? This will delete all their data."
        confirmText="Remove Account"
        type="danger"
      />
    </AdminLayout>
  );
}
