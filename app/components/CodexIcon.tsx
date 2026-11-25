/** A neutral mark for Codex (a rounded square with a prompt), drawn as plain shapes. It is not the vendor's logo. */
export function CodexIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#9CA3AF" />
      <path d="M7 9l3.5 3L7 15M12.5 15.5H17" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
