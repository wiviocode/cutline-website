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
const logLines = 6;
const keys = [['click', 'zoom to 1:1, drag to pan'], ['← →', 'move through the card'], ['⏎', 'approve and next'], ['e', 'edit the caption'], ['n', 'correct a number']];

function CaptionDemo() {
  const [i, setI] = React.useState(0);
  const [typed, setTyped] = React.useState('');
  const [auto, setAuto] = React.useState(true);
  const [capH, setCapH] = React.useState(null);
  const measRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (measRef.current) {
      const h = measRef.current.offsetHeight;
      if (h) setCapH(h);
    }
  }, [typed]);
  React.useEffect(() => {
    let n = 0; const full = captions[i][1]; setTyped('');
    const t = setInterval(() => { n = Math.min(n + 1, full.length); setTyped(full.slice(0, n)); if (n >= full.length) clearInterval(t); }, 16);
    let nx; if (auto) nx = setTimeout(() => setI(x => (x + 1) % captions.length), full.length * 16 + 4200);
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
            <div style={{ position: 'relative', marginTop: 22 }}>
              <div ref={measRef} aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, visibility: 'hidden', pointerEvents: 'none', fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.3vw, 28px)', lineHeight: 1.5 }}>{typed + '\u00A0'}</div>
              <div style={{ height: capH ? capH : '1.5em', overflow: 'hidden', transition: 'height 0.28s cubic-bezier(0.2, 0.7, 0.3, 1)', fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 2.3vw, 28px)', lineHeight: 1.5, color: 'var(--text-1)', userSelect: 'text' }}>
                {typed}<span style={{ display: 'inline-block', width: 3, height: '1.1em', background: 'var(--gold)', verticalAlign: '-0.18em', marginLeft: 2, animation: 'blink 1.1s steps(1) infinite' }}></span>
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-5)', marginTop: 14 }}>{captions[i][2]}</div>
          </div>
        </WindowFrame>
      </div>
    </div>
  );
}

function RunLog() {
  const [shown, setShown] = React.useState(0);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    let timer;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        timer = setInterval(() => setShown((s) => { const n = s + 1; if (n >= logLines) clearInterval(timer); return n; }), 380);
      }
    }, { threshold: 0.3 });
    if (el) io.observe(el); else setShown(logLines);
    return () => { io.disconnect(); clearInterval(timer); };
  }, []);
  const line = (i, children, style) => (
    <div key={i} style={{ opacity: shown > i ? 1 : 0, transition: 'opacity 0.4s ease', ...style }}>{children}</div>
  );
  return (
    <div ref={ref} style={{ background: 'var(--ink-1)', border: '1px solid var(--ink-3)', borderRadius: 'var(--radius-card)', padding: '26px 28px', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 2.3, color: 'var(--text-4)' }}>
      {line(0, <span><span style={{ color: 'var(--text-5)' }}>21:47</span>  <span style={{ color: 'var(--gold)' }}>you</span>  dropped <span style={{ color: 'var(--text-1)' }}>128 frames</span> · NEB_v_OSU</span>)}
      {line(1, <span><span style={{ color: 'var(--text-5)' }}>21:47</span>  <span style={{ color: 'var(--gold)' }}>you</span>  picked <span style={{ color: 'var(--text-1)' }}>Nebraska vs Ohio State</span> · rosters loaded</span>)}
      {line(2, <span><span style={{ color: 'var(--text-5)' }}>21:48</span>  <span style={{ color: 'var(--text-4)' }}>app</span>  captioned <span style={{ color: 'var(--text-1)' }}>128 of 128</span> · AP style</span>)}
      {line(3, <span><span style={{ color: 'var(--text-5)' }}>21:51</span>  <span style={{ color: 'var(--gold)' }}>you</span>  reviewed · fixed <span style={{ color: 'var(--text-1)' }}>2 numbers</span> · ⏎ × 128</span>)}
      {line(4, <span><span style={{ color: 'var(--text-5)' }}>21:51</span>  <span style={{ color: 'var(--text-4)' }}>app</span>  wrote IPTC + alt text · <span style={{ color: 'var(--text-1)' }}>done</span></span>)}
      {line(5, <span style={{ color: 'var(--text-5)', fontSize: 12 }}>four minutes, card to filed</span>, { borderTop: '1px solid var(--ink-3)', marginTop: 14, paddingTop: 14 })}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 420px) 1fr', gap: 'clamp(36px, 6vw, 80px)', alignItems: 'center' }}>
            <div>
              <h2 style={h2}>A night's work, in one run.</h2>
              <p style={{ color: 'var(--text-3)', fontSize: 15, lineHeight: 1.65, margin: '18px 0 0' }}>You drop the folder and pick the teams. Cutline captions, waits for your review, and files the metadata into every photograph.</p>
            </div>
            <RunLog />
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
