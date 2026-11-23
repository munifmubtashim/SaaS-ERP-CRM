import type { CSSProperties } from 'react';

type Orb = { color: string; style: CSSProperties };

// Sizes, places and blur from the design: Main.dc.html (desktop) and PhoneLight.dc.html (phones).
const DESKTOP: Orb[] = [
  { color: 'var(--orb-a)', style: { left: -90, top: 60, width: 540, height: 540, filter: 'blur(70px)' } },
  { color: 'var(--orb-b)', style: { right: -110, top: 140, width: 500, height: 500, filter: 'blur(70px)' } },
  { color: 'var(--orb-c)', style: { left: '38%', top: 640, width: 520, height: 520, filter: 'blur(80px)' } },
  {
    color: 'var(--orb-d)',
    style: { left: '4%', bottom: -120, width: 460, height: 460, filter: 'blur(80px)' },
  },
];
const PHONE: Orb[] = [
  { color: 'var(--orb-a)', style: { left: -80, top: 150, width: 300, height: 300, filter: 'blur(50px)' } },
  { color: 'var(--orb-b)', style: { right: -90, top: 430, width: 280, height: 280, filter: 'blur(55px)' } },
  { color: 'var(--orb-c)', style: { left: 30, top: 640, width: 300, height: 300, filter: 'blur(55px)' } },
  { color: 'var(--orb-d)', style: { right: -60, top: -40, width: 240, height: 240, filter: 'blur(55px)' } },
];

/** The design's soft glows behind the glass: what the cards blur, so they read as glass and not flat white. */
export function Backdrop() {
  const orbs = (list: Orb[], size: 'desktop' | 'phone', shown: string) =>
    list.map((orb, i) => (
      <div
        key={`${size}${i}`}
        data-orb
        data-size={size}
        className={`absolute rounded-full ${shown}`}
        style={{ ...orb.style, background: orb.color }}
      />
    ));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {orbs(DESKTOP, 'desktop', 'hidden md:block')}
      {orbs(PHONE, 'phone', 'md:hidden')}
    </div>
  );
}
