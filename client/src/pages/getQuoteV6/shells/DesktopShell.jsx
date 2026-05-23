// client/src/pages/getQuoteV6/shells/DesktopShell.jsx
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { homeTypeLabel, stairsLabel, bucketLabel, homeSizeLabelFromBackend } from '../enums';
import { milesBetween } from '../route';
import zipcodes from 'zipcodes';

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function whenLabel(answers) {
  if (answers.moveDate) return fmtDate(answers.moveDate);
  if (answers.urgencyBucket) return bucketLabel(answers.urgencyBucket);
  return '—';
}

// Display-only miles for the left-rail. Never mutates `answers`.
function deriveMiles(answers) {
  if (answers.miles) return answers.miles;
  const a = zipcodes.lookup(answers.pickupZip);
  const b = zipcodes.lookup(answers.destinationZip);
  if (!a || !b) return 0;
  return milesBetween({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude });
}

const SECTIONS = [
  { id: 1, label: 'Timing' },
  { id: 2, label: 'Property' },
  { id: 3, label: 'Items' },
  { id: 4, label: 'You' },
];

function stepToSection(step) {
  if (['timing_pivot', 'date_picker', 'bucket_select'].includes(step)) return { section: 1, total: 4 };
  if (['home_type', 'home_size', 'stairs'].includes(step))              return { section: 2, total: 4 };
  if (['heavy_pivot', 'heavy_select'].includes(step))                   return { section: 3, total: 4 };
  if (step === 'contact')                                               return { section: 4, total: 4 };
  return null;
}

export function DesktopHero() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 24 }}>
      <h2 style={{
        margin: 0, fontSize: 30, fontWeight: 700,
        letterSpacing: '-0.028em', lineHeight: 1.1,
        color: 'white', textWrap: 'balance',
      }}>
        Get matched with licensed movers in your area.
      </h2>
      <p style={{
        margin: 0, fontSize: 14, lineHeight: 1.55,
        color: 'rgba(255,255,255,0.72)', textWrap: 'pretty', maxWidth: 320,
      }}>
        Tell us about your move once. Up to 3 vetted movers will reach out directly — calm, no spam, no obligation.
      </p>
      <div style={{
        marginTop: 6, padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {['Licensed & insured movers only', 'Your info is never sold', 'Calls come from real local crews'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'white' }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              background: 'var(--accent)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="check" size={11} stroke={3} />
            </div>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ color: 'white', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
    </div>
  );
}

export function DesktopRouteContext({ answers, submitted = false }) {
  const fromCity = answers.originCity || answers.pickupZip || '—';
  const fromSt   = answers.originState || '';
  const toCity   = answers.destinationCity || answers.destinationZip || '—';
  const toSt     = answers.destinationState || '';
  const miles    = deriveMiles(answers);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 22, paddingTop: 12,
      opacity: submitted ? 0.7 : 1,
      transition: 'opacity 360ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#fb923c',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        Your move
        {submitted && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px', borderRadius: 999,
            background: 'rgba(34,197,94,0.18)', color: '#86efac',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
          }}>
            <Icon name="check" size={10} stroke={3} /> Submitted
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15, color: 'white' }}>
          {fromCity}{fromSt && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>, {fromSt}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fb923c', fontSize: 12, fontWeight: 500 }}>
          <span style={{ width: 12, height: 1, background: '#fb923c', display: 'inline-block' }} />
          {miles ? `${miles.toLocaleString()} miles` : ''}
          <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.022em', lineHeight: 1.15, color: 'white' }}>
          {toCity}{toSt && <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>, {toSt}</span>}
        </div>
      </div>

      <div style={{
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <SummaryItem label="When" value={whenLabel(answers)} />
        {answers.homeType && <SummaryItem label="From" value={`${homeTypeLabel(answers.homeType)}${answers.homeSize ? ' · ' + homeSizeLabelFromBackend(answers.homeSize) : ''}`} />}
        {answers.stairs && <SummaryItem label="Access" value={stairsLabel(answers.stairs)} />}
        {answers.heavyItems?.length > 0 && (
          <SummaryItem label="Specialty" value={`${answers.heavyItems.length} item${answers.heavyItems.length === 1 ? '' : 's'}`} />
        )}
      </div>
    </div>
  );
}

function DesktopTopBar({ step }) {
  const map = stepToSection(step);
  if (!map) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {SECTIONS.map((s, i) => {
        const done = s.id < map.section;
        const active = s.id === map.section;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: i < SECTIONS.length - 1 ? 1 : 'unset' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7,
                background: active ? 'var(--accent)' : done ? 'var(--good-soft)' : 'var(--canvas-2)',
                color: active ? 'white' : done ? 'var(--good)' : 'var(--ink-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                transition: 'all 200ms ease',
              }}>
                {done ? <Icon name="check" size={11} stroke={3} /> : s.id}
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--ink-3)',
                letterSpacing: '-0.005em',
              }}>{s.label}</span>
            </div>
            {i < SECTIONS.length - 1 && (
              <div style={{ flex: 1, height: 1.5, background: done ? 'var(--good)' : 'var(--line)', borderRadius: 999, opacity: done ? 0.4 : 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Reusable navy two-column chrome. Exported so RouteScreen can wrap the
// preview moment in the same shell layout that funnel steps use, restoring
// the left rail on desktop without going through the orchestrator.
//
// leftContent — JSX rendered in the upper-left navy rail (e.g. DesktopHero
//               or DesktopRouteContext)
// children    — JSX rendered in the right white column
export function DesktopShellLayout({ leftContent, children }) {
  return (
    <div style={{
      background: 'var(--canvas)',
      minHeight: 760,
      display: 'grid',
      gridTemplateColumns: '340px 1fr',
    }}>
      {/* Left navy rail */}
      <div style={{
        background: 'linear-gradient(180deg, var(--primary-darker) 0%, var(--primary) 65%, #0d2440 100%)',
        color: 'white',
        padding: '28px 28px 32px',
        display: 'flex', flexDirection: 'column', gap: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 400 600" style={{
          position: 'absolute', right: -120, bottom: -80,
          width: 460, height: 600, opacity: 0.5, pointerEvents: 'none',
        }}>
          <defs>
            <radialGradient id="leftGlow" cx="50%" cy="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="280" cy="380" r="240" fill="url(#leftGlow)" />
          <path d="M 30 540 Q 120 280, 280 320 T 480 200"
            stroke="var(--accent)" strokeWidth="1.2"
            strokeDasharray="3 6" fill="none" opacity="0.5" />
        </svg>

        <Logo size={26} light />

        <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {leftContent}
        </div>
      </div>

      {/* Right column */}
      <div style={{
        padding: '72px 88px 72px 96px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        background: '#ffffff',
      }}>
        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function DesktopShell({ step, answers, children }) {
  // The route step renders its own layout — RouteScreen handles the form
  // (full-bleed hero) and the preview moment (wraps in DesktopShellLayout
  // itself with DesktopRouteContext on the left rail).
  if (step === 'route') return children;

  const submitted = step === 'success';
  const showRoutePersistent = !['route', 'preview'].includes(step);
  const leftContent = showRoutePersistent
    ? <DesktopRouteContext answers={answers} submitted={submitted} />
    : <DesktopHero />;

  return (
    <DesktopShellLayout leftContent={leftContent}>
      {step !== 'route' && step !== 'preview' && step !== 'success' && <DesktopTopBar step={step} />}
      {children}
    </DesktopShellLayout>
  );
}
