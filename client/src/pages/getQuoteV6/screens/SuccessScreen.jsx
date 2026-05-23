// client/src/pages/getQuoteV6/screens/SuccessScreen.jsx
import Icon from '../components/Icon';
import Eyebrow from '../components/Eyebrow';
import SecondaryButton from '../components/SecondaryButton';
import { homeTypeLabel, stairsLabel, bucketLabel, homeSizeLabelFromBackend } from '../enums';

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

const SumRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
    <span style={{ color: 'var(--ink-3)' }}>{label}</span>
    <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{value || '—'}</span>
  </div>
);

export default function SuccessScreen({ answers, onRestart, desktop }) {
  const fromLabel = answers.originCity ? `${answers.originCity}, ${answers.originState}` : answers.pickupZip;
  const toLabel = answers.destinationCity ? `${answers.destinationCity}, ${answers.destinationState}` : answers.destinationZip;
  const whenLabel = answers.moveDate ? fmtDate(answers.moveDate) : bucketLabel(answers.urgencyBucket);

  return (
    <div className="screen-enter" style={{
      padding: desktop ? '0' : '56px 22px 32px',
      display: 'flex', flexDirection: 'column', gap: 24,
      minHeight: desktop ? 'auto' : '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: desktop ? 6 : 12 }}>
        <div className="pop-in" style={{
          width: 88, height: 88, borderRadius: '50%',
          background: 'var(--accent-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'var(--accent)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={28} stroke={3} />
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          margin: 0, fontSize: desktop ? 30 : 26,
          fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--ink)', textWrap: 'balance',
        }}>
          You're all set{answers.firstName ? `, ${answers.firstName.split(' ')[0]}` : ''}.
        </h1>
        <p style={{ margin: '10px auto 0', maxWidth: 380, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-3)', textWrap: 'pretty' }}>
          We've sent your details to up to 3 vetted movers in your area. Expect a call within minutes.
        </p>
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-card)', padding: 18,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <Eyebrow>What happens next</Eyebrow>
        {[
          { i: '1', t: 'Up to 3 movers receive your request', s: 'Local, licensed, insured.' },
          { i: '2', t: 'They call you directly', s: `On the number ending ${(answers.customerPhone || '').slice(-4) || '••••'}` },
          { i: '3', t: 'You compare and pick', s: 'Talk to whoever feels right. No pressure.' },
        ].map(s => (
          <div key={s.i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{s.i}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.t}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{s.s}</div>
            </div>
          </div>
        ))}
      </div>

      {!desktop && (
        <div style={{
          padding: 16, borderRadius: 'var(--r-card)',
          background: 'var(--canvas-2)', border: '1px solid var(--line-2)',
        }}>
          <Eyebrow>Your submission</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
            <SumRow label="Route" value={`${fromLabel} → ${toLabel}`} />
            <SumRow label="When" value={whenLabel} />
            <SumRow label="From" value={`${homeTypeLabel(answers.homeType)} · ${homeSizeLabelFromBackend(answers.homeSize)}`} />
            <SumRow label="Access" value={stairsLabel(answers.stairs)} />
            {answers.heavyItems?.length > 0 && (
              <SumRow label="Specialty" value={`${answers.heavyItems.length} item${answers.heavyItems.length === 1 ? '' : 's'}`} />
            )}
          </div>
        </div>
      )}

      <SecondaryButton onClick={onRestart}>Submit another move</SecondaryButton>
    </div>
  );
}
