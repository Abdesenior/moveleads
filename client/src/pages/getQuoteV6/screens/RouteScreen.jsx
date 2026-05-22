// client/src/pages/getQuoteV6/screens/RouteScreen.jsx
import { useCallback, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import FieldInput from '../components/FieldInput';
import PrimaryButton from '../components/PrimaryButton';
import HowCard from '../components/HowCard';
import RoutePreviewMoment from './RoutePreviewMoment';
import useMedia from '../useMedia';

const HERO_IMAGE = '/hero-family-truck.webp';

const HOW_IT_WORKS = [
  { n: '1', t: 'Tell us about your move', s: 'Takes about 60 seconds.', icon: 'doc', emphasis: true },
  { n: '2', t: 'We match you with vetted movers', s: 'Based on your route and move type.', icon: 'users' },
  { n: '3', t: 'Compare quotes confidently', s: 'No obligation.', icon: 'phone' },
];

// ── Mobile landing ──────────────────────────────────────────
function RouteScreenMobile({
  answers, handlePickup, handleDest, canSubmit, onContinue,
  pickupErr, destErr, sameZip, enrichmentFailed,
}) {
  return (
    <div className="screen-enter" style={{ background: 'var(--bg-white)', minHeight: '100%' }}>
      {/* Hero photo (Logo overlays top-left) */}
      <div style={{ padding: '52px 16px 0' }}>
        <div style={{
          position: 'relative',
          height: 156,
          borderRadius: 16, overflow: 'hidden',
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: '55% 32%',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(2,8,20,0) 50%, rgba(2,8,20,0.55) 100%)',
          }} />
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 2,
          }}>
            <Logo size={19} light />
          </div>
          <div style={{
            position: 'absolute', left: 14, bottom: 12,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 9px 4px 6px',
            background: 'rgba(255,255,255,0.16)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 999,
            fontSize: 10.5, fontWeight: 600, color: 'white', letterSpacing: '0.02em',
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'var(--accent)', color: 'white',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="shield" size={8} stroke={2.6} />
            </span>
            Licensed movers only
          </div>
        </div>
      </div>

      {/* Form block */}
      <div style={{ padding: '18px 24px 6px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 7,
        }}>Free quote · 60 seconds</div>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 700,
          letterSpacing: '-0.025em', lineHeight: 1.18,
          color: 'var(--primary)',
        }}>Where are you moving?</h1>
        <p style={{
          margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--text-secondary)', textWrap: 'pretty',
        }}>
          Two ZIPs to start. <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Compare before booking.</span>
        </p>
      </div>

      {/* Inputs stacked */}
      <div style={{ padding: '14px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <FieldInput
          icon="pin" label="From"
          placeholder="ZIP code"
          value={answers.pickupZip}
          onChange={handlePickup}
          maxLength={5} autoFocus
          error={pickupErr}
        />
        <FieldInput
          icon="pin" label="To"
          placeholder="ZIP code"
          value={answers.destinationZip}
          onChange={handleDest}
          maxLength={5}
          error={destErr}
        />

        {sameZip && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', fontWeight: 500, padding: '0 2px' }}>
            Pickup and drop-off ZIPs can't be the same.
          </div>
        )}
        {enrichmentFailed && !sameZip && answers.pickupZip.length === 5 && answers.destinationZip.length === 5 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500, padding: '0 2px' }}>
            We couldn't calculate the route right now, but you can still continue.
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 24px 8px' }}>
        <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
          Continue
        </PrimaryButton>
      </div>

      {/* Reassurance row */}
      <div style={{
        padding: '4px 24px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
        fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500,
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="check" size={12} color="var(--accent)" stroke={2.4} />
          No spam calls
        </span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-strong)' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="shield" size={12} color="var(--accent)" stroke={2} />
          Licensed only
        </span>
      </div>

      {/* How it works */}
      <div style={{ padding: '22px 24px 32px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10,
        }}>How it works</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {HOW_IT_WORKS.map((h) => <HowCard key={h.n} h={h} compact />)}
        </div>
      </div>
    </div>
  );
}

// ── Desktop landing ─────────────────────────────────────────
function RouteScreenDesktop({
  answers, handlePickup, handleDest, canSubmit, onContinue,
  pickupErr, destErr, sameZip, enrichmentFailed,
}) {
  return (
    <div className="screen-enter" style={{ background: 'var(--bg-white)' }}>
      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '45fr 55fr', minHeight: 760 }}>
        {/* Left — photo hero (Logo overlays top-left) */}
        <div style={{
          position: 'relative',
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: '58% 38%',
          color: 'white',
          padding: '88px 60px 44px',
          display: 'flex', flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
          minHeight: 760,
        }}>
          {/* Logo overlay */}
          <div style={{
            position: 'absolute', top: 32, left: 36, zIndex: 3,
          }}>
            <Logo size={24} light />
          </div>
          {/* Overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: [
              'linear-gradient(96deg, rgba(2,8,20,0.78) 0%, rgba(2,8,20,0.55) 32%, rgba(2,8,20,0.22) 62%, rgba(2,8,20,0.06) 100%)',
              'linear-gradient(180deg, rgba(2,8,20,0.05) 0%, rgba(2,8,20,0.18) 30%, rgba(2,8,20,0.18) 70%, rgba(2,8,20,0.6) 100%)',
            ].join(', '),
          }} />

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            boxShadow: 'inset 0 0 200px 60px rgba(2,8,20,0.35)',
          }} />

          {/* Warm radial focal */}
          <div style={{
            position: 'absolute', top: '42%', left: '60%', width: 540, height: 540,
            pointerEvents: 'none', transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(255,210,160,0.22) 0%, rgba(255,210,160,0) 60%)',
            mixBlendMode: 'screen',
          }} />

          {/* Warm corner glow */}
          <div style={{
            position: 'absolute', top: -120, right: -120, width: 360, height: 360, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0) 70%)',
          }} />

          {/* Headline + trust cards */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
            <div style={{ maxWidth: 420 }}>
              <h2 style={{
                margin: 0, fontSize: 40, fontWeight: 800,
                letterSpacing: '-0.03em', lineHeight: 1.04,
                color: 'white', textWrap: 'balance',
                textShadow: '0 2px 22px rgba(2,8,20,0.55)',
              }}>
                Find trusted movers without <span style={{
                  color: 'var(--accent)',
                  textShadow: '0 2px 18px rgba(249,115,22,0.4)',
                }}>overpaying.</span>
              </h2>
              <p style={{
                margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.55,
                color: 'rgba(255,255,255,0.92)', maxWidth: 360, textWrap: 'pretty',
                textShadow: '0 1px 10px rgba(2,8,20,0.4)',
              }}>
                Tell us about your move once — matched movers reach out with quotes. No spam. No pressure.
              </p>
            </div>

            {/* Trust cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
              {[
                { icon: 'shield', title: 'Vetted & licensed movers', sub: 'We work only with trusted pros.' },
                { icon: 'lock', title: 'Your info is never sold', sub: 'No spam or endless calls.' },
                { icon: 'phone', title: 'Movers matched to your route', sub: 'Real local crews, real quotes.' },
              ].map((t) => (
                <div key={t.title} style={{
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: '10px 13px',
                  background: 'rgba(255,255,255,0.045)',
                  backdropFilter: 'blur(14px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 11,
                  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: 'rgba(249,115,22,0.16)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={t.icon} size={12} stroke={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'white', letterSpacing: '-0.005em' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1, lineHeight: 1.35 }}>{t.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Trust strip bottom */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
            }}>Trusted by movers nationwide</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 500 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="lock" size={13} color="var(--accent)" stroke={2} />
                Secure submission
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="shield" size={13} color="var(--accent)" stroke={2} />
                Licensed only
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={13} color="var(--accent)" stroke={2.4} />
                No obligation
              </span>
            </div>
          </div>
        </div>

        {/* Right — form */}
        <div style={{
          position: 'relative',
          padding: '60px 64px 56px',
          background: 'var(--bg-white)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(120% 80% at 100% 0%, rgba(249,115,22,0.04) 0%, rgba(255,255,255,0) 55%)',
          }} />
          <div style={{ position: 'relative', maxWidth: 440 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--accent)',
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10,
            }}>Free quote · 60 seconds</div>
            <h1 style={{
              margin: 0, fontSize: 30, fontWeight: 700,
              letterSpacing: '-0.025em', lineHeight: 1.12,
              color: 'var(--primary)',
            }}>Where are you moving?</h1>
            <p style={{
              margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.55,
              color: 'var(--text-secondary)', maxWidth: 400, textWrap: 'pretty',
            }}>
              Two ZIPs to start — matched movers reach out with quotes. <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Compare before booking, no obligation.</span>
            </p>

            <div style={{
              marginTop: 22,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              alignItems: 'end',
            }}>
              <div style={{ minWidth: 0 }}>
                <FieldInput
                  icon="pin" label="Moving from"
                  placeholder="ZIP code"
                  value={answers.pickupZip}
                  onChange={handlePickup}
                  maxLength={5} autoFocus
                  error={pickupErr}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <FieldInput
                  icon="pin" label="Moving to"
                  placeholder="ZIP code"
                  value={answers.destinationZip}
                  onChange={handleDest}
                  maxLength={5}
                  error={destErr}
                />
              </div>
            </div>

            {sameZip && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--danger)', fontWeight: 500 }}>
                Pickup and drop-off ZIPs can't be the same.
              </div>
            )}
            {enrichmentFailed && !sameZip && answers.pickupZip.length === 5 && answers.destinationZip.length === 5 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500 }}>
                We couldn't calculate the route right now, but you can still continue.
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
                Continue
              </PrimaryButton>
            </div>

            {/* Reassurance row */}
            <div style={{
              marginTop: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500,
              flexWrap: 'wrap',
            }}>
              {[
                { i: 'check', t: 'No spam calls' },
                { i: 'lock', t: 'Compare before booking' },
                { i: 'shield', t: 'Movers contact you' },
              ].map((r) => (
                <span key={r.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={r.i} size={13} color="var(--accent)" stroke={2.2} />
                  {r.t}
                </span>
              ))}
            </div>

            {/* How it works */}
            <div style={{ marginTop: 40 }}>
              <div style={{
                fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14,
              }}>How it works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {HOW_IT_WORKS.map((h) => <HowCard key={h.n} h={h} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RouteScreen({ answers, patch, onContinue }) {
  const desktop = useMedia('(min-width: 1100px)');
  const [pickupErr, setPickupErr] = useState('');
  const [destErr, setDestErr] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichmentFailed, setEnrichmentFailed] = useState(false);
  // Internal-state preview: clicking Continue on the ZIP form enters the
  // preview moment without leaving the ROUTE orchestrator node. Amendment A:
  // RoutePreviewMoment receives `answers` only, never writes to them.
  const [previewShown, setPreviewShown] = useState(false);

  // Lazy ZIP-to-city/state via free zippopotam.us (no auth, generous limits).
  // Mirrors the existing GetQuoteV6.jsx enrich logic (lines 454-481).
  const enrich = useCallback(async (zip, side) => {
    if (!/^\d{5}$/.test(zip)) return;
    setEnriching(true);
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!res.ok) throw new Error('zip not found');
      const json = await res.json();
      const place = json.places && json.places[0];
      if (!place) throw new Error('no place');
      const city = place['place name'];
      const state = place['state abbreviation'];
      if (side === 'pickup') {
        patch({ originCity: city, originState: state });
      } else {
        patch({ destinationCity: city, destinationState: state });
      }
      setEnrichmentFailed(false);
    } catch {
      if (side === 'pickup') patch({ originCity: '', originState: '' });
      else patch({ destinationCity: '', destinationState: '' });
      setEnrichmentFailed(true);
    } finally {
      setEnriching(false);
    }
  }, [patch]);

  const handlePickup = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ pickupZip: cleaned });
    setPickupErr('');
    if (cleaned.length === 5) enrich(cleaned, 'pickup');
  };
  const handleDest = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ destinationZip: cleaned });
    setDestErr('');
    if (cleaned.length === 5) enrich(cleaned, 'dest');
  };

  const sameZip = answers.pickupZip.length === 5
    && answers.destinationZip.length === 5
    && answers.pickupZip === answers.destinationZip;

  const canContinue = answers.pickupZip.length === 5
    && answers.destinationZip.length === 5
    && !sameZip
    && !enriching;

  const handleContinue = () => {
    if (answers.pickupZip.length !== 5) {
      setPickupErr("We couldn't find that ZIP. Please check it and try again.");
      return;
    }
    if (answers.destinationZip.length !== 5) {
      setDestErr("We couldn't find that ZIP. Please check it and try again.");
      return;
    }
    if (sameZip) {
      setDestErr("Pickup and drop-off ZIPs can't be the same.");
      return;
    }
    // Enter preview moment first — orchestrator stays on ROUTE node.
    setPreviewShown(true);
  };

  if (previewShown) {
    return <RoutePreviewMoment answers={answers} onContinue={onContinue} desktop={desktop} />;
  }

  const layoutProps = {
    answers,
    handlePickup,
    handleDest,
    canSubmit: canContinue,
    onContinue: handleContinue,
    pickupErr,
    destErr,
    sameZip,
    enrichmentFailed,
  };

  return desktop
    ? <RouteScreenDesktop {...layoutProps} />
    : <RouteScreenMobile {...layoutProps} />;
}
