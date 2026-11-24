/**
 * The Trio mark: three people in one session (the interviewer, the candidate and the assistant), drawn as three
 * dots joined by a triangle. It follows the text colour, so the same component works in light and dark mode.
 */
export function TrioMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 6.5 6.5 24h19L16 6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" opacity="0.45" />
      <circle cx="16" cy="6.5" r="4" fill="#10B981" />
      <circle cx="6.5" cy="24" r="4" fill="currentColor" />
      <circle cx="25.5" cy="24" r="4" fill="#6366F1" />
    </svg>
  );
}

/** The mark with the name next to it. `size` is the height of the mark in pixels. */
export function TrioLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-gray-900 dark:text-gray-100 ${className}`} role="img" aria-label="Trio">
      <TrioMark className="shrink-0" />
      <span className="font-semibold tracking-tight" style={{ fontSize: Math.round(size * 0.75), lineHeight: 1 }}>Trio</span>
    </span>
  );
}
