// client/src/pages/getQuoteV6/screens/RouteScreen.jsx
import { useCallback, useState } from 'react';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import FieldInput from '../components/FieldInput';
import PrimaryButton from '../components/PrimaryButton';
import HowCard from '../components/HowCard';
import useMedia from '../useMedia';
import RoutePreviewMoment from './RoutePreviewMoment';
import { DesktopShellLayout, DesktopRouteContext } from '../shells/DesktopShell';

const HERO_IMAGE = '/sidebar-bg-cinematic.webp';

const HOW_IT_WORKS = [
  { n: '1', t: 'Share your route', icon: 'doc', emphasis: true },
  { n: '2', t: 'Tell us about your move', icon: 'users' },
  { n: '3', t: 'Get your move started', icon: 'phone' },
];

// ── Mobile landing ──────────────────────────────────────────
function RouteScreenMobile({
  answers, handlePickup, handleDest, canSubmit, onContinue,
  pickupErr, destErr, sameZip, enrichmentFailed,
}) {
  return (
    <div className="screen-enter" style={{
      background: 'var(--bg-white)',
      backgroundImage: "url('/quote-bg-route-soft.webp')",
      backgroundSize: 'cover',
      backgroundPosition: 'center top',
      backgroundRepeat: 'no-repeat',
      minHeight: '100%',
    }}>
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
            background: 'linear-gradient(180deg, rgba(2,8,20,0) 35%, rgba(2,8,20,0.45) 75%, rgba(2,8,20,0.72) 100%)',
          }} />
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 2,
          }}>
            <Logo size={19} light />
          </div>
        </div>
      </div>

      {/* Form block */}
      <div style={{ padding: '14px 24px 6px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 7,
        }}>Moving made simple</div>
        <h1 style={{
          margin: 0, fontSize: 22, fontWeight: 700,
          letterSpacing: '-0.025em', lineHeight: 1.18,
          color: 'var(--primary)',
        }}>Plan your move in minutes.</h1>
        <p style={{
          margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--text-secondary)', textWrap: 'pretty',
        }}>
          Tell us where you're moving. <span style={{ color: 'var(--primary)', fontWeight: 600 }}>We'll help you take the next step.</span>
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
      <div style={{ padding: '10px 24px 6px' }}>
        <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
          {canSubmit ? 'Continue — see your move details' : 'Enter your route to continue'}
        </PrimaryButton>
      </div>

      {/* Reassurance line */}
      <div style={{
        padding: '8px 24px 0',
        textAlign: 'center',
        fontSize: 11.5, color: 'var(--ink-3)',
        letterSpacing: '-0.005em',
      }}>
        Secure & private · Takes less than 60 seconds
      </div>

      {/* Feature pills strip — compact 2x2 grid for mobile */}
      <div style={{
        padding: '14px 24px 0',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {[
          { icon: 'receipt', title: 'Free estimate' },
          { icon: 'heart',   title: 'No pressure' },
          { icon: 'lock',    title: 'Licensed movers' },
          { icon: 'tag',     title: 'Compare before booking' },
        ].map(f => (
          <div key={f.title} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px',
            background: 'var(--bg-white)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-sm)',
            minWidth: 0,
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              background: 'var(--accent-soft-bg)',
              color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Icon name={f.icon} size={12} stroke={2} />
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.005em', lineHeight: 1.25, minWidth: 0 }}>
              {f.title}
            </div>
          </div>
        ))}
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
  const isWideDesktop = useMedia('(min-width: 1240px)');
  return (
    <div className="screen-enter" style={{ background: 'var(--bg-white)' }}>
      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', minHeight: 760 }}>
        {/* Left — photo hero (Logo overlays top-left) */}
        <div style={{
          position: 'relative',
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: '72% 55%',
          color: 'white',
          padding: '72px 44px 72px',
          display: 'flex', flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
          minHeight: 760,
        }}>
          {/* Overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: [
              'linear-gradient(96deg, rgba(2,8,20,0.72) 0%, rgba(2,8,20,0.52) 35%, rgba(2,8,20,0.28) 65%, rgba(2,8,20,0.12) 100%)',
              'linear-gradient(180deg, rgba(2,8,20,0.10) 0%, rgba(2,8,20,0.18) 30%, rgba(2,8,20,0.20) 70%, rgba(2,8,20,0.42) 100%)',
            ].join(', '),
          }} />

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            boxShadow: 'inset 0 0 200px 60px rgba(2,8,20,0.35)',
          }} />

          {/* Warm radial focal */}
          <div style={{
            position: 'absolute', top: '42%', left: '60%', width: 380, height: 380,
            pointerEvents: 'none', transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(255,210,160,0.12) 0%, rgba(255,210,160,0) 65%)',
            mixBlendMode: 'screen',
          }} />

          {/* Warm corner glow */}
          <div style={{
            position: 'absolute', top: -90, right: -90, width: 260, height: 260, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 70%)',
          }} />

          {/* Headline + trust cards */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 58 }}>
            <div style={{ maxWidth: 300 }}>
              <h2 style={{
                margin: 0, fontSize: 36, fontWeight: 700,
                letterSpacing: '-0.025em', lineHeight: 1.08,
                color: 'white', textWrap: 'balance',
                textShadow: '0 2px 22px rgba(2,8,20,0.55)',
              }}>
                Find trusted movers without <span style={{
                  color: 'var(--accent)',
                  textShadow: '0 2px 18px rgba(249,115,22,0.4)',
                }}>overpaying.</span>
              </h2>
              <p style={{
                margin: '26px 0 0', fontSize: 14, lineHeight: 1.6,
                color: 'rgba(255,255,255,0.78)', maxWidth: 300, textWrap: 'pretty',
                textShadow: '0 1px 10px rgba(2,8,20,0.4)',
              }}>
                Skip the endless calls. We'll help you plan your move and compare trusted movers — at your own pace.
              </p>
            </div>

            {/* Trust cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 320 }}>
              {[
                { icon: 'shield', title: 'Trusted movers near your route', sub: 'Vetted, licensed, and local.' },
                { icon: 'lock', title: 'Less calling, less stress', sub: 'We help narrow the search.' },
                { icon: 'phone', title: 'Compare before you book', sub: 'At your own pace, no pressure.' },
              ].map((t) => (
                <div key={t.title} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '15px 18px',
                  background: 'rgba(255,245,235,0.05)',
                  backdropFilter: 'blur(24px) saturate(165%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(165%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 13,
                  boxShadow: '0 1px 0 rgba(255,235,210,0.06) inset, 0 10px 28px -10px rgba(2,8,20,0.30), 0 2px 4px rgba(2,8,20,0.06)',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(249,115,22,0.18)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={t.icon} size={13} stroke={2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'white', letterSpacing: '-0.005em', lineHeight: 1.3 }}>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 3, lineHeight: 1.4 }}>{t.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Minimal trust anchor — light row of 3 icons */}
          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
            gap: 14, flexWrap: 'wrap',
            fontSize: 11, fontWeight: 600,
            color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.02em',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="lock" size={12} color="rgba(255,255,255,0.55)" stroke={2} />
              Secure
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="shield" size={12} color="rgba(255,255,255,0.55)" stroke={2} />
              Licensed
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="check" size={12} color="rgba(255,255,255,0.55)" stroke={2.4} />
              No pressure
            </span>
          </div>

        </div>

        {/* Right — form */}
        <div style={{
          position: 'relative',
          padding: '64px 40px 72px',
          background: 'var(--canvas)',
          backgroundImage: "url('/quote-bg-route-soft.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden',
          minHeight: 760,
        }}>

          {/* Subtle warm halo behind the main card */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '80%', height: '70%',
            pointerEvents: 'none',
            background: 'radial-gradient(ellipse at center, rgba(255,237,213,0.4) 0%, rgba(255,237,213,0) 70%)',
            filter: 'blur(40px)',
            zIndex: 0,
          }} />

          {/* Premium card */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 760,
            background: 'linear-gradient(180deg, #ffffff 0%, #fffdf9 100%)',
            border: '1px solid rgba(15,23,42,0.05)',
            borderRadius: 20,
            boxShadow: '0 30px 80px rgba(15,23,42,0.08), 0 10px 30px rgba(15,23,42,0.04), 0 0 0 1px rgba(255,255,255,0.6) inset, inset 0 1px 0 rgba(255,255,255,0.72)',
            padding: '44px 48px 40px',
          }}>
            {/* Eyebrow — sans, operational kicker */}
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              marginBottom: 16,
            }}>Moving made simple</div>
            {/* Hero headline — pure sans bold, no serif accent */}
            <h1 style={{
              margin: 0,
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: '-0.025em', lineHeight: 1.08,
              color: 'var(--primary)',
            }}>
              Plan your move in minutes.
            </h1>
            <p style={{
              margin: '16px 0 0', fontSize: 15, lineHeight: 1.55,
              color: 'var(--text-secondary)', maxWidth: 520,
            }}>
              Tell us where you're moving. We'll help you take the next step
              <br />
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                — no calling around, no pressure.
              </span>
            </p>

            {/* ZIP row with 44px circular route connector */}
            <div style={{
              marginTop: 32,
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: 16,
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
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'var(--accent-soft-bg)',
                color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(249,115,22,0.15)',
                boxShadow: '0 6px 16px -6px rgba(249,115,22,0.28), 0 1px 2px rgba(15,23,42,0.05)',
                marginBottom: 11,
                flexShrink: 0,
              }}>
                <Icon name="arrow" size={15} stroke={2.4} />
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

            {/* CTA — soft orange glow underneath when active */}
            <div style={{ marginTop: 24, position: 'relative' }}>
              {canSubmit && (
                <div style={{
                  position: 'absolute',
                  top: '20%', left: '10%', right: '10%', bottom: 0,
                  background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 70%)',
                  pointerEvents: 'none',
                  filter: 'blur(8px)',
                }} />
              )}
              <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
                {canSubmit ? 'Continue — see your move details' : 'Enter your route to continue'}
              </PrimaryButton>
            </div>

            {/* Reassurance line with lock icon */}
            <div style={{
              marginTop: 8, textAlign: 'center',
              fontSize: 13,
              color: 'var(--text-secondary)',
              letterSpacing: '0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Icon name="lock" size={12} color="var(--text-secondary)" stroke={2} />
              Secure &amp; private · Takes less than 60 seconds
            </div>

            {/* Feature pills strip — 4 items inside a single bordered container */}
            <div style={{
              marginTop: 24,
              padding: '16px 18px',
              background: 'var(--bg-white)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-sm)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 18,
            }}>
              {[
                { icon: 'receipt', title: 'Free estimate',         sub: "It's 100% free" },
                { icon: 'heart',   title: 'No pressure',            sub: "Decide when you're ready" },
                { icon: 'lock',    title: 'Licensed movers',        sub: 'Vetted & insured' },
                { icon: 'tag',     title: 'Compare before booking', sub: 'At your own pace' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: 'var(--accent-soft-bg)',
                    color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon name={f.icon} size={14} stroke={2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.005em', lineHeight: 1.2 }}>
                      {f.title}
                    </div>
                    {isWideDesktop && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: 1 }}>
                        {f.sub}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Section header — small caps flanked by thin rules */}
            <div style={{
              marginTop: 28,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <div style={{
                fontSize: 11.5, fontWeight: 700,
                color: 'var(--text-secondary)',
                letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>How it works</div>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>

            {/* 3 steps with icon chips + number badges */}
            <div style={{
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 20,
            }}>
              {HOW_IT_WORKS.map((h) => (
                <div key={h.n} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: 0,
                }}>
                  {/* Icon chip with number badge */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: h.emphasis ? 'var(--accent-soft-bg)' : 'var(--bg-soft)',
                      color: h.emphasis ? 'var(--accent)' : 'var(--text-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={h.icon} size={18} stroke={1.8} />
                    </div>
                    <div style={{
                      position: 'absolute',
                      top: -4, right: -4,
                      width: 18, height: 18, borderRadius: '50%',
                      background: h.emphasis ? 'var(--accent)' : 'var(--text-secondary)',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800,
                      border: '2px solid var(--bg-white)',
                    }}>{h.n}</div>
                  </div>

                  {/* Title only — descriptions removed per B2C direction */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 700,
                      color: 'var(--primary)',
                      letterSpacing: '-0.005em', lineHeight: 1.3,
                    }}>{h.t}</div>
                  </div>
                </div>
              ))}
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
  // Internal state — controls whether the form (ZIP entry) or the dedicated
  // route preview screen is rendered. Defaults to form. Form Continue flips
  // this to true; preview Continue calls onContinue() to advance to the
  // next orchestrator node (TIMING_PIVOT).
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

  const handleFormContinue = () => {
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
    if (!canContinue) return;
    // Reveal the dedicated route preview screen. Stays on NODE.ROUTE —
    // only the preview's own Continue advances the orchestrator.
    setPreviewShown(true);
  };

  if (previewShown) {
    return desktop ? (
      <DesktopShellLayout leftContent={<DesktopRouteContext answers={answers} />}>
        <RoutePreviewMoment answers={answers} onContinue={onContinue} desktop={true} embedded />
      </DesktopShellLayout>
    ) : (
      <RoutePreviewMoment answers={answers} onContinue={onContinue} desktop={false} />
    );
  }

  const layoutProps = {
    answers,
    handlePickup,
    handleDest,
    canSubmit: canContinue,
    onContinue: handleFormContinue,
    pickupErr,
    destErr,
    sameZip,
    enrichmentFailed,
  };

  return desktop
    ? <RouteScreenDesktop {...layoutProps} />
    : <RouteScreenMobile {...layoutProps} />;
}
