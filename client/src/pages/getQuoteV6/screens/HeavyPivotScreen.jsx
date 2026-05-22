// client/src/pages/getQuoteV6/screens/HeavyPivotScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import PivotCard from '../components/PivotCard';

export default function HeavyPivotScreen({ patch, onYes, onSkip, onBack, onClose, section, total, desktop, safeTop }) {
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Heavy items" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 3 · Items' : 'Heavy items'}
          title="Any heavy or specialty items?"
          sub="Pianos, safes, gym equipment — anything that needs extra hands."
          size={desktop ? 'lg' : 'md'}
        />
        <div style={{ display: 'flex', flexDirection: desktop ? 'row' : 'column', gap: 12 }}>
          <PivotCard icon="weight" label="Yes, I do" sub="Tell us what's heavy or specialty." onClick={onYes} />
          <PivotCard icon="check" label="No, standard items" sub="Furniture, boxes, basic stuff." onClick={() => { patch({ heavyItems: [] }); onSkip(); }} />
        </div>
      </ScreenWrap>
    </>
  );
}
