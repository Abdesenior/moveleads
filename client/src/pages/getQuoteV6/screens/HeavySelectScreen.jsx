// client/src/pages/getQuoteV6/screens/HeavySelectScreen.jsx
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import TileCard from '../components/TileCard';
import PrimaryButton from '../components/PrimaryButton';
import { HEAVY_ITEMS } from '../enums';

export default function HeavySelectScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  // answers.heavyItems stores the human title strings (what the user sees).
  const selected = new Set(answers.heavyItems || []);
  const toggle = (item) => {
    const next = new Set(selected);
    if (next.has(item.title)) next.delete(item.title);
    else next.add(item.title);
    patch({ heavyItems: Array.from(next) });
  };
  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="What's heavy?" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 3 · Items' : "What's heavy?"}
          title="Which items need extra care?"
          sub="Select any that apply — movers will plan accordingly."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{
          display: 'grid',
          gridTemplateColumns: desktop ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
          gap: 10,
        }}>
          {HEAVY_ITEMS.map(h => (
            <TileCard key={h.id} icon={h.icon} title={h.title} selected={selected.has(h.title)} onClick={() => toggle(h)} />
          ))}
        </div>
        <PrimaryButton onClick={onContinue} disabled={selected.size === 0}>
          {selected.size ? `Continue · ${selected.size} item${selected.size === 1 ? '' : 's'}` : 'Continue'}
        </PrimaryButton>
      </ScreenWrap>
    </>
  );
}
