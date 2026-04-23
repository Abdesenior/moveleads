import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, MapPin, Home, Calendar, DollarSign, User, Phone, Mail, FileText, Weight, Hash, Package, Search, Upload, Download, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import AdminLayout from '../../components/AdminLayout';
import { AuthContext } from '../../context/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';
import TablePagination from '../../components/ui/TablePagination';
import TableSkeleton from '../../components/ui/TableSkeleton';

const CITIES = [
  "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose", "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte", "Indianapolis", "San Francisco", "Seattle", "Denver", "Nashville", "Oklahoma City", "El Paso", "Washington DC", "Las Vegas", "Louisville", "Memphis", "Portland", "Baltimore", "Milwaukee", "Albuquerque", "Tucson", "Fresno", "Sacramento", "Mesa", "Kansas City", "Atlanta", "Omaha", "Colorado Springs", "Raleigh", "Miami", "Long Beach", "Virginia Beach", "Minneapolis", "Tampa", "New Orleans", "Arlington", "Bakersfield", "Honolulu", "Anaheim", "Aurora", "Santa Ana", "Corpus Christi", "Riverside", "Lexington", "St. Louis", "Pittsburgh", "Stockton", "Anchorage", "Cincinnati", "St. Paul", "Greensboro", "Toledo", "Newark", "Plano", "Henderson", "Orlando", "Lincoln", "Jersey City", "Chandler", "St. Petersburg", "Laredo", "Norfolk", "Madison", "Durham", "Lubbock", "Winston-Salem", "Garland", "Glendale", "Hialeah", "Reno", "Baton Rouge", "Irvine", "Chesapeake", "Irving", "Scottsdale", "North Las Vegas", "Fremont", "Gilbert", "San Bernardino", "Birmingham", "Rochester", "Richmond", "Spokane", "Des Moines", "Montgomery", "Modesto", "Fayetteville", "Tacoma", "Shreveport", "Fontana", "Moreno Valley", "Akron", "Yonkers", "Augusta", "Little Rock", "Amarillo", "Grand Rapids", "Oxnard", "Salt Lake City", "Tallahassee", "Huntsville", "Worcester", "Knoxville", "Providence", "Brownsville", "Santa Clarita", "Garden Grove", "Oceanside", "Fort Lauderdale", "Chattanooga", "Tempe", "Cape Coral", "Eugene", "Peoria", "Cary", "Springfield", "Fort Wayne", "Elk Grove", "Rockford", "Corona", "Hayward", "Clarksville", "Paterson", "Lancaster", "Salinas", "Palmdale", "Sunnyvale", "Pomona", "Escondido", "Surprise", "Pasadena", "Torrance", "Orange", "Fullerton", "Killeen", "McAllen", "Dayton", "Cedar Rapids", "Macon", "Hampton", "Hartford", "Savannah", "Syracuse", "Bridgeport", "Warren", "Sterling Heights", "Roseville", "New Haven", "Olathe", "Mesquite", "Sioux Falls", "Lakewood", "Thornton", "Frisco", "Waco", "Jackson", "Bellevue", "Alexandria", "Gainesville", "Concord", "Elizabeth", "Topeka", "Simi Valley", "Columbia", "Stamford", "Victorville", "Carrollton", "Thousand Oaks", "Abilene", "Vallejo", "Beaumont", "Round Rock", "West Valley City", "Costa Mesa", "Norman", "Wichita", "Midland", "Provo", "Clearwater", "Murfreesboro", "Arvada", "Independence", "Ann Arbor", "Lansing", "El Monte", "Inglewood", "Downey", "Fairfield", "Manchester", "Wilmington", "Clovis", "Lowell", "West Jordan", "Elgin", "Joliet"
];

const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom', 'House (Small)', 'House (Medium)', 'House (Large)', 'Office/Commercial'];

/* Primary ZIP codes for each city in the CITIES list */
const CITY_ZIPS = {
  "New York": "10001", "Los Angeles": "90001", "Chicago": "60601", "Houston": "77001",
  "Phoenix": "85001", "Philadelphia": "19101", "San Antonio": "78201", "San Diego": "92101",
  "Dallas": "75201", "San Jose": "95101", "Austin": "78701", "Jacksonville": "32099",
  "Fort Worth": "76101", "Columbus": "43085", "Charlotte": "28201", "Indianapolis": "46201",
  "San Francisco": "94102", "Seattle": "98101", "Denver": "80201", "Nashville": "37201",
  "Oklahoma City": "73101", "El Paso": "79901", "Washington DC": "20001", "Las Vegas": "89101",
  "Louisville": "40201", "Memphis": "38101", "Portland": "97201", "Baltimore": "21201",
  "Milwaukee": "53201", "Albuquerque": "87101", "Tucson": "85701", "Fresno": "93701",
  "Sacramento": "94203", "Mesa": "85201", "Kansas City": "64101", "Atlanta": "30301",
  "Omaha": "68101", "Colorado Springs": "80901", "Raleigh": "27601", "Miami": "33101",
  "Long Beach": "90801", "Virginia Beach": "23450", "Minneapolis": "55401", "Tampa": "33601",
  "New Orleans": "70112", "Arlington": "76001", "Bakersfield": "93301", "Honolulu": "96801",
  "Anaheim": "92801", "Aurora": "80010", "Santa Ana": "92701", "Corpus Christi": "78401",
  "Riverside": "92501", "Lexington": "40502", "St. Louis": "63101", "Pittsburgh": "15201",
  "Stockton": "95201", "Anchorage": "99501", "Cincinnati": "45201", "St. Paul": "55101",
  "Greensboro": "27401", "Toledo": "43601", "Newark": "07101", "Plano": "75023",
  "Henderson": "89002", "Orlando": "32801", "Lincoln": "68501", "Jersey City": "07302",
  "Chandler": "85224", "St. Petersburg": "33701", "Laredo": "78040", "Norfolk": "23501",
  "Madison": "53701", "Durham": "27701", "Lubbock": "79401", "Winston-Salem": "27101",
  "Garland": "75040", "Glendale": "85301", "Hialeah": "33010", "Reno": "89501",
  "Baton Rouge": "70801", "Irvine": "92602", "Chesapeake": "23320", "Irving": "75061",
  "Scottsdale": "85250", "North Las Vegas": "89030", "Fremont": "94536", "Gilbert": "85233",
  "San Bernardino": "92401", "Birmingham": "35201", "Rochester": "14601", "Richmond": "23219",
  "Spokane": "99201", "Des Moines": "50301", "Montgomery": "36101", "Modesto": "95351",
  "Fayetteville": "28301", "Tacoma": "98401", "Shreveport": "71101", "Fontana": "92335",
  "Moreno Valley": "92551", "Akron": "44301", "Yonkers": "10701", "Augusta": "30901",
  "Little Rock": "72201", "Amarillo": "79101", "Grand Rapids": "49501", "Oxnard": "93030",
  "Salt Lake City": "84101", "Tallahassee": "32301", "Huntsville": "35801", "Worcester": "01601",
  "Knoxville": "37901", "Providence": "02901", "Brownsville": "78520", "Santa Clarita": "91350",
  "Garden Grove": "92840", "Oceanside": "92054", "Fort Lauderdale": "33301", "Chattanooga": "37401",
  "Tempe": "85281", "Cape Coral": "33904", "Eugene": "97401", "Peoria": "61602",
  "Cary": "27511", "Springfield": "62701", "Fort Wayne": "46801", "Elk Grove": "95624",
  "Rockford": "61101", "Corona": "92879", "Hayward": "94541", "Clarksville": "37040",
  "Paterson": "07501", "Lancaster": "17601", "Salinas": "93901", "Palmdale": "93550",
  "Sunnyvale": "94085", "Pomona": "91766", "Escondido": "92025", "Surprise": "85374",
  "Pasadena": "91101", "Torrance": "90501", "Orange": "92856", "Fullerton": "92831",
  "Killeen": "76541", "McAllen": "78501", "Dayton": "45401", "Cedar Rapids": "52401",
  "Macon": "31201", "Hampton": "23661", "Hartford": "06101", "Savannah": "31401",
  "Syracuse": "13201", "Bridgeport": "06601", "Warren": "48089", "Sterling Heights": "48310",
  "Roseville": "95678", "New Haven": "06501", "Olathe": "66061", "Mesquite": "75149",
  "Sioux Falls": "57101", "Lakewood": "80214", "Thornton": "80229", "Frisco": "75034",
  "Waco": "76701", "Jackson": "39201", "Bellevue": "98004", "Alexandria": "22301",
  "Gainesville": "32601", "Concord": "94519", "Elizabeth": "07201", "Topeka": "66601",
  "Simi Valley": "93065", "Columbia": "29201", "Stamford": "06901", "Victorville": "92392",
  "Carrollton": "75006", "Thousand Oaks": "91360", "Abilene": "79601", "Vallejo": "94590",
  "Beaumont": "77701", "Round Rock": "78664", "West Valley City": "84119", "Costa Mesa": "92626",
  "Norman": "73069", "Wichita": "67201", "Midland": "79701", "Provo": "84601",
  "Clearwater": "33755", "Murfreesboro": "37130", "Arvada": "80001", "Independence": "64050",
  "Ann Arbor": "48103", "Lansing": "48901", "El Monte": "91731", "Inglewood": "90301",
  "Downey": "90241", "Fairfield": "94533", "Manchester": "03101", "Wilmington": "28401",
  "Clovis": "93611", "Lowell": "01851", "West Jordan": "84084", "Elgin": "60120", "Joliet": "60431"
};

/* ── Custom city autocomplete with auto ZIP lookup ── */
function CityAutocomplete({ label, value, onChange, onZipFound, placeholder }) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef = useRef(null);

  // Fully controlled: both query and autoZip are derived from the prop — no local state to sync
  const query   = value || '';
  const autoZip = CITY_ZIPS[value] || '';

  const filtered = query.length > 0
    ? CITIES.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const select = (city) => {
    onChange(city);
    setOpen(false);
    if (onZipFound) {
      const zip = CITY_ZIPS[city];
      if (zip) onZipFound(zip);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKey = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); select(filtered[highlighted]); }
    if (e.key === 'Escape')    { setOpen(false); }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1, display: 'flex', alignItems: 'center' }}>
          <MapPin size={13} color="#94a3b8" />
        </div>
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          required
          style={{ ...inputStyle, paddingLeft: 34 }}
          onChange={e => { onChange(e.target.value); setOpen(true); setHighlighted(0); }}
          onFocus={() => { setOpen(true); setHighlighted(0); }}
          onKeyDown={handleKey}
          onBlur={e => {
            e.target.style.borderColor = '#e2e8f0';
            e.target.style.boxShadow = 'none';
            e.target.style.background = '#fafbfc';
          }}
          onFocusCapture={e => {
            e.target.style.borderColor = '#f97316';
            e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)';
            e.target.style.background = '#fff';
          }}
        />
        {autoZip && (
          <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, pointerEvents: 'none' }}>
            ZIP {autoZip}
          </div>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#fff', border: '1.5px solid #e2e8f0',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 99999, overflow: 'hidden', maxHeight: 260, overflowY: 'auto'
        }}>
          {filtered.map((city, i) => (
            <div
              key={city}
              onMouseDown={() => select(city)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: i === highlighted ? 700 : 500,
                color: i === highlighted ? '#0f172a' : '#475569',
                background: i === highlighted ? '#f0f7ff' : 'transparent',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none'
              }}
            >
              <MapPin size={12} color={i === highlighted ? '#3b82f6' : '#cbd5e1'} />
              {city}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


export default function AdminLeads() {
  const { API_URL, token } = useContext(AuthContext);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('moveDate');
  const [sortDir, setSortDir] = useState('desc');
  
  const emptyForm = {
    originCity: '', originZip: '', destinationCity: '', destinationZip: '',
    homeSize: '1 Bedroom', moveDate: '', distance: 'Local', customerName: '',
    customerPhone: '', customerEmail: '', price: 10,
    specialInstructions: '', estimatedWeight: '', numberOfRooms: 0
  };

  const [formData, setFormData] = useState(emptyForm);

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const col = (row, ...names) => {
    for (const n of names) {
      const v = row[n] ?? row[n.toLowerCase()] ?? row[n.toUpperCase()];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  const validateRow = (row) => {
    const errors = [];
    if (!col(row, 'first name', 'firstName', 'first_name') && !col(row, 'last name', 'lastName', 'last_name')) errors.push('Missing name');
    if (!col(row, 'phone')) errors.push('Missing phone');
    if (!col(row, 'email')) errors.push('Missing email');
    if (!col(row, 'origin zip', 'originZip', 'origin_zip')) errors.push('Missing origin zip');
    if (!col(row, 'destination zip', 'destinationZip', 'destination_zip')) errors.push('Missing destination zip');
    return errors;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const preview = rows.map((row) => {
        const errors = validateRow(row);
        const firstName = col(row, 'first name', 'firstName', 'first_name');
        const lastName = col(row, 'last name', 'lastName', 'last_name');
        return {
          _raw: row,
          name: `${firstName} ${lastName}`.trim() || 'Unknown',
          phone: col(row, 'phone'),
          email: col(row, 'email'),
          originCity: col(row, 'origin city', 'originCity', 'origin_city'),
          destinationCity: col(row, 'destination city', 'destinationCity', 'destination_city'),
          homeSize: col(row, 'move size', 'moveSize', 'move_size', 'home size', 'homeSize'),
          moveDate: col(row, 'move date', 'moveDate', 'move_date'),
          errors,
          valid: errors.length === 0
        };
      });
      setImportPreview(preview);
      setImportResult(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const validRows = importPreview.filter(r => r.valid).map(r => ({
      firstName: col(r._raw, 'first name', 'firstName', 'first_name'),
      lastName: col(r._raw, 'last name', 'lastName', 'last_name'),
      phone: col(r._raw, 'phone'),
      email: col(r._raw, 'email'),
      originCity: col(r._raw, 'origin city', 'originCity', 'origin_city'),
      originState: col(r._raw, 'origin state', 'originState', 'origin_state'),
      originZip: col(r._raw, 'origin zip', 'originZip', 'origin_zip'),
      destinationCity: col(r._raw, 'destination city', 'destinationCity', 'destination_city'),
      destinationState: col(r._raw, 'destination state', 'destinationState', 'destination_state'),
      destinationZip: col(r._raw, 'destination zip', 'destinationZip', 'destination_zip'),
      moveType: col(r._raw, 'move type', 'moveType', 'move_type'),
      moveSize: col(r._raw, 'move size', 'moveSize', 'move_size', 'home size', 'homeSize'),
      moveDate: col(r._raw, 'move date', 'moveDate', 'move_date'),
    }));
    setImporting(true);
    try {
      const res = await fetch(`${API_URL}/admin/leads/import`, {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: validRows })
      });
      const data = await res.json();
      setImportResult(data);
      if (data.imported > 0) fetchLeads();
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview([]);
    setImportResult(null);
  };

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/leads`, { headers: { 'x-auth-token': token } });
      setLeads(await res.json());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [API_URL, token]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleInput = (e) => setFormData({...formData, [e.target.name]: e.target.value});

  const handleEditClick = (lead) => {
    setEditingId(lead._id);
    setFormData({
      originCity: lead.originCity || '', originZip: lead.originZip || '',
      destinationCity: lead.destinationCity || '', destinationZip: lead.destinationZip || '',
      homeSize: lead.homeSize || '1 Bedroom',
      moveDate: lead.moveDate ? new Date(lead.moveDate).toISOString().split('T')[0] : '',
      distance: lead.distance || 'Local', customerName: lead.customerName || '',
      customerPhone: lead.customerPhone || '', customerEmail: lead.customerEmail || '',
      price: lead.price || 10, specialInstructions: lead.specialInstructions || '',
      estimatedWeight: lead.estimatedWeight || '', numberOfRooms: lead.numberOfRooms || 0
    });
    setShowModal(true);
  };

  const handleAddLead = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const leadPayload = {
      ...formData,
      route: `${formData.originCity} to ${formData.destinationCity}`,
      price: parseInt(formData.price, 10) || 10,
      numberOfRooms: parseInt(formData.numberOfRooms, 10) || 0
    };

    try {
      if (editingId) {
        const res = await fetch(`${API_URL}/leads/${editingId}`, {
          method: 'PUT',
          headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload)
        });
        if (!res.ok) throw new Error('Failed to update lead');
      } else {
        const res = await fetch(`${API_URL}/leads`, {
          method: 'POST',
          headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload)
        });
        if (!res.ok) throw new Error('Failed to create lead');
      }
      
      setShowModal(false);
      setEditingId(null);
      setFormData(emptyForm);
      fetchLeads();
    } catch (err) { 
      alert(err.message); 
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_URL}/leads/${id}`, { 
        method: 'DELETE', headers: { 'x-auth-token': token } 
      });
      if (!res.ok) throw new Error('Failed to delete');
      setLeads((prev) => prev.filter(l => l._id !== id));
    } catch (err) { alert(err.message); }
  };

  const filtered = leads.filter(l => {
    const matchSearch = !searchTerm || 
      l.originCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.destinationCity?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = !statusFilter || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, sortKey, sortDir]);

  const sortedLeads = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const getValue = (lead) => {
      switch (sortKey) {
        case 'route': return `${lead.originCity || ''} -> ${lead.destinationCity || ''}`.toLowerCase();
        case 'contact': return (lead.customerName || '').toLowerCase();
        case 'homeSize': return (lead.homeSize || '').toLowerCase();
        case 'moveDate': { const t = new Date(lead.moveDate).getTime(); return Number.isFinite(t) ? t : 0; }
        case 'price': return Number(lead.price || 0);
        case 'status': return (lead.status || '').toLowerCase();
        default: return '';
      }
    };
    const av = getValue(a); const bv = getValue(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedLeads = sortedLeads.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const availableCount = leads.filter(l => l.status === 'Available').length;
  const purchasedCount = leads.filter(l => l.status === 'Purchased').length;

  return (
    <AdminLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: 16 }}>
        <header className="dashboard-header" style={{ marginBottom: 0 }}>
          <h1 style={{ fontFamily: 'Poppins' }}>Manage Leads</h1>
          <p>Create, edit, and manage all marketplace leads</p>
        </header>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowImportModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fff', color: '#374151', border: '1.5px solid #e2e8f0',
              borderRadius: 14, padding: '14px 20px',
              fontSize: 14, fontWeight: 600, fontFamily: "'Poppins', sans-serif",
              cursor: 'pointer', transition: 'all 0.2s'
            }}>
            <Upload size={16} /> Import CSV/Excel
          </button>
          <button onClick={() => { setEditingId(null); setFormData(emptyForm); setShowModal(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff', border: 'none', borderRadius: 14, padding: '14px 24px',
              fontSize: 14, fontWeight: 700, fontFamily: "'Poppins', sans-serif",
              cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              transition: 'all 0.2s'
            }}>
            <Plus size={18} /> Add New Lead
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Total Leads</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={16} color="#3b82f6" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28 }}>{leads.length}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Available</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={16} color="#22c55e" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#22c55e' }}>{availableCount}</div>
        </div>
        <div className="stat-card" style={{ padding: 20 }}>
          <div className="stat-header">
            <span className="stat-title">Purchased</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={16} color="#8b5cf6" />
            </div>
          </div>
          <div className="stat-value" style={{ fontSize: 28, color: '#8b5cf6' }}>{purchasedCount}</div>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="Search leads by city or contact..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 40px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontSize: 13 }}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 150 }}>
          <option value="">All Status</option>
          <option value="Available">Available</option>
          <option value="Purchased">Purchased</option>
          <option value="Expired">Expired</option>
        </select>
      </div>

      {/* Table */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden', borderRadius: 18 }}>
        <table className="leads-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 24 }}>
                <button type="button" onClick={() => toggleSort('route')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'route' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Route {sortKey === 'route' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('contact')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'contact' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Contact {sortKey === 'contact' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('homeSize')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'homeSize' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Home Size {sortKey === 'homeSize' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('moveDate')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'moveDate' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Move Date {sortKey === 'moveDate' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('price')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'price' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Price {sortKey === 'price' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('status')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 900, color: sortKey === 'status' ? 'var(--bg-navy)' : 'var(--text-muted)' }}>
                  Status {sortKey === 'status' && <span style={{ color: 'var(--accent-orange)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              <th style={{ textAlign: 'right', paddingRight: 24 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton rowCount={pageSize} colCount={7} />
            ) : sortedLeads.length === 0 ? (
              <tr><td colSpan="7" className="table-empty">No leads match your search and filters.</td></tr>
            ) : (
              pagedLeads.map((lead, i) => (
              <tr key={lead._id} style={{ background: i % 2 === 0 ? '#fff' : '#fcfdfe' }}>
                <td style={{ paddingLeft: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={14} color="#3b82f6" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{lead.originCity} → {lead.destinationCity}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.distance}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{lead.customerName}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.customerPhone}</div>
                </td>
                <td><span style={{ fontSize: 12, color: '#475569' }}>{lead.homeSize}</span></td>
                <td><span style={{ fontSize: 12, color: '#475569' }}>{new Date(lead.moveDate).toLocaleDateString()}</span></td>
                <td><strong style={{ color: '#0f172a' }}>${lead.price.toFixed(2)}</strong></td>
                <td>
                  <span style={{
                    padding: '5px 14px', borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: lead.status === 'Available' ? '#eff6ff' : lead.status === 'Purchased' ? '#f0fdf4' : lead.status === 'READY_FOR_DISTRIBUTION' ? '#f0fdf4' : lead.status === 'REJECTED_FAKE' || lead.status === 'PENDING_MANUAL_REVIEW' ? '#fef2f2' : '#f1f5f9',
                    color: lead.status === 'Available' ? '#2563eb' : lead.status === 'Purchased' ? '#16a34a' : lead.status === 'READY_FOR_DISTRIBUTION' ? '#15803d' : lead.status === 'REJECTED_FAKE' || lead.status === 'PENDING_MANUAL_REVIEW' ? '#dc2626' : '#64748b'
                  }}>{lead.status}</span>
                </td>
                <td style={{ textAlign: 'right', paddingRight: 24 }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => handleEditClick(lead)} 
                      style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', transition: 'all 0.2s' }}
                      title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => { setSelectedLead(lead); setShowConfirm(true); }}
                      style={{ width: 34, height: 34, borderRadius: 10, background: '#fef2f2', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', transition: 'all 0.2s' }}
                      title="Delete"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalPages > 1 && (
        <TablePagination page={pageSafe} totalPages={totalPages} pageSize={pageSize}
          onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
      )}

      <ConfirmModal 
        isOpen={showConfirm} 
        onClose={() => { setShowConfirm(false); setSelectedLead(null); }}
        onConfirm={() => handleDelete(selectedLead?._id)}
        title="Delete Record"
        message="Are you sure you want to permanently remove this lead? This action cannot be undone."
        confirmText="Delete Lead"
        type="danger"
      />

      {/* PREMIUM ADD/EDIT LEAD MODAL */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(10,20,40,0.65)',
          backdropFilter: 'blur(14px)',
          zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fadeIn 0.25s ease'
        }}>
          <div style={{
            background: '#fff', width: '100%', maxWidth: 780, borderRadius: 28,
            boxShadow: '0 40px 100px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '94vh', overflowY: 'auto',
            animation: 'scaleIn 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', flexDirection: 'column'
          }}>

            {/* ── Modal Header ── */}
            <div style={{
              background: 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)',
              padding: '26px 32px 22px',
              borderRadius: '28px 28px 0 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              flexShrink: 0
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,115,22,0.2)', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editingId ? <Edit2 size={16} color="#f97316" /> : <Plus size={16} color="#f97316" />}
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0, fontFamily: 'Poppins', letterSpacing: '-0.3px' }}>
                    {editingId ? 'Edit Lead' : 'Create New Lead'}
                  </h2>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0, paddingLeft: 46 }}>
                  {editingId ? 'Update lead details in the marketplace' : 'Fill in all sections to publish a new moving lead'}
                </p>
              </div>
              <button onClick={() => { setShowModal(false); setEditingId(null); }}
                style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', transition: 'all 0.2s', flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}>
                <X size={18} />
              </button>
            </div>

            {/* ── Route Summary Badge (live preview) ── */}
            {(formData.originCity || formData.destinationCity) && (
              <div style={{ background: '#f0f7ff', borderBottom: '1px solid #dbeafe', padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <MapPin size={14} color="#3b82f6" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>
                  {formData.originCity || '—'} → {formData.destinationCity || '—'}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', background: '#e0f2fe', padding: '2px 10px', borderRadius: 100, fontWeight: 600, marginLeft: 4 }}>
                  {formData.distance}
                </span>
                {formData.moveDate && (
                  <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                    📅 {new Date(formData.moveDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            )}

            <form onSubmit={handleAddLead} style={{ padding: '20px 32px 32px', flex: 1 }}>

              {/* ── Section 1: Move Details ── */}
              <SectionHeader icon={<MapPin size={14} color="#3b82f6" />} bg="#eff6ff" title="Move Details" subtitle="Origin and destination information" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
                <CityAutocomplete
                  label="Origin City *"
                  value={formData.originCity}
                  onChange={val => setFormData(f => ({ ...f, originCity: val }))}
                  onZipFound={zip => setFormData(f => ({ ...f, originZip: zip }))}
                  placeholder="e.g. New York"
                />
                <CityAutocomplete
                  label="Destination City *"
                  value={formData.destinationCity}
                  onChange={val => setFormData(f => ({ ...f, destinationCity: val }))}
                  onZipFound={zip => setFormData(f => ({ ...f, destinationZip: zip }))}
                  placeholder="e.g. Los Angeles"
                />
                <FieldGroup label="Origin ZIP" icon={<Hash size={13} color="#94a3b8" />}>
                  <input type="text" name="originZip" maxLength={5}
                    value={formData.originZip} onChange={handleInput}
                    style={inputStyle} placeholder="e.g. 10001" />
                </FieldGroup>
                <FieldGroup label="Destination ZIP" icon={<Hash size={13} color="#94a3b8" />}>
                  <input type="text" name="destinationZip" maxLength={5}
                    value={formData.destinationZip} onChange={handleInput}
                    style={inputStyle} placeholder="e.g. 90001" />
                </FieldGroup>
                <FieldGroup label="Move Date *" icon={<Calendar size={13} color="#94a3b8" />}>
                  <input type="date" name="moveDate" value={formData.moveDate} onChange={handleInput} required style={inputStyle} />
                </FieldGroup>
                <FieldGroup label="Distance Type *" icon={<MapPin size={13} color="#94a3b8" />}>
                  <select name="distance" value={formData.distance} onChange={handleInput} style={inputStyle}>
                    <option value="Local">🏙️ Local (Under 50 miles)</option>
                    <option value="Long Distance">🛣️ Long Distance (50+ miles)</option>
                  </select>
                </FieldGroup>
              </div>

              {/* ── Section 2: Property Info ── */}
              <SectionHeader icon={<Home size={14} color="#8b5cf6" />} bg="#f5f3ff" title="Property Information" subtitle="Home size and move logistics" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
                <FieldGroup label="Home Size *" icon={<Home size={13} color="#94a3b8" />}>
                  <select name="homeSize" value={formData.homeSize} onChange={handleInput} style={inputStyle}>
                    {HOME_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Number of Rooms" icon={<Hash size={13} color="#94a3b8" />}>
                  <input type="number" name="numberOfRooms" value={formData.numberOfRooms} onChange={handleInput}
                    style={inputStyle} placeholder="0" min="0" />
                </FieldGroup>
                <FieldGroup label="Est. Weight (lbs)" icon={<Weight size={13} color="#94a3b8" />}>
                  <input type="text" name="estimatedWeight" value={formData.estimatedWeight} onChange={handleInput}
                    style={inputStyle} placeholder="e.g. 5,000" />
                </FieldGroup>
              </div>

              {/* ── Section 3: Customer Contact ── */}
              <SectionHeader icon={<User size={14} color="#16a34a" />} bg="#f0fdf4" title="Customer Contact" subtitle="Lead contact details" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldGroup label="Full Name *" icon={<User size={13} color="#94a3b8" />}>
                    <input type="text" name="customerName" value={formData.customerName} onChange={handleInput}
                      required style={inputStyle} placeholder="John Doe" />
                  </FieldGroup>
                </div>
                <FieldGroup label="Phone Number *" icon={<Phone size={13} color="#94a3b8" />}>
                  <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleInput}
                    required style={inputStyle} placeholder="(555) 123-4567" />
                </FieldGroup>
                <FieldGroup label="Email Address *" icon={<Mail size={13} color="#94a3b8" />}>
                  <input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleInput}
                    required style={inputStyle} placeholder="john@example.com" />
                </FieldGroup>
                <FieldGroup label="Price ($) *" icon={<DollarSign size={13} color="#94a3b8" />}>
                  <input type="number" name="price" value={formData.price} onChange={handleInput}
                    required style={{ ...inputStyle, fontWeight: 700, color: '#0f172a' }} min="1" />
                </FieldGroup>
              </div>

              {/* ── Section 4: Notes ── */}
              <SectionHeader icon={<FileText size={14} color="#f59e0b" />} bg="#fffbeb" title="Special Instructions" subtitle="Extra details for the moving company" />
              <div style={{ marginBottom: 28 }}>
                <textarea name="specialInstructions" value={formData.specialInstructions} onChange={handleInput}
                  rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.6 }}
                  placeholder="e.g. 3rd floor walk-up, fragile items, has pets, piano needs disassembly..." />
              </div>

              {/* ── Action Buttons ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 20, gap: 12 }}>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  * Required fields
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => { setShowModal(false); setEditingId(null); }}
                    style={{
                      padding: '12px 24px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                      background: 'transparent', color: '#64748b', fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'transparent'; }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    style={{
                      padding: '12px 32px', borderRadius: 12, border: 'none',
                      background: submitting ? '#94a3b8' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                      fontFamily: "'Poppins', sans-serif",
                      boxShadow: submitting ? 'none' : '0 4px 16px rgba(245,158,11,0.35)',
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8
                    }}
                    onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,158,11,0.45)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = submitting ? 'none' : '0 4px 16px rgba(245,158,11,0.35)'; }}>
                    {submitting ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Saving...
                      </>
                    ) : (
                      <>{editingId ? <><Edit2 size={14} /> Update Lead</> : <><Plus size={14} /> Publish to Marketplace</>}</>
                    )}
                  </button>
                </div>
              </div>
            </form>


          </div>
        </div>
      )}

      {/* IMPORT CSV/EXCEL MODAL */}
      {showImportModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(10,20,40,0.65)',
          backdropFilter: 'blur(14px)',
          zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          animation: 'fadeIn 0.25s ease'
        }}>
          <div style={{
            background: '#fff', width: '100%', maxWidth: 860, borderRadius: 28,
            boxShadow: '0 40px 100px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '92vh', overflowY: 'auto',
            animation: 'scaleIn 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: '28px 28px 0 0', padding: '28px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={22} color="#fff" />
                </div>
                <div>
                  <h2 style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: "'Poppins', sans-serif" }}>Import Leads from CSV / Excel</h2>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>Upload a spreadsheet to bulk-import leads into the marketplace</p>
                </div>
              </div>
              <button onClick={closeImportModal} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Template download + file picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <a
                  href={`${API_URL}/admin/leads/import/template`}
                  download="moveleads-template.csv"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: '#f1f5f9', color: '#334155', textDecoration: 'none', border: '1px solid #e2e8f0'
                  }}
                >
                  <Download size={14} /> Download Template
                </a>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', border: 'none', cursor: 'pointer'
                  }}
                >
                  <Upload size={14} /> Choose File
                </button>
                {importPreview.length > 0 && (
                  <span style={{ fontSize: 13, color: '#64748b' }}>
                    {importPreview.length} rows found — <span style={{ color: '#16a34a', fontWeight: 700 }}>{importPreview.filter(r => r.valid).length} valid</span>
                    {importPreview.filter(r => !r.valid).length > 0 && (
                      <>, <span style={{ color: '#dc2626', fontWeight: 700 }}>{importPreview.filter(r => !r.valid).length} with errors</span></>
                    )}
                  </span>
                )}
              </div>

              {/* Result banner */}
              {importResult && (
                <div style={{
                  padding: '14px 18px', borderRadius: 12,
                  background: importResult.error ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${importResult.error ? '#fca5a5' : '#bbf7d0'}`,
                  display: 'flex', alignItems: 'center', gap: 10
                }}>
                  {importResult.error
                    ? <AlertCircle size={18} color="#dc2626" />
                    : <CheckCircle size={18} color="#16a34a" />
                  }
                  <span style={{ fontSize: 13, fontWeight: 600, color: importResult.error ? '#dc2626' : '#15803d' }}>
                    {importResult.error
                      ? `Import failed: ${importResult.error}`
                      : `Successfully imported ${importResult.imported} lead${importResult.imported !== 1 ? 's' : ''}${importResult.skipped > 0 ? ` (${importResult.skipped} skipped)` : ''}`
                    }
                  </span>
                </div>
              )}

              {/* Preview table */}
              {importPreview.length > 0 && (
                <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Name', 'Phone', 'Email', 'Route', 'Size', 'Move Date', 'Status'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((row, i) => (
                        <tr key={i} style={{ background: row.valid ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0f172a' }}>{row.name}</td>
                          <td style={{ padding: '9px 14px', color: '#475569' }}>{row.phone || '—'}</td>
                          <td style={{ padding: '9px 14px', color: '#475569', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email || '—'}</td>
                          <td style={{ padding: '9px 14px', color: '#475569' }}>{row.originCity && row.destinationCity ? `${row.originCity} → ${row.destinationCity}` : '—'}</td>
                          <td style={{ padding: '9px 14px', color: '#475569' }}>{row.homeSize || '—'}</td>
                          <td style={{ padding: '9px 14px', color: '#475569' }}>{row.moveDate || '—'}</td>
                          <td style={{ padding: '9px 14px' }}>
                            {row.valid
                              ? <span style={{ color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Ready</span>
                              : <span style={{ color: '#dc2626', fontSize: 11 }} title={row.errors.join(', ')}><AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{row.errors[0]}</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '0 32px 28px', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={closeImportModal} style={{
                padding: '12px 24px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#374151'
              }}>
                {importResult?.imported > 0 ? 'Close' : 'Cancel'}
              </button>
              {importPreview.filter(r => r.valid).length > 0 && !importResult?.imported && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  style={{
                    padding: '12px 24px', borderRadius: 12, border: 'none',
                    background: importing ? '#94a3b8' : 'linear-gradient(135deg, #16a34a, #15803d)',
                    color: '#fff', fontSize: 14, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: "'Poppins', sans-serif"
                  }}
                >
                  {importing ? (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Importing...</>
                  ) : (
                    <><CheckCircle size={14} /> Import {importPreview.filter(r => r.valid).length} Valid Lead{importPreview.filter(r => r.valid).length !== 1 ? 's' : ''}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.92) translateY(24px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </AdminLayout>
  );
}

/* ── Reusable sub-components ── */
function SectionHeader({ icon, bg, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function FieldGroup({ label, icon, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <div style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1, display: 'flex', alignItems: 'center' }}>
            {icon}
          </div>
        )}
        {React.cloneElement(children, {
          style: { ...children.props.style, paddingLeft: icon ? 34 : 14 },
          onFocus: e => { e.target.style.borderColor = '#f97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.12)'; e.target.style.background = '#fff'; },
          onBlur:  e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#fafbfc'; }
        })}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px'
};

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid #e2e8f0', outline: 'none', fontSize: 13,
  fontFamily: "'Inter', sans-serif", transition: 'border-color 0.18s, box-shadow 0.18s, background 0.18s',
  background: '#fafbfc', boxSizing: 'border-box', color: '#0f172a'
};
