import { APP_NAME } from '../config/app';

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-[28%] ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <img src="/zodGantt.png" width={size} height={size} alt={APP_NAME} className="h-full w-full object-cover object-top" />
    </span>
  );
}

export function LogoLockup({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/zodGantt.png"
      alt={APP_NAME}
      className={`h-10 w-auto object-contain ${className ?? ''}`}
      style={{ maxWidth: size * 4.5 }}
    />
  );
}
