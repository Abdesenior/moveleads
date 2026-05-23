// client/src/pages/getQuoteV6/screens/RouteScreen.jsx
import { useCallback, useState } from 'react';
import zipcodes from 'zipcodes';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import FieldInput from '../components/FieldInput';
import PrimaryButton from '../components/PrimaryButton';
import HowCard from '../components/HowCard';
import RouteMap from '../components/RouteMap';
import useMedia from '../useMedia';
import { milesBetween } from '../route';

const HERO_IMAGE = '/hero-family-truck.webp';

const HOW_IT_WORKS = [
  { n: '1', t: 'Tell us about your move', s: 'Takes about 60 seconds.', icon: 'doc', emphasis: true },
  { n: '2', t: 'We match you with vetted movers', s: 'Based on your route and move type.', icon: 'users' },
  { n: '3', t: 'Compare quotes confidently', s: 'No obligation.', icon: 'phone' },
];

// Build a route object with lat/lng for the inline mini-preview map.
// Mirrors the helper formerly inside RoutePreviewMoment, which is no longer
// rendered in this flow but kept on disk for potential future use.
function routeFromAnswers(answers) {
  const fromLatLng = zipcodes.lookup(answers.pickupZip) || {};
  const toLatLng = zipcodes.lookup(answers.destinationZip) || {};
  const from = {
    city: answers.originCity || fromLatLng.city || '',
    st: answers.originState || fromLatLng.state || '',
    lat: fromLatLng.latitude ?? null,
    lng: fromLatLng.longitude ?? null,
  };
  const to = {
    city: answers.destinationCity || toLatLng.city || '',
    st: answers.destinationState || toLatLng.state || '',
    lat: toLatLng.latitude ?? null,
    lng: toLatLng.longitude ?? null,
  };
  const miles = answers.miles || milesBetween(from, to);
  return { from, to, miles };
}

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
            background: 'linear-gradient(180deg, rgba(2,8,20,0) 35%, rgba(2,8,20,0.45) 75%, rgba(2,8,20,0.72) 100%)',
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
      <div style={{ padding: '14px 24px 6px' }}>
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
      <div style={{ padding: '10px 24px 6px' }}>
        <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
          Continue
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
  const route = routeFromAnswers(answers);
  const routeHasCoords = route.from.lat != null && route.to.lat != null;
  return (
    <div className="screen-enter" style={{ background: 'var(--bg-white)' }}>
      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', minHeight: 760 }}>
        {/* Left — photo hero (Logo overlays top-left) */}
        <div style={{
          position: 'relative',
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: '58% 38%',
          color: 'white',
          padding: '88px 36px 44px',
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
              'linear-gradient(96deg, rgba(2,8,20,0.78) 0%, rgba(2,8,20,0.55) 32%, rgba(2,8,20,0.30) 62%, rgba(2,8,20,0.15) 100%)',
              'linear-gradient(180deg, rgba(2,8,20,0.10) 0%, rgba(2,8,20,0.22) 30%, rgba(2,8,20,0.22) 70%, rgba(2,8,20,0.65) 100%)',
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
            background: 'radial-gradient(circle, rgba(255,210,160,0.32) 0%, rgba(255,210,160,0) 60%)',
            mixBlendMode: 'screen',
          }} />

          {/* Warm corner glow */}
          <div style={{
            position: 'absolute', top: -90, right: -90, width: 260, height: 260, pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0) 70%)',
          }} />

          {/* Headline + trust cards */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
            <div style={{ maxWidth: 320 }}>
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
                color: 'rgba(255,255,255,0.92)', maxWidth: 300, textWrap: 'pretty',
                textShadow: '0 1px 10px rgba(2,8,20,0.4)',
              }}>
                Tell us about your move once — matched movers reach out with quotes. No spam. No pressure.
              </p>
            </div>

            {/* Trust cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 280 }}>
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
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 500 }}>
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
          padding: '64px 40px 72px',
          background: 'var(--canvas)',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
          overflow: 'hidden',
          minHeight: 760,
        }}>
          {/* Background depth — single warm radial top-right */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(50% 35% at 92% 8%, rgba(249,115,22,0.10) 0%, rgba(249,115,22,0) 60%)',
          }} />

          {/* Premium card */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 760,
            background: '#ffffff',
            border: '1px solid rgba(15,23,42,0.06)',
            borderRadius: 20,
            boxShadow: '0 18px 48px -12px rgba(15,23,42,0.10), 0 2px 4px rgba(15,23,42,0.03), 0 0 0 1px rgba(255,255,255,0.6) inset',
            padding: '44px 48px 40px',
          }}>
            {/* Eyebrow — sans, operational kicker */}
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              marginBottom: 18,
            }}>Free quote · 60 seconds</div>
            {/* Hero headline — pure sans bold, no serif accent */}
            <h1 style={{
              margin: 0,
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: '-0.025em', lineHeight: 1.08,
              color: 'var(--primary)',
            }}>
              Where are you moving?
            </h1>
            <p style={{
              margin: '12px 0 0', fontSize: 15.5, lineHeight: 1.55,
              color: 'var(--text-secondary)', maxWidth: 520,
            }}>
              Two ZIPs to start — matched movers reach out with quotes.
              <br />
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                Compare before booking, no obligation.
              </span>
            </p>

            {/* ZIP row with 44px circular route connector */}
            <div style={{
              marginTop: 28,
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
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--accent-soft-bg)',
                color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(249,115,22,0.15)',
                marginBottom: 8,
                flexShrink: 0,
              }}>
                <Icon name="arrow" size={18} stroke={2.4} />
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

            {/* Feature pills strip — 4 items inside a single bordered container */}
            <div style={{
              marginTop: 18,
              padding: '14px 16px',
              background: 'var(--bg-white)',
              border: '1px solid var(--line)',
              borderRadius: 14,
              boxShadow: 'var(--shadow-sm)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 14,
            }}>
              {[
                { icon: 'receipt', title: 'Free estimate',   sub: "It's 100% free" },
                { icon: 'heart',   title: 'No obligation',   sub: 'You decide' },
                { icon: 'lock',    title: 'Licensed movers', sub: 'Vetted & insured' },
                { icon: 'tag',     title: 'Compare quotes',  sub: 'Save time & money' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'var(--accent-soft-bg)',
                    color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon name={f.icon} size={15} stroke={2} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--primary)', letterSpacing: '-0.005em', lineHeight: 1.2 }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: 1 }}>
                      {f.sub}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Compact 170px route preview — white mileage pill, side-anchored labels with dot markers */}
            {routeHasCoords && (
              <div style={{
                marginTop: 18,
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid var(--line)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 24px -10px rgba(15,23,42,0.08)',
                background: 'var(--bg-light)',
              }}>
                <RouteMap route={route} desktop={true} height={170} />

                {/* Mileage pill — WHITE with orange border, top-center */}
                <div style={{
                  position: 'absolute',
                  top: 14, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 2,
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px',
                    background: '#FFFFFF',
                    color: 'var(--accent)',
                    border: '1px solid rgba(249,115,22,0.25)',
                    borderRadius: 999,
                    fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em',
                    boxShadow: '0 4px 12px -4px rgba(15,23,42,0.08)',
                  }}>
                    ~{route.miles.toLocaleString()} miles
                  </span>
                </div>

                {/* Origin label — left side, vertically centered, with orange dot */}
                <div style={{
                  position: 'absolute',
                  left: 18,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 2px 6px rgba(249,115,22,0.4)' }} />
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: 'var(--primary)', letterSpacing: '-0.005em',
                    whiteSpace: 'nowrap',
                  }}>
                    {route.from.city}, {route.from.st}
                  </div>
                </div>

                {/* Destination label — right side, vertically centered, with orange dot */}
                <div style={{
                  position: 'absolute',
                  right: 18,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: 'var(--primary)', letterSpacing: '-0.005em',
                    whiteSpace: 'nowrap',
                  }}>
                    {route.to.city}, {route.to.st}
                  </div>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 2px 6px rgba(249,115,22,0.4)' }} />
                </div>
              </div>
            )}

            {/* CTA — soft orange glow underneath for dominance */}
            <div style={{ marginTop: 24, position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: '20%', left: '10%', right: '10%', bottom: 0,
                background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 70%)',
                pointerEvents: 'none',
                filter: 'blur(8px)',
              }} />
              <PrimaryButton onClick={onContinue} disabled={!canSubmit}>
                Continue — see your move details
              </PrimaryButton>
            </div>

            {/* Reassurance line with lock icon */}
            <div style={{
              marginTop: 12, textAlign: 'center',
              fontSize: 13,
              color: 'var(--text-secondary)',
              letterSpacing: '0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Icon name="lock" size={12} color="var(--text-secondary)" stroke={2} />
              Secure &amp; private · Takes less than 60 seconds
            </div>

            {/* Section header — small caps flanked by thin rules */}
            <div style={{
              marginTop: 36,
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

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{
                      fontSize: 13.5, fontWeight: 700,
                      color: 'var(--primary)',
                      letterSpacing: '-0.005em', lineHeight: 1.3,
                    }}>{h.t}</div>
                    <div style={{
                      fontSize: 11.5, color: 'var(--text-secondary)',
                      marginTop: 3, lineHeight: 1.4,
                    }}>{h.s}</div>
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
    // Inline preview lives inside the form card now — Continue advances
    // directly to the next orchestrator node (TIMING_PIVOT).
    onContinue();
  };

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
