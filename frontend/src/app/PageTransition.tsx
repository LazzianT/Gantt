import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/** Replays the `page-in` animation whenever the pathname changes. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="animate-page-in">
      {children}
    </div>
  );
}
