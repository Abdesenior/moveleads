// client/src/pages/getQuoteV6/screens/HomeTypeScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import Icon from '../components/Icon';
import { HOME_TYPES } from '../enums';

export default function HomeTypeScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    // Reset homeSize when type changes (different size taxonomy per type).
    patch({ homeType: id, homeSize: '' });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Home type" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Home type'}
          title="What kind of place are you moving from?"
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : '1fr 1fr',
          gap: 10,
        }}>
          {HOME_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className="nostroke"
              style={{
                padding: '18px 14px',
                borderRadius: 'var(--r-card)',
                background: 'var(--surface)',
                border: '1.5px solid',
                borderColor: answers.homeType === t.id ? 'var(--accent)' : 'var(--line)',
                boxShadow: answers.homeType === t.id ? '0 0 0 3px var(--accent-soft)' : 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: 12,
                textAlign: 'left',
                minHeight: 110,
                transition: 'all 160ms ease',
                cursor: 'pointer',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: answers.homeType === t.id ? 'var(--accent-soft)' : 'var(--canvas)',
                color: answers.homeType === t.id ? 'var(--accent)' : 'var(--ink-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={t.icon} size={20} />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.012em' }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{t.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
