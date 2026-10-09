export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Project Management"
      focusable="false"
      className={className}
    >
      <rect x="5" y="7" width="12" height="4" rx="2" fill="currentColor" />
      <rect x="5" y="14" width="18" height="4" rx="2" fill="currentColor" />
      <rect x="5" y="21" width="22" height="4" rx="2" fill="currentColor" opacity="0.55" />
      <circle cx="26" cy="16" r="2.8" fill="#18B6A4" />
    </svg>
  );
}

export function LogoLockup({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span className="font-semibold tracking-tight">Project Management</span>
    </span>
  );
}
