import React from 'react';
import { Button } from './Button.jsx';
import { PillTab } from './PillTab.jsx';
import { KeyChip } from './KeyChip.jsx';
import { KitChip } from './KitChip.jsx';
import { Overline } from './Overline.jsx';
import { WindowFrame } from './WindowFrame.jsx';

export function CoreCardDemo() {
  const row = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 };
  return (
    <div>
      <div style={row}>
        <Button>Caption photos</Button><Button variant="secondary">Redo all</Button><Button variant="ghost">Cancel</Button>
        <Button disabled>Caption photos</Button><Button size="marketing">Download for macOS</Button>
      </div>
      <div style={row}><PillTab active>AP</PillTab><PillTab>Getty</PillTab><PillTab>Imagn</PillTab><PillTab>Simple</PillTab></div>
      <div style={row}><KitChip number="2" name="Adrian Martinez" /><KitChip number="?" flagged /><KeyChip k="⏎">approve and next</KeyChip><KeyChip k="e">edit the caption</KeyChip></div>
      <div style={row}><Overline>Numbers read</Overline></div>
      <WindowFrame title="jersey #2 · red · throws a pass, Q3" style={{ maxWidth: 420 }}>
        <div style={{ padding: 16, fontFamily: 'var(--font-display)', fontSize: 16, lineHeight: 1.5 }}>Adrian Martinez (2) throws a pass in the third quarter…</div>
      </WindowFrame>
    </div>
  );
}
