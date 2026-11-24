/** The OpenCode mark: a square with a notch, drawn as plain shapes so it needs no image file */
export function OpenCodeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#9CA3AF" d="M4 3h16v18H4z" />
      <path fill="#1F1F1F" d="M8 8h8v8H8z" />
      <path fill="#E5E7EB" d="M10 10h4v4h-4z" />
    </svg>
  );
}
