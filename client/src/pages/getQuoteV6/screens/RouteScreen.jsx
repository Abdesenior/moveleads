// client/src/pages/getQuoteV6/screens/RouteScreen.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import Logo, { LogoMark } from '../components/Logo';
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
      background: '#ffffff',
      minHeight: '100%',
    }}>
      {/* Editorial block — logo, eyebrow, headline, paragraph. All on clean white. */}
      <div style={{ padding: '44px 24px 14px' }}>
        <LogoMark size={42} />
        <div style={{
          marginTop: 22,
          fontSize: 11, fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          marginBottom: 16,
        }}>Moving made simple</div>
        <h1 style={{
          margin: 0,
          fontSize: 30, fontWeight: 800,
          letterSpacing: '-0.025em', lineHeight: 1.14,
          color: 'var(--primary)',
        }}>
          Find trusted movers —<br />
          without <span style={{ color: 'var(--accent)' }}>overpaying.</span>
        </h1>
        <p style={{
          margin: '18px 0 0', fontSize: 15, lineHeight: 1.55,
          color: 'var(--text-secondary)', textWrap: 'pretty',
          maxWidth: 340,
        }}>
          Tell us where you're moving. We'll help you take the next step.
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
          isValid={answers.pickupZip.length === 5 && !!answers.originCity}
        />
        <FieldInput
          icon="pin" label="To"
          placeholder="ZIP code"
          value={answers.destinationZip}
          onChange={handleDest}
          maxLength={5}
          error={destErr}
          isValid={answers.destinationZip.length === 5 && !!answers.destinationCity && !sameZip}
        />

        {sameZip && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', fontWeight: 500, padding: '0 2px' }}>
            Pickup and drop-off ZIPs can't be the same.
          </div>
        )}
        {enrichmentFailed && !sameZip && answers.pickupZip.length === 5 && answers.destinationZip.length === 5 && (
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500, padding: '0 2px' }}>
            We couldn't verify one of these ZIPs. Double-check and try again.
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
      {/* Two columns — matched to DesktopShellLayout proportions so the
          sidebar doesn't visually jump when the user advances from the
          landing into the funnel steps. Width and padding mirror the
          340px / 48px 28px values used by the shared shell. */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', minHeight: '100vh' }}>
        {/* Left — photo hero (Logo overlays top-left) */}
        <div style={{
          position: 'relative',
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: '72% 55%',
          color: 'white',
          padding: '48px 28px 48px',
          display: 'flex', flexDirection: 'column',
          gap: 0,
          overflow: 'hidden',
          minHeight: '100vh',
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

          {/* Logo + Headline + trust cards — stack from the top. flex: 1
              still claims remaining vertical space so the trust strip
              below this block remains pinned at the column bottom. */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 32 }}>
            <Logo size={26} />
            <div style={{ maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 26 }}>
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
                margin: 0, fontSize: 14, lineHeight: 1.6,
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

        {/* Right — form. Top-anchored so the card sits where the eye
            expects it. The warm halo is anchored higher (top: 32%) to
            stay behind the card instead of pooling in the lower half.
            Horizontal padding (40px) keeps the card breathing without
            surrounding it with so much whitespace that it stops feeling
            dominant in the column. The card's own internal padding
            (~44px 48px) supplies the rest of the visual cushion. */}
        <div style={{
          position: 'relative',
          padding: '80px 40px 96px',
          background: 'var(--canvas)',
          backgroundImage: "url('/quote-bg-route-soft.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center',
          overflow: 'hidden',
          minHeight: '100vh',
        }}>

          {/* Subtle warm halo behind the main card */}
          <div style={{
            position: 'absolute',
            top: '32%', left: '50%', transform: 'translate(-50%, -50%)',
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
            maxWidth: 960,
            background: 'linear-gradient(180deg, #ffffff 0%, #fffdf9 100%)',
            border: '1px solid rgba(15,23,42,0.05)',
            borderRadius: 20,
            boxShadow: '0 30px 80px rgba(15,23,42,0.08), 0 10px 30px rgba(15,23,42,0.04), 0 0 0 1px rgba(255,255,255,0.6) inset, inset 0 1px 0 rgba(255,255,255,0.72)',
            padding: '44px 48px 48px',
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
              marginTop: 36,
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
                  isValid={answers.pickupZip.length === 5 && !!answers.originCity}
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
                  isValid={answers.destinationZip.length === 5 && !!answers.destinationCity && !sameZip}
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
                We couldn't verify one of these ZIPs. Double-check and try again.
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
              marginTop: 28,
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
              marginTop: 32,
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
              marginTop: 28,
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

  // Track which exact ZIP values we've already dispatched an enrichment
  // for, on each side. Prevents duplicate fetches when a ZIP arrives via
  // both a user keystroke AND the auto-enrich effect (URL prefill,
  // localStorage resume into ROUTE), and stops the auto-enrich effect
  // from looping on a ZIP that zippopotam can't resolve.
  const attemptedRef = useRef({ pickup: '', dest: '' });

  const handlePickup = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ pickupZip: cleaned });
    setPickupErr('');
    if (cleaned.length === 5) {
      attemptedRef.current.pickup = cleaned;
      enrich(cleaned, 'pickup');
    }
  };
  const handleDest = (v) => {
    const cleaned = v.replace(/\D/g, '').slice(0, 5);
    patch({ destinationZip: cleaned });
    setDestErr('');
    if (cleaned.length === 5) {
      attemptedRef.current.dest = cleaned;
      enrich(cleaned, 'dest');
    }
  };

  // Auto-enrich any ZIP that arrives without a matching city — covers
  // ?from= / ?to= URL prefill and the localStorage-resume-into-ROUTE
  // case. attemptedRef gates retries so a ZIP zippopotam can't resolve
  // is tried exactly once.
  useEffect(() => {
    if (enriching) return;
    if (
      answers.pickupZip.length === 5
      && !answers.originCity
      && attemptedRef.current.pickup !== answers.pickupZip
    ) {
      attemptedRef.current.pickup = answers.pickupZip;
      enrich(answers.pickupZip, 'pickup');
    }
    if (
      answers.destinationZip.length === 5
      && !answers.destinationCity
      && attemptedRef.current.dest !== answers.destinationZip
    ) {
      attemptedRef.current.dest = answers.destinationZip;
      enrich(answers.destinationZip, 'dest');
    }
  }, [answers.pickupZip, answers.destinationZip, answers.originCity, answers.destinationCity, enriching, enrich]);

  const sameZip = answers.pickupZip.length === 5
    && answers.destinationZip.length === 5
    && answers.pickupZip === answers.destinationZip;

  // Strict: also require successful enrichment (real US ZIPs).
  // A 5-digit number that doesn't exist as a US ZIP fails zippopotam lookup,
  // originCity/destinationCity stay empty, and the CTA stays disabled.
  const canContinue = answers.pickupZip.length === 5
    && answers.destinationZip.length === 5
    && !sameZip
    && !enriching
    && !!answers.originCity
    && !!answers.destinationCity;

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
