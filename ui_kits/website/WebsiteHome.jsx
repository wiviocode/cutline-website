import React from 'react';
import { Button } from '../../components/core/Button.jsx';
import { PillTab } from '../../components/core/PillTab.jsx';
import { KeyChip } from '../../components/core/KeyChip.jsx';
import { WindowFrame } from '../../components/core/WindowFrame.jsx';
import { ReviewScreen } from '../app/ReviewScreen.jsx';

const captions = [
  ['AP', 'Nebraska Cornhuskers quarterback Adrian Martinez (2) throws a pass in the third quarter during an NCAA college football game against the Ohio State Buckeyes, Saturday, Sept. 14, 2024, in Lincoln, Neb. (AP Photo/John Doe)', 'Weekday given · month abbreviated · AP state form · credit in parentheses'],
  ['Getty', 'Adrian Martinez #2 of the Nebraska Cornhuskers throws a pass in the third quarter at Memorial Stadium on September 14, 2024 in Lincoln, Nebraska. (Photo by John Doe/Getty Images)', 'Player-first · #2 form · month in full · state in full'],
  ['Imagn', 'Sep 14, 2024; Lincoln, NE, USA; Nebraska Cornhuskers quarterback Adrian Martinez (2) throws a pass in the third quarter at Memorial Stadium. Mandatory Credit: John Doe-Imagn Images', 'Dateline-first · semicolons · mandatory credit'],
  ['Simple', 'Adrian Martinez (2) throws a pass in the third quarter against the Ohio State Buckeyes at Memorial Stadium in Lincoln, Neb.', "The sentence, without a desk's furniture"],
];
const steps = [
  ['01', 'Drop a folder', 'JPEG, PNG or raw. Capture dates are read off the frames.'],
  ['02', 'Pick the teams', 'Rosters and kit colours download automatically.'],
  ['03', 'Caption', "Every frame, composed by your desk's rules."],
  ['04', 'Review', 'Zoom to 1:1, fix a number, approve with Return.'],
  ['05', 'File', 'IPTC and alt text written into the photograph.'],
];
const keys = [['click', 'zoom to 1:1, drag to pan'], ['← →', 'move through the card'], ['⏎', 'approve and next'], ['e', 'edit the caption'], ['n', 'correct a number']];

function CaptionDemo() {
  const [i, setI] = React.useState(0);
  const [typed, setTyped] = React.useState('');
  const [auto, setAuto] = React.useState(true);
  React.useEffect(() => {
    let n = 0; const full = captions[i][1]; setTyped('');
    const t = setInterval(() => { n = Math.min(n + 3, full.length); setTyped(full.slice(0, n)); if (n >= full.length) clearInterval(t); }, 14);
    let nx; if (auto) nx = setTimeout(() => setI(x => (x + 1) % captions.length), full.length * 14 / 3 + 3200);
    return () => { clearInterval(t); clearTimeout(nx); };
  }, [i, auto]);
  return (
    <div style={{ position: 'relative' }}>
      <div aria-hidden style={{ visibility: 'hidden', pointerEvents: 'none' }}>
        <WindowFrame title="sizer">
          <div style={{ padding: 'clamp(22px, 3vw, 34px)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><PillTab>AP</PillTab></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.3vw, 28px)', lineHeight: 1.5, marginTop: 22 }}>{captions[0][1]}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 14 }}>note</div>
          </div>
        </WindowFrame>
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <WindowFrame title="jersey #2 · red · throws a pass · Sat, Sept. 14 · Memorial Stadium" style={{ textAlign: 'left' }}>
          <div style={{ padding: 'clamp(22px, 3vw, 34px)' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {captions.map((c, x) => <PillTab key={c[0]} active={x === i} onClick={() => { setAuto(false); setI(x); }}>{c[0]}</PillTab>)}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.3vw, 28px)', lineHeight: 1.5, color: 'var(--text-1)', marginTop: 22, userSelect: 'text' }}>
              {typed}<span style={{ display: 'inline-block', width: 3, height: '1.1em', background: 'var(--gold)', verticalAlign: '-0.18em', marginLeft: 2, animation: 'blink 1.1s steps(1) infinite' }}></span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-5)', marginTop: 14 }}>{captions[i][2]}</div>
          </div>
        </WindowFrame>
      </div>
    </div>
  );
}

/** The full marketing one-pager. */
export function WebsiteHome() {
  const gutter = 'clamp(24px, 6vw, 84px)';
  const h2 = { fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--type-h2-size)', lineHeight: 1.08, letterSpacing: '-0.02em', margin: 0 };
  return (
    <div style={{ background: 'var(--ink-0)', color: 'var(--text-1)', font: '16px/1.6 var(--font-body)' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 26, padding: '18px ' + gutter, borderBottom: '1px solid var(--border-hairline)', background: 'rgba(21,24,29,0.85)', backdropFilter: 'blur(14px)' }}>
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 11, color: 'var(--text-1)', textDecoration: 'none' }}>
          <img src="../../assets/cutline-mark.svg" alt="Cutline" style={{ width: 30, height: 30, display: 'block' }} />
          <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: '-0.02em' }}>Cutline</span>
        </a>
        <span style={{ marginLeft: 'auto' }}></span>
        <a href="https://github.com/wiviocode/cutline" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', textDecoration: 'none' }}>GitHub</a>
        <Button>Download</Button>
      </nav>
      <section style={{ padding: 'clamp(64px, 10vh, 110px) ' + gutter, maxWidth: 1160, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <img src="../../assets/cutline-wordmark-onDark.png" alt="Cutline" style={{ width: 'clamp(180px, 22vw, 250px)' }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 'var(--type-hero-size)', lineHeight: 1.02, letterSpacing: '-0.025em', margin: '38px 0 0', textWrap: 'balance' }}>
          Shoot the game.<br />Skip the <em style={{ color: 'var(--gold)' }}>typing</em>.
        </h1>
        <p style={{ maxWidth: 560, fontSize: 'var(--type-lede-size)', lineHeight: 1.65, color: 'var(--text-2)', margin: '26px 0 0' }}>
          Drop in your photos. Cutline names the players, writes the captions, and files them into your images.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 36, flexWrap: 'wrap' }}>
          <Button size="marketing">Download for macOS</Button>
          <span style={{ fontSize: 13, color: 'var(--text-4)' }}>macOS 15+ · open source · bring your own model</span>
        </div>
        <div style={{ width: '100%', maxWidth: 880, marginTop: 'clamp(50px, 8vh, 80px)' }}>
          <CaptionDemo />
          <div style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 16 }}>One frame, every desk — same photo, written each house's way. Custom styles are coming.</div>
        </div>
      </section>
      <section style={{ borderTop: '1px solid var(--border-hairline)', padding: 'clamp(70px, 10vh, 110px) ' + gutter }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <h2 style={h2}>Five steps.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 44, borderTop: '1px solid var(--ink-3)' }}>
            {steps.map(([n, t, b]) => (
              <div key={n} style={{ padding: '26px 24px 30px 0', borderBottom: '1px solid var(--ink-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 46, lineHeight: 1, fontWeight: 600, color: 'var(--gold)' }}>{n}</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{t}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.55 }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{ borderTop: '1px solid var(--border-hairline)', background: 'var(--ink-1)', padding: 'clamp(70px, 10vh, 110px) ' + gutter }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <h2 style={h2}>You stay the editor.</h2>
          <div style={{ marginTop: 40 }}>
            <WindowFrame title="Cutline"><ReviewScreen height={620} /></WindowFrame>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
            {keys.map(([k, d]) => <KeyChip key={k} k={k}>{d}</KeyChip>)}
          </div>
        </div>
      </section>
      <section style={{ borderTop: '1px solid var(--border-hairline)', padding: 'clamp(80px, 12vh, 130px) ' + gutter, textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          <img src="../../assets/cutline-mark.svg" alt="" style={{ width: 88, height: 88 }} />
          <h2 style={{ ...h2, fontSize: 'clamp(36px, 4.6vw, 58px)', lineHeight: 1.06 }}>Shoot. Drop. Done.</h2>
          <Button size="marketing">Download for macOS</Button>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-5)' }}>open source, on GitHub · free — bring your own API key or local model</div>
        </div>
      </section>
      <footer style={{ borderTop: '1px solid var(--border-hairline)', padding: '40px ' + gutter, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-4)' }}><b style={{ color: 'var(--text-1)' }}>cut·line</b> · <i>noun</i> · the line of type beneath a photograph.</span>
        <span style={{ height: 8, width: 84, borderRadius: 4, background: 'var(--gold)' }}></span>
        <span style={{ marginLeft: 'auto' }}></span>
        <a href="https://github.com/wiviocode/cutline" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-4)' }}>GitHub</a>
      </footer>
    </div>
  );
}
