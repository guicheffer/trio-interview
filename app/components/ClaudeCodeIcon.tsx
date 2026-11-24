/** The Claude Code mark: the orange pixel creature, drawn as plain shapes so it needs no image file */
export function ClaudeCodeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#D97757" d="M5 7h14v8H5z" />
      <path fill="#D97757" d="M2 10h3v3H2zM19 10h3v3h-3z" />
      <path fill="#D97757" d="M6 15h2v4H6zM9 15h2v4H9zM13 15h2v4h-2zM16 15h2v4h-2z" />
      <path fill="#1F1F1F" d="M8 10h2v2H8zM14 10h2v2h-2z" />
    </svg>
  );
}
