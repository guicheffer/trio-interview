/**
 * The Trio Interview mark: two leaning bars that make an A, over a terminal prompt.
 * The prompt is the interviewer, the candidate and the assistant sharing one terminal.
 *
 * The bars keep their own colours in light and dark mode. The pill with the prompt is dark in light mode and white in
 * dark mode, the way the brand file has it, so the component swaps that one shape with the theme.
 */
const PURPLE = '#5850F8';
const GREEN = '#00C068';

function Pill({ cx, cy, length, thick, angle, fill, className }: { cx: number; cy: number; length: number; thick: number; angle: number; fill?: string; className?: string }) {
  return (
    <rect x={cx - length / 2} y={cy - thick / 2} width={length} height={thick} rx={thick / 2} fill={fill} className={className} transform={`rotate(${angle} ${cx} ${cy})`} />
  );
}

/** `height` is in pixels. The width follows the drawing's proportions (279 by 241), so the mark never stretches. */
export function TrioMark({ height = 32, className = '', animate = false }: { height?: number; className?: string; animate?: boolean }) {
  const part = (name: string) => (animate ? `trio-part trio-part-${name}` : undefined);
  return (
    <svg className={className} height={height} width={Math.round(height * 279 / 241)} viewBox="0 0 279 241" fill="none" aria-hidden="true">
      <g className={part('agent')}>
        <Pill cx={99.8} cy={206} length={192} thick={68.1} angle={0} className="fill-[#0B0B14] dark:fill-white" />
        <g className="stroke-white dark:stroke-[#0B0B14]" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 190 L58 206 L40 222" />
        </g>
        <rect x={79} y={182} width={9} height={48} rx={4.5} className="fill-white dark:fill-[#0B0B14]" />
      </g>
      <g className={part('interviewer')}><Pill cx={109} cy={81} length={178.5} thick={68.6} angle={121.1} fill={PURPLE} /></g>
      <g className={part('candidate')}><Pill cx={216} cy={148.5} length={178.2} thick={68.9} angle={59.2} fill={GREEN} /></g>
    </svg>
  );
}

/** The mark with the name beside it: "Trio" in a strong weight, "Interview" lighter beneath it. `size` is the height of the mark in pixels. */
export function TrioLogo({ size = 32, className = '', animate = false }: { size?: number; className?: string; animate?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-gray-900 dark:text-gray-100 ${className}`} role="img" aria-label="Trio Interview">
      <TrioMark height={size} className="shrink-0" animate={animate} />
      <span className="flex flex-col leading-none" style={{ fontSize: Math.round(size * 0.72) }}>
        <span className="font-extrabold tracking-tight">Trio</span>
        <span className="font-normal text-gray-600 dark:text-gray-300" style={{ fontSize: '0.62em', marginTop: '0.12em' }}>Interview</span>
      </span>
    </span>
  );
}
