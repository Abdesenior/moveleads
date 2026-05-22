// client/src/pages/getQuoteV6/screens/DatePickerScreen.jsx
// Custom always-visible month-grid calendar, not a native <input type="date">,
// per UX direction 2026-05-22. Adapted from design source screens.jsx:490-564
// with V6-shape adaptations (answers.moveDate, zero-padded YYYY-MM-DD, real
// "today", 44px tap targets for WCAG/Apple HIG).
import { useState } from 'react';
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PrimaryButton from '../components/PrimaryButton';
import Icon from '../components/Icon';

const iconSqStyle = {
  width: 34, height: 34, borderRadius: 10,
  background: 'var(--canvas)', border: '1px solid var(--line)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--ink-2)', cursor: 'pointer',
};

function fmt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

export default function DatePickerScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const today = new Date();
  const initialMonthFromAnswers = answers.moveDate && answers.moveDate.length === 10
    ? new Date(Number(answers.moveDate.slice(0, 4)), Number(answers.moveDate.slice(5, 7)) - 1, 1)
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const [month, setMonth] = useState(initialMonthFromAnswers);

  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Tomorrow at 00:00 — anything strictly less is disabled (today + past).
  const minSelectable = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const isPast = (d) => new Date(month.getFullYear(), month.getMonth(), d) < minSelectable;

  const selectedStr = answers.moveDate && answers.moveDate.length === 10 ? answers.moveDate : '';
  const displayDate = fmt(selectedStr);

  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Move date" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Move date'}
          title="When are you planning to move?"
          sub="Pick the closest day to your move — you can adjust later."
          size={desktop ? 'lg' : 'md'}
        />

        <div style={{
          padding: 16, borderRadius: 'var(--r-card)',
          background: 'var(--surface)', border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="nostroke"
              style={iconSqStyle}
              aria-label="Previous month"
            >
              <Icon name="chevL" size={16} stroke={2.2} />
            </button>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>{monthLabel}</div>
            <button
              type="button"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="nostroke"
              style={iconSqStyle}
              aria-label="Next month"
            >
              <Icon name="chev" size={16} stroke={2.2} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} style={{
                textAlign: 'center', fontSize: 11, fontWeight: 600,
                color: 'var(--ink-3)', padding: '4px 0', letterSpacing: '0.06em',
              }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const past = isPast(d);
              // Zero-padded YYYY-MM-DD — matches V6 server expectation and
              // makes string compare with answers.moveDate reliable.
              const dateStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const selected = selectedStr === dateStr;
              return (
                <button
                  key={i}
                  type="button"
                  className="nostroke"
                  onClick={() => {
                    if (past) return;
                    patch({ moveDate: dateStr, urgencyBucket: '' });
                  }}
                  disabled={past}
                  style={{
                    height: 44, borderRadius: 10,
                    background: selected ? 'var(--accent)' : 'transparent',
                    color: selected ? 'white' : past ? 'var(--ink-4)' : 'var(--ink)',
                    fontSize: 14,
                    fontWeight: selected ? 700 : 500,
                    cursor: past ? 'not-allowed' : 'pointer',
                    boxShadow: selected ? '0 2px 8px rgba(249,115,22,0.35)' : 'none',
                    transition: 'background 160ms ease, box-shadow 160ms ease',
                    border: 'none',
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        <PrimaryButton onClick={onContinue} disabled={!selectedStr}>
          {displayDate ? `Continue · ${displayDate}` : 'Continue'}
        </PrimaryButton>
      </ScreenWrap>
    </>
  );
}
