import React from 'react';
import { WindowFrame } from '../../components/core/WindowFrame.jsx';
import { ReviewScreen } from './ReviewScreen.jsx';

export function AppFramed() {
  return <WindowFrame title="Cutline"><ReviewScreen height={640} /></WindowFrame>;
}
