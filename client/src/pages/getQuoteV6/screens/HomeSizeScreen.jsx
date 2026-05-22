// client/src/pages/getQuoteV6/screens/HomeSizeScreen.jsx
import { useState } from 'react';
import FunnelHeader from '../components/FunnelHeader';
import ScreenWrap from '../components/ScreenWrap';
import Question from '../components/Question';
import ChoiceCard from '../components/ChoiceCard';
import { SIZE_SETS } from '../enums';

export default function HomeSizeScreen({ answers, patch, onContinue, onBack, onClose, section, total, desktop, safeTop }) {
  const sizes = SIZE_SETS[answers.homeType] || SIZE_SETS.apartment;

  // Local UI-id state for selection highlight only — answers.homeSize stores
  // the backend string, which can map from multiple UI ids (e.g. 'storage_s'
  // and 'few_items' both map to 'Studio'), so we cannot reliably reverse-map.
  const [selectedId, setSelectedId] = useState('');

  const pick = (option) => {
    setSelectedId(option.id);
    patch({ homeSize: option.backend });  // Backend-valid string written.
    setTimeout(onContinue, 220);
  };

  return (
    <>
      {!desktop && <FunnelHeader section={section} total={total} label="Size" onBack={onBack} onClose={onClose} safeTop={safeTop} />}
      <ScreenWrap pad={desktop ? '0' : '20px 22px 28px'}>
        <Question
          eyebrow={desktop ? 'Step 2 · Property' : 'Size'}
          title="How big is your place?"
          sub="A rough estimate is fine — movers will confirm during their call."
          size={desktop ? 'lg' : 'md'}
        />
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sizes.map(s => (
            <ChoiceCard
              key={s.id}
              icon={answers.homeType === 'storage' ? 'warehouse' : answers.homeType === 'house' ? 'house2' : 'home'}
              title={s.title}
              sub={s.sub}
              selected={selectedId === s.id}
              onClick={() => pick(s)}
              compact
            />
          ))}
        </div>
      </ScreenWrap>
    </>
  );
}
