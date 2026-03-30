import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { MessageSquareWarning, CheckCircle, Send, ShieldCheck } from 'lucide-react';
import MarketingLayout from '../components/MarketingLayout';

export default function Feedback() {
    const [searchParams] = useSearchParams();
    const leadId = searchParams.get('leadId');
    const companyId = searchParams.get('companyId');
    const customerName = searchParams.get('name') || '';
    const customerEmail = searchParams.get('email') || '';

    const [issueType, setIssueType] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5005').replace(/\/$/, '') + '/api';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!issueType || !description) {
            return setError('Please select an issue type and provide a description.');
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_URL}/complaints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId,
                    companyId,
                    customerName,
                    customerEmail,
                    issueType,
                    description
                })
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

    // If the link is invalid (missing IDs)
    if (!leadId || !companyId) {
        return (
            <MarketingLayout>
                <div style={{ padding: '100px 20px', textAlign: 'center', minHeight: '60vh' }}>
                    <h2 style={{ color: '#0f172a', fontFamily: "'Poppins', sans-serif" }}>Invalid Link</h2>
                    <p style={{ color: '#64748b' }}>This feedback link is missing required information or has expired.</p>
                </div>
            </MarketingLayout>
        );
    }

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
                                Thank you for letting us know. A secure internal ticket has been opened with the moving company, and they will reach out to you shortly to resolve this.
                            </p>
                            <Link to="/" style={{ display: 'inline-block', background: '#f1f5f9', color: '#0f172a', padding: '10px 20px', borderRadius: 10, fontWeight: 600, textDecoration: 'none' }}>
                                Return to Home
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div style={{ textAlign: 'center', marginBottom: 32 }}>
                                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                    <MessageSquareWarning size={28} color="#ea580c" />
                                </div>
                                <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>Report an Issue</h2>
                                <p style={{ color: '#64748b', fontSize: 14 }}>
                                    Experiencing an issue with your moving company? Let us know so we can help resolve it quickly and privately.
                                </p>
                            </div>

                            {error && (
                                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div style={{ marginBottom: 20 }}>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>What type of issue are you experiencing?</label>
                                    <select
                                        value={issueType}
                                        onChange={(e) => setIssueType(e.target.value)}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer' }}
                                    >
                                        <option value="">Select an issue type...</option>
                                        <option value="Damage">Damage to items/property</option>
                                        <option value="Lateness">Mover was late or no-show</option>
                                        <option value="Billing/Pricing">Unexpected fees or overcharging</option>
                                        <option value="Unprofessional">Unprofessional behavior</option>
                                        <option value="Other">Other issue</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: 24 }}>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Please describe what happened</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Provide as much detail as possible..."
                                        rows={5}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                    />
                                </div>

                                <button type="submit" disabled={loading} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    background: 'linear-gradient(135deg, #0a192f 0%, #1e3a5f 100%)', color: '#fff',
                                    padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                                    fontFamily: "'Poppins', sans-serif", opacity: loading ? 0.7 : 1
                                }}>
                                    <Send size={18} /> {loading ? 'Submitting...' : 'Submit Feedback'}
                                </button>

                                <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
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