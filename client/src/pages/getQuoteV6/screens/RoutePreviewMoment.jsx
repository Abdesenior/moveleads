// client/src/pages/getQuoteV6/screens/RoutePreviewMoment.jsx
import { useEffect, useState } from 'react';
import zipcodes from 'zipcodes';
import Logo from '../components/Logo';
import Eyebrow from '../components/Eyebrow';
import CityBlock from '../components/CityBlock';
import ArrowDivider from '../components/ArrowDivider';
import StatCell from '../components/StatCell';
import RouteMap from '../components/RouteMap';
import PrimaryButton from '../components/PrimaryButton';
import TrustStrip from '../components/TrustStrip';
import { transitDaysLabel, cardinal, milesBetween } from '../route';

// Build a route object the design's RouteArc expects from V6 answers shape.
// Reads city/state from answers (populated via zippopotam.us in HeroLanding)
// and resolves lat/lng via the `zipcodes` npm package.
function routeFromAnswers(answers) {
  const fromLatLng = zipcodes.lookup(answers.pickupZip) || {};
  const toLatLng = zipcodes.lookup(answers.destinationZip) || {};
  const from = {
    city: answers.originCity || fromLatLng.city || '—',
    st: answers.originState || fromLatLng.state || '',
    lat: fromLatLng.latitude ?? null,
    lng: fromLatLng.longitude ?? null,
  };
  const to = {
    city: answers.destinationCity || toLatLng.city || '—',
    st: answers.destinationState || toLatLng.state || '',
    lat: toLatLng.latitude ?? null,
    lng: toLatLng.longitude ?? null,
  };
  const miles = answers.miles || milesBetween(from, to);
  return { from, to, miles };
}

export default function RoutePreviewMoment({ answers, onContinue, desktop = false }) {
  const route = routeFromAnswers(answers);

  const [animMiles, setAnimMiles] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const dur = 1100;
    const target = route.miles;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimMiles(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route.miles]);

  const distanceLabel = animMiles.toLocaleString();
  const days = transitDaysLabel(route.miles);

  return (
    <div className="screen-enter" style={{
      padding: desktop ? '56px 32px 56px' : '56px 22px 32px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      gap: desktop ? 20 : 32,
      minHeight: desktop ? 'auto' : '100%',
      background: 'var(--canvas)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: desktop ? 680 : '100%',
        display: 'flex', flexDirection: 'column',
        gap: desktop ? 18 : 32,
      }}>
        {!desktop && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo size={22} />
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--ink-3)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Route confirmed</div>
          </div>
        )}

        <RouteMap route={route} desktop={desktop} />

        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Eyebrow>Your move</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <CityBlock city={route.from.city} st={route.from.st} role="From" desktop={desktop} />
              <ArrowDivider desktop={desktop} />
              <CityBlock city={route.to.city} st={route.to.st} role="To" desktop={desktop} />
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
            gap: 0,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-card)',
            overflow: 'hidden',
          }}>
            <StatCell label="Distance" value={distanceLabel} suffix="miles" />
            <StatCell label="Est. transit" value={days} suffix={days === '1' ? 'day' : 'days'} border={!desktop} title="Estimate based on typical long-haul transit. Your mover will confirm the final timeline." />
            {desktop && <StatCell label="Direction" value={cardinal(route)} />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'center', padding: '0 16px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '-0.005em' }}>
              Licensed movers serve this route.
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', letterSpacing: '-0.005em', lineHeight: 1.5 }}>
              Typical response within a few hours — no obligation.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PrimaryButton onClick={onContinue}>Continue — tell us about the move</PrimaryButton>
          <TrustStrip />
        </div>
      </div>
    </div>
  );
}
