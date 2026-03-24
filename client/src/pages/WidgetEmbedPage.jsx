import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { DemoWidget } from './WidgetPage';

/**
 * WidgetEmbedPage
 * A clean, no-padding page designed to be loaded inside an iframe.
 */
export default function WidgetEmbedPage() {
  const { companyId: pathId } = useParams();
  const [searchParams] = useSearchParams();
  
  // Support both /embed/widget/:companyId and /embed/widget?company=...
  const companyId = pathId || searchParams.get('company');

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'transparent',
      padding: '10px'
    }}>
      <DemoWidget companyId={companyId} />
      
      <style>{`
        body { margin: 0; padding: 0; background: transparent; overflow-x: hidden; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
