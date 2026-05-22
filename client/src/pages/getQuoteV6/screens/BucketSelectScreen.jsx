// client/src/pages/getQuoteV6/screens/BucketSelectScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { BUCKET_OPTIONS } from '../enums';

const ICON_FOR_BUCKET = { asap: 'sparkle', this_week: 'cal', this_month: 'cal', flexible: 'clock' };

export default function BucketSelectScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    patch({ urgencyBucket: id, moveDate: '' });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Move window" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Move window'}
          title="Roughly when are you moving?"
          sub="Pick the closest window."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BUCKET_OPTIONS.map(b => (
            <ChoiceCard key={b.id} icon={ICON_FOR_BUCKET[b.id]} title={b.title} sub={b.sub} selected={answers.urgencyBucket === b.id} onClick={() => pick(b.id)} />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
