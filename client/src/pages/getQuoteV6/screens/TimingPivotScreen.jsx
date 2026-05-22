// client/src/pages/getQuoteV6/screens/TimingPivotScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PivotCard from '../components/PivotCard';

export default function TimingPivotScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const pick = (val) => {
    if (val) patch({ knowsDate: true, urgencyBucket: '' });
    else     patch({ knowsDate: false, moveDate: '' });
    setTimeout(onContinue, 240);
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Timing" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 1 · Timing' : 'Timing'}
          title="Do you know your move date yet?"
          sub="Either is fine — both options take 30 seconds."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', gap: 12 }}>
          <PivotCard icon="cal" label="Yes, I have a date" sub="Pick the day from a calendar." selected={answers.knowsDate === true} onClick={() => pick(true)} />
          <PivotCard icon="clock" label="Not sure yet" sub="Choose a rough window instead." selected={answers.knowsDate === false} onClick={() => pick(false)} />
        </div>
      </ScreenWrap>
    </>
  );
}
