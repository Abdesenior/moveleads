import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MessageSquareWarning, CheckCircle, Send, ShieldCheck, Lock } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

const INPUT_STYLE = {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none',
    background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
};
const LABEL_STYLE = {
    display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8,
};

export default function Feedback() {
    const [searchParams] = useSearchParams();
    const leadId    = searchParams.get('leadId');
    const companyId = searchParams.get('companyId');

    // Magic-link mode when both verified IDs are present
    const isLinkedMode = !!(leadId && companyId);

    const [nameVal,     setNameVal]     = useState(searchParams.get('name')  || '');
    const [emailVal,    setEmailVal]    = useState(searchParams.get('email') || '');
    const [companyName, setCompanyName] = useState('');
    const [issueType,   setIssueType]   = useState('');
    const [description, setDescription] = useState('');

    const [loading,   setLoading]   = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error,     setError]     = useState('');

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5005').replace(/\/$/, '') + '/api';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!nameVal.trim())     return setError('Please enter your name.');
        if (!emailVal.trim())    return setError('Please enter your email address.');
        if (!isLinkedMode && !companyName.trim()) return setError('Please enter the moving company name.');
        if (!issueType)          return setError('Please select an issue type.');
        if (!description.trim()) return setError('Please describe what happened.');

        setLoading(true);
        try {
            const body = {
                customerName:  nameVal.trim(),
                customerEmail: emailVal.trim().toLowerCase(),
                issueType,
                description:   description.trim(),
                ...(isLinkedMode
                    ? { leadId, companyId }
                    : { companyNameManual: companyName.trim() }),
            };

            const res  = await fetch(`${API_URL}/complaints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.msg || 'Failed to submit feedback.');
            setSubmitted(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <MarketingLayout>
            <div style={{ background: '#f8fafc', minHeight: 'calc(100vh - 66px)', padding: '60px 20px' }}>
                <div style={{ maxWidth: 540, margin: '0 auto', background: '#fff', borderRadius: 24, padding: '40px', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>

                    {submitted ? (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                                <CheckCircle size={32} color="#16a34a" />
                            </div>
                            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 12, fontFamily: "'Poppins', sans-serif" }}>Feedback Received</h2>
                            <p style={{ color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
                                Thank you for letting us know. A ticket has been opened and the moving company will be notified to resolve this with you directly.
                            </p>
                            <Link to="/" style={{ display: 'inline-block', background: '#f1f5f9', color: '#0f172a', padding: '10px 20px', borderRadius: 10, fontWeight: 600, textDecoration: 'none' }}>
                                Return to Home
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                    <MessageSquareWarning size={28} color="#ea580c" />
                                </div>
                                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>Report an Issue</h2>
                                <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
                                    Experiencing a problem with your moving company? Let us know and we'll help resolve it quickly.
                                </p>
                            </div>

                            {/* Linked-mode badge */}
                            {isLinkedMode && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 24 }}>
                                    <Lock size={13} color="#16a34a" />
                                    <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Your move details are pre-linked from your feedback invitation.</span>
                                </div>
                            )}

                            {error && (
                                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                {/* Name */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={LABEL_STYLE}>Your Name</label>
                                    {isLinkedMode && nameVal ? (
                                        <div style={{ ...INPUT_STYLE, background: '#f8fafc', color: '#475569' }}>{nameVal}</div>
                                    ) : (
                                        <input type="text" value={nameVal} onChange={e => setNameVal(e.target.value)}
                                            placeholder="Jane Smith" style={INPUT_STYLE} />
                                    )}
                                </div>

                                {/* Email */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={LABEL_STYLE}>Your Email</label>
                                    {isLinkedMode && emailVal ? (
                                        <div style={{ ...INPUT_STYLE, background: '#f8fafc', color: '#475569' }}>{emailVal}</div>
                                    ) : (
                                        <input type="email" value={emailVal} onChange={e => setEmailVal(e.target.value)}
                                            placeholder="jane@example.com" style={INPUT_STYLE} />
                                    )}
                                </div>

                                {/* Company name — manual mode only */}
                                {!isLinkedMode && (
                                    <div style={{ marginBottom: 16 }}>
                                        <label style={LABEL_STYLE}>Moving Company Name</label>
                                        <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                                            placeholder="e.g. Sunrise Movers LLC" style={INPUT_STYLE} />
                                    </div>
                                )}

                                {/* Issue type */}
                                <div style={{ marginBottom: 16 }}>
                                    <label style={LABEL_STYLE}>What type of issue are you experiencing?</label>
                                    <select value={issueType} onChange={e => setIssueType(e.target.value)}
                                        style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
                                        <option value="">Select an issue type...</option>
                                        <option value="Damage">Damage to items or property</option>
                                        <option value="Lateness">Mover was late or no-show</option>
                                        <option value="Billing/Pricing">Unexpected fees or overcharging</option>
                                        <option value="Unprofessional">Unprofessional behavior</option>
                                        <option value="Other">Other issue</option>
                                    </select>
                                </div>

                                {/* Description */}
                                <div style={{ marginBottom: 24 }}>
                                    <label style={LABEL_STYLE}>Please describe what happened</label>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                                        placeholder="Provide as much detail as possible..."
                                        rows={5} style={{ ...INPUT_STYLE, resize: 'vertical' }} />
                                </div>

                                <button type="submit" disabled={loading} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    background: 'linear-gradient(135deg,#ea580c,#c2410c)', color: '#fff',
                                    padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                                    border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: "'Poppins', sans-serif", opacity: loading ? 0.7 : 1,
                                }}>
                                    <Send size={18} /> {loading ? 'Submitting…' : 'Submit Feedback'}
                                </button>

                                <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#94a3b8', margin: '16px 0 0' }}>
                                    <ShieldCheck size={14} /> Your feedback is monitored by MoveLeads admins.
                                </p>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </MarketingLayout>
    );
}
