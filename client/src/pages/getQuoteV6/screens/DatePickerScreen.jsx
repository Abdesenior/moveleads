// client/src/pages/getQuoteV6/screens/DatePickerScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PrimaryButton from '../components/PrimaryButton';

// Tomorrow as YYYY-MM-DD for the min attribute.
function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function fmt(iso) {
  if (!iso) return '';
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

export default function DatePickerScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const value = answers.moveDate && answers.moveDate.length === 10 ? answers.moveDate : '';
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
          <input
            type="date"
            value={value}
            min={tomorrowISO()}
            onChange={e => patch({ moveDate: e.target.value, urgencyBucket: '' })}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 17,
              fontFamily: 'inherit',
              fontWeight: 500,
              color: 'var(--ink)',
              border: '1.5px solid var(--line-strong)',
              borderRadius: 'var(--r-input)',
              background: 'var(--surface)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <PrimaryButton onClick={onContinue} disabled={!value}>
          {value ? `Continue · ${fmt(value)}` : 'Continue'}
        </PrimaryButton>
      </ScreenWrap>
    </>
  );
}
