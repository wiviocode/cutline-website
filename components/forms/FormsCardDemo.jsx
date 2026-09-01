import React from 'react';
import { TextInput } from './TextInput.jsx';
import { TextArea } from './TextArea.jsx';
import { Segmented } from './Segmented.jsx';

export function FormsCardDemo() {
  const [f, setF] = React.useState('All 5');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
      <Segmented options={['Needs review 1', 'Approved 2', 'All 5']} value={f} onChange={setF} />
      <TextInput mono placeholder="Jersey number" />
      <TextArea placeholder="Tell the model what it missed — a change kit, a borrowed number, who is who…" minHeight={72} />
    </div>
  );
}
