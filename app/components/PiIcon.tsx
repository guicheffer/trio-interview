/** The Pi mark: the letter pi drawn as plain shapes so it needs no image file */
export function PiIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#6366F1" />
      <path d="M6 8h12M9 8v9M15 8v7.5c0 1 .6 1.5 1.5 1.5" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
