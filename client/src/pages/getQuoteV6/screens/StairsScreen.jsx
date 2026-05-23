// client/src/pages/getQuoteV6/screens/StairsScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { STAIRS_OPTIONS } from '../enums';

export default function StairsScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (id) => {
    patch({ stairs: id });
    setTimeout(onContinue, 220);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Access" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Access'}
          title="How will movers get into your place?"
          sub="Helps your movers prepare for the day."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STAIRS_OPTIONS.map(o => (
            <ChoiceCard key={o.id} icon={o.icon} title={o.title} sub={o.sub} selected={answers.stairs === o.id} onClick={() => pick(o.id)} />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
