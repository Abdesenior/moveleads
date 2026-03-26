import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Home, MapPin, User, CheckCircle, Truck, Calendar } from 'lucide-react';
import AddressAutocomplete from '../components/AddressAutocomplete';
import '../components/AddressAutocomplete.css';
import './GetQuote.css';

// ─── Client-side Zod schemas ───────────────────────────────────────────────
const step1Schema = z.object({
  homeSize: z.enum(['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom'], {
    errorMap: () => ({ message: 'Please select your home size' })
  }),
  moveDate: z
    .string({ required_error: 'Move date is required' })
    .min(1, 'Move date is required')
    .refine(d => new Date(d) > new Date(), { message: 'Move date must be in the future' })
});

// Step 2 validates zips stored in component state (not RHF fields),
// so we use a simple pass-through schema and validate manually on submit.
const step2Schema = z.object({});

const step3Schema = z.object({
  customerName: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters'),
  customerEmail: z
    .string({ required_error: 'Email is required' })
    .email('Must be a valid email address'),
  customerPhone: z
    .string({ required_error: 'Phone is required' })
    .transform(v => v.replace(/\D/g, ''))
    .pipe(z.string().length(10, 'Must be a 10-digit phone number'))
});

const STEPS = [
  { id: 1, label: 'Move Details', icon: Home },
  { id: 2, label: 'Locations',    icon: MapPin },
  { id: 3, label: 'Your Info',    icon: User }
];

const HOME_SIZES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom'];
const SCHEMA_MAP = { 1: step1Schema, 2: step2Schema, 3: step3Schema };

export default function GetQuote() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Step 2 address state — lives outside RHF so AddressAutocomplete controls it
  const [origin, setOrigin]      = useState({ address: '', zip: '', city: '', state: '' });
  const [dest,   setDest]        = useState({ address: '', zip: '', city: '', state: '' });
  const [addrErrors, setAddrErrors] = useState({ origin: '', dest: '' });

  const _base = import.meta.env.VITE_API_URL || 'http://localhost:5005';
  const API_URL = _base.endsWith('/api') ? _base : `${_base}/api`;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(SCHEMA_MAP[step]),
    mode: 'onChange',
    defaultValues: formData
  });

  const homeSize = watch('homeSize');

  const onOriginSelect = useCallback((place) => {
    setOrigin(place);
    setAddrErrors(prev => ({ ...prev, origin: place.zip ? '' : prev.origin }));
  }, []);

  const onDestSelect = useCallback((place) => {
    setDest(place);
    setAddrErrors(prev => ({ ...prev, dest: place.zip ? '' : prev.dest }));
  }, []);

  // Validate Step 2 manually before advancing
  const validateStep2 = () => {
    const errs = { origin: '', dest: '' };
    if (!origin.zip) errs.origin = 'Please select a valid origin address';
    if (!dest.zip)   errs.dest   = 'Please select a valid destination address';
    setAddrErrors(errs);
    return !errs.origin && !errs.dest;
  };

  const onStepSubmit = (data) => {
    if (step === 2) {
      if (!validateStep2()) return;
      const merged = {
        ...formData,
        originZip:       origin.zip,
        originCity:      origin.city || `Area ${origin.zip}`,
        originAddress:   origin.address,
        destinationZip:  dest.zip,
        destinationCity: dest.city || `Area ${dest.zip}`,
        destAddress:     dest.address
      };
      setFormData(merged);
      setStep(3);
      return;
    }

    const merged = { ...formData, ...data };
    setFormData(merged);

    if (step < 3) {
      setStep(step + 1);
    } else {
      submitLead(merged);
    }
  };

  // Step 2 "Continue" bypasses handleSubmit — intercept it
  const handleContinue = step === 2
    ? (e) => { e.preventDefault(); onStepSubmit({}); }
    : handleSubmit(onStepSubmit);

  const submitLead = async (data) => {
    setSubmitting(true);
    setServerError('');

    const isLocal = data.originZip.substring(0, 3) === data.destinationZip.substring(0, 3);

    const payload = {
      customerName:        data.customerName,
      customerEmail:       data.customerEmail,
      customerPhone:       data.customerPhone.replace(/\D/g, ''),
      originZip:           data.originZip,
      destinationZip:      data.destinationZip,
      originCity:          data.originCity,
      destinationCity:     data.destinationCity,
      homeSize:            data.homeSize,
      moveDate:            new Date(data.moveDate).toISOString(),
      distance:            isLocal ? 'Local' : 'Long Distance',
      specialInstructions: ''
    };

    try {
      const res = await fetch(`${API_URL}/api/leads/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Something went wrong. Please try again.');
      navigate('/thank-you', { state: { homeSize: data.homeSize, originZip: data.originZip, destZip: data.destinationZip } });
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  // Distance badge for Step 2
  const distanceBadge = origin.zip && dest.zip
    ? origin.zip.substring(0, 3) === dest.zip.substring(0, 3)
      ? <span className="gq-dist-tag gq-dist-tag--local">📍 Local Move</span>
      : <span className="gq-dist-tag gq-dist-tag--long">🚚 Long Distance Move</span>
    : null;

  return (
    <div className="gq-page">
      <nav className="gq-nav">
        <Link to="/" className="gq-logo">MoveLeads<span>.io</span></Link>
        <span className="gq-nav-tag">Free · No Obligation</span>
      </nav>

      <div className="gq-container">
        {/* ── Left panel ── */}
        <aside className="gq-aside">
          <div className="gq-aside-badge">Trusted by 500+ movers</div>
          <h2 className="gq-aside-heading">Get up to 3 free moving quotes in minutes</h2>
          <ul className="gq-trust-list">
            <li><CheckCircle size={16} /><span>100% free, no hidden fees</span></li>
            <li><CheckCircle size={16} /><span>Verified, licensed moving companies</span></li>
            <li><CheckCircle size={16} /><span>Compare prices &amp; choose the best fit</span></li>
            <li><CheckCircle size={16} /><span>Movers contact you — no cold calls</span></li>
          </ul>
          <div className="gq-aside-reviews">
            <div className="gq-stars">★★★★★</div>
            <p className="gq-review-text">"Saved me $400 on my move to Austin. Took 2 minutes to fill out."</p>
            <span className="gq-reviewer">— Sarah K., Dallas TX</span>
          </div>
        </aside>

        {/* ── Form card ── */}
        <div className="gq-card">
          {/* Step indicators */}
          <div className="gq-steps">
            {STEPS.map(s => {
              const Icon = s.icon;
              const state = s.id < step ? 'done' : s.id === step ? 'active' : 'idle';
              return (
                <div key={s.id} className={`gq-step gq-step--${state}`}>
                  <div className="gq-step-circle">
                    {s.id < step ? <CheckCircle size={14} /> : <Icon size={14} />}
                  </div>
                  <span className="gq-step-label">{s.label}</span>
                </div>
              );
            })}
            <div className="gq-step-track">
              <div className="gq-step-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <form onSubmit={handleContinue} noValidate>
            {/* ══ Step 1: Move Details ══ */}
            {step === 1 && (
              <div className="gq-step-body">
                <h3 className="gq-step-title">Tell us about your move</h3>
                <p className="gq-step-sub">We'll match you with movers who specialise in your home size.</p>

                <label className="gq-label">What size is your home?</label>
                <div className="gq-size-grid">
                  {HOME_SIZES.map(size => (
                    <button
                      key={size}
                      type="button"
                      className={`gq-size-btn ${homeSize === size ? 'gq-size-btn--selected' : ''}`}
                      onClick={() => setValue('homeSize', size, { shouldValidate: true })}
                    >
                      <Truck size={18} />
                      <span>{size}</span>
                    </button>
                  ))}
                </div>
                <input type="hidden" {...register('homeSize')} />
                {errors.homeSize && <p className="gq-error">{errors.homeSize.message}</p>}

                <label className="gq-label" style={{ marginTop: 24 }}>
                  <Calendar size={15} style={{ display: 'inline', marginRight: 6 }} />
                  Planned move date
                </label>
                <input
                  type="date"
                  className={`gq-input ${errors.moveDate ? 'gq-input--error' : ''}`}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  {...register('moveDate')}
                />
                {errors.moveDate && <p className="gq-error">{errors.moveDate.message}</p>}
              </div>
            )}

            {/* ══ Step 2: Locations (AddressAutocomplete) ══ */}
            {step === 2 && (
              <div className="gq-step-body">
                <h3 className="gq-step-title">Where are you moving?</h3>
                <p className="gq-step-sub">Search your full address — we'll extract the zip code automatically.</p>

                <div className="gq-field">
                  <label className="gq-label">
                    <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} />
                    Moving from
                  </label>
                  <AddressAutocomplete
                    placeholder="Search origin address…"
                    onSelect={onOriginSelect}
                    error={addrErrors.origin}
                  />
                </div>

                <div className="gq-field">
                  <label className="gq-label">
                    <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} />
                    Moving to
                  </label>
                  <AddressAutocomplete
                    placeholder="Search destination address…"
                    onSelect={onDestSelect}
                    error={addrErrors.dest}
                  />
                </div>

                {distanceBadge && (
                  <div className="gq-distance-hint">{distanceBadge}</div>
                )}
              </div>
            )}

            {/* ══ Step 3: Contact Info ══ */}
            {step === 3 && (
              <div className="gq-step-body">
                <h3 className="gq-step-title">Almost done — who should movers contact?</h3>
                <p className="gq-step-sub">Your info is shared only with vetted, licensed movers.</p>

                <div className="gq-field">
                  <label className="gq-label">Full name</label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    className={`gq-input ${errors.customerName ? 'gq-input--error' : ''}`}
                    {...register('customerName')}
                    autoComplete="name"
                  />
                  {errors.customerName && <p className="gq-error">{errors.customerName.message}</p>}
                </div>

                <div className="gq-field">
                  <label className="gq-label">Email address</label>
                  <input
                    type="email"
                    placeholder="jane@example.com"
                    className={`gq-input ${errors.customerEmail ? 'gq-input--error' : ''}`}
                    {...register('customerEmail')}
                    autoComplete="email"
                  />
                  {errors.customerEmail && <p className="gq-error">{errors.customerEmail.message}</p>}
                </div>

                <div className="gq-field">
                  <label className="gq-label">Phone number</label>
                  <input
                    type="tel"
                    placeholder="(555) 867-5309"
                    className={`gq-input ${errors.customerPhone ? 'gq-input--error' : ''}`}
                    {...register('customerPhone')}
                    autoComplete="tel"
                  />
                  {errors.customerPhone && <p className="gq-error">{errors.customerPhone.message}</p>}
                </div>

                {serverError && <div className="gq-server-error">{serverError}</div>}

                <p className="gq-privacy">
                  By submitting, you agree to our{' '}
                  <Link to="/privacy" target="_blank">Privacy Policy</Link>.
                  We never sell your information.
                </p>
              </div>
            )}

            {/* ── Navigation ── */}
            <div className="gq-nav-row">
              {step > 1 && (
                <button type="button" className="gq-btn-back" onClick={() => setStep(s => s - 1)}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
              <button type="submit" className="gq-btn-next" disabled={submitting}>
                {submitting
                  ? <span className="gq-spinner" />
                  : step < 3
                    ? <>Continue <ArrowRight size={16} /></>
                    : <>Get My Free Quotes <CheckCircle size={16} /></>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
