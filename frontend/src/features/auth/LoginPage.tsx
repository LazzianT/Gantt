import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../../config/app';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckSquare,
  Flag,
  Gauge,
  Link2,
  Loader2,
  Network,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { setToken } from '../../lib/auth';
import type { LoginResponse } from '../../types';
import { LogoMark } from '../../components/Logo';

interface FieldErrors {
  nip?: string;
  birthDate?: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [nip, setNip] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!nip.trim()) next.nip = 'NIP is required.';
    if (!birthDate) next.birthDate = 'Tanggal Lahir is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { token } = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { nip: nip.trim(), birthDate },
      });
      setToken(token, remember);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Cannot reach the server. Check your connection.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[3fr_2fr]">
      <ProductCarousel />

      <section className="flex items-center justify-center bg-white px-6 py-10 sm:px-10">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark size={30} />
            <span className="font-semibold tracking-tight text-[#0F172A]">
{APP_NAME}
            </span>
          </div>

          <form onSubmit={onSubmit} noValidate aria-busy={submitting}>
            <h1 className="text-[32px] font-bold text-[#0F172A]">Sign in</h1>
            <p className="mt-1.5 text-sm text-[#5B6B79]">
              Use your employee ID to continue to {APP_NAME}.
            </p>

            <div className="mt-7 space-y-4">
              <div>
                <label
                  htmlFor="nip"
                  className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                >
                  NIP (Employee ID)
                </label>
                <div className="relative">
                  <User
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA7B3]"
                  />
                  <input
                    id="nip"
                    name="nip"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    autoFocus
                    value={nip}
                    onChange={(event) => {
                      setNip(event.target.value);
                      if (errors.nip) setErrors((prev) => ({ ...prev, nip: undefined }));
                    }}
                    aria-invalid={errors.nip ? true : undefined}
                    aria-describedby={errors.nip ? 'nip-error' : undefined}
                    placeholder="e.g. 1234"
                    className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm text-[#0F172A] placeholder:text-[#9AA7B3] focus:outline-none focus:ring-2 ${
                      errors.nip
                        ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/15'
                        : 'border-[#D5DBE1] focus:border-[#14B8A6] focus:ring-[#14B8A6]/20'
                    }`}
                  />
                </div>
                {errors.nip && (
                  <p id="nip-error" className="mt-1 text-xs font-medium text-[#DC2626]">
                    {errors.nip}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="birthDate"
                  className="mb-1.5 block text-sm font-semibold text-[#0F172A]"
                >
                  Tanggal Lahir
                </label>
                <div className="relative">
                  <Calendar
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA7B3]"
                  />
                  <input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    autoComplete="bday"
                    placeholder="dd/mm/yyyy"
                    value={birthDate}
                    onChange={(event) => {
                      setBirthDate(event.target.value);
                      if (errors.birthDate)
                        setErrors((prev) => ({ ...prev, birthDate: undefined }));
                    }}
                    aria-invalid={errors.birthDate ? true : undefined}
                    aria-describedby={errors.birthDate ? 'birthDate-error' : undefined}
                    className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm text-[#0F172A] placeholder:text-[#9AA7B3] focus:outline-none focus:ring-2 ${
                      errors.birthDate
                        ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/15'
                        : 'border-[#D5DBE1] focus:border-[#14B8A6] focus:ring-[#14B8A6]/20'
                    }`}
                  />
                </div>
                {errors.birthDate && (
                  <p id="birthDate-error" className="mt-1 text-xs font-medium text-[#DC2626]">
                    {errors.birthDate}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#5B6B79]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-[#D5DBE1] accent-[#14B8A6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/30"
                />
                Remember me
              </label>
              <a
                href="mailto:it-support@example.com"
                className="rounded text-sm font-medium text-[#14B8A6] transition-colors hover:text-[#0D9488] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/30"
              >
                Need help?
              </a>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEE2E2] px-3 py-2 text-xs font-medium text-[#B91C1C]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#14B8A6] text-sm font-semibold text-white transition-colors hover:bg-[#0D9488] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <footer className="mt-6 text-center text-xs text-[#9AA7B3]">
            {APP_NAME} · v{__APP_VERSION__}
          </footer>
        </div>
      </section>
    </div>
  );
}

function ProductCarousel() {
  const slideCount = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const drag = useRef({ x: 0, active: false });

  function go(next: number) {
    setIndex(((next % slideCount) + slideCount) % slideCount);
  }

  useEffect(() => {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % slideCount), 6000);
    return () => window.clearInterval(id);
  }, [paused, slideCount]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return;
    drag.current = { x: event.clientX, active: true };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    const delta = event.clientX - drag.current.x;
    if (Math.abs(delta) > 60) {
      go(index + (delta < 0 ? 1 : -1));
      drag.current.active = false;
    }
  }

  function endDrag() {
    drag.current.active = false;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') go(index + 1);
    if (event.key === 'ArrowLeft') go(index - 1);
  }

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Product highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="relative hidden flex-col overflow-hidden bg-[#EFFBF8] px-10 py-12 lg:flex xl:px-16"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-[#DCF3EE]" />
        <div className="absolute right-16 top-44 h-[260px] w-[260px] rounded-full bg-[#E7F7F3]" />
        <div className="absolute -bottom-44 -left-32 h-[320px] w-[380px] rounded-full bg-[#E3F5F1]" />
        <svg className="absolute -right-16 -top-24 h-[520px] w-[520px]" viewBox="0 0 520 520" fill="none">
          <circle cx="260" cy="260" r="180" stroke="#BEE7DF" strokeWidth="1" />
          <circle cx="260" cy="260" r="240" stroke="#CFEDE7" strokeWidth="1" />
        </svg>
      </div>

      <div className="relative flex items-center gap-2.5">
        <LogoMark size={30} />
        <span className="font-semibold tracking-tight text-[#0F172A]">{APP_NAME}</span>
      </div>

      <div
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={onKeyDown}
        className="relative flex-1 overflow-hidden py-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/30"
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div
              key={slide.badge}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${slideCount}`}
              className="relative flex h-full w-full shrink-0 flex-col justify-center"
            >
              <div className="relative z-10 max-w-[440px] xl:max-w-[55%]">
                <span className="inline-flex items-center rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#14B8A6]">
                  {slide.badge}
                </span>
                <h1 className="mt-6 text-[40px] font-extrabold leading-[1.1] tracking-tight text-[#0F172A]">
                  {slide.titleNode}
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed text-[#5B6B79]">{slide.body}</p>

                <div className="mt-8 space-y-5">
                  {slide.features.map(({ icon: Icon, chip, ink, title, sub }) => (
                    <div key={title} className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${chip}`}>
                        <Icon size={17} className={ink} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-[#0F172A]">{title}</p>
                        <p className="text-[13px] text-[#5B6B79]">{sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute right-0 top-1/2 hidden w-[440px] max-w-[52%] -translate-y-1/2 xl:block">
                {slide.illustration}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center">
        <div className="flex items-center gap-1.5">
          {slides.map((slide, i) => {
            const active = i === index;
            return (
              <button
                key={slide.badge}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => setIndex(i)}
                className="-my-3 rounded py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/40"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ${
                    active ? 'w-8 bg-[#14B8A6]' : 'w-5 bg-[#CBD5DD] hover:bg-[#AEBBC6]'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="flex flex-1 items-center justify-center gap-3">
          <span className="text-sm text-[#4B5563]">Better planning. Brighter outcomes.</span>
          <span className="h-px w-8 bg-[#14B8A6]" />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        Slide {index + 1} of {slideCount}
      </p>
    </section>
  );
}

interface Slide {
  badge: string;
  titleNode: ReactNode;
  body: string;
  features: {
    icon: typeof CheckSquare;
    chip: string;
    ink: string;
    title: string;
    sub: string;
  }[];
  illustration: ReactNode;
}

const slides: Slide[] = [
  {
    badge: 'Work Smarter Together',
    titleNode: (
      <>
        Plan, schedule and <span className="text-[#14B8A6]">deliver projects</span>
      </>
    ),
    body: 'Keep your team aligned, track progress, and turn ideas into impactful results — all in one place.',
    features: [
      { icon: CheckSquare, chip: 'bg-[#EEF2FF]', ink: 'text-[#4F6EF7]', title: 'Task Management', sub: 'Organize and prioritize work' },
      { icon: Users, chip: 'bg-[#E8F8F5]', ink: 'text-[#14B8A6]', title: 'Team Collaboration', sub: 'Work together seamlessly' },
      { icon: BarChart3, chip: 'bg-[#FFF3E6]', ink: 'text-[#F59E0B]', title: 'Project Tracking', sub: 'Monitor progress in real time' },
    ],
    illustration: <GanttIllustration />,
  },
  {
    badge: 'One Timeline',
    titleNode: (
      <>
        See every task on a <span className="text-[#14B8A6]">single timeline</span>
      </>
    ),
    body: 'Link tasks with dependencies and follow the critical path so nothing slips between hand-offs.',
    features: [
      { icon: Network, chip: 'bg-[#EEF2FF]', ink: 'text-[#4F6EF7]', title: 'Work Breakdown Structure', sub: 'Organize work hierarchically' },
      { icon: Link2, chip: 'bg-[#E8F8F5]', ink: 'text-[#14B8A6]', title: 'Dependencies', sub: 'FS, SS, FF and SF links' },
      { icon: Activity, chip: 'bg-[#FFF3E6]', ink: 'text-[#F59E0B]', title: 'Critical Path', sub: 'Spot what drives the deadline' },
    ],
    illustration: <DependencyIllustration />,
  },
  {
    badge: 'Balanced Teams',
    titleNode: (
      <>
        Keep teams balanced and <span className="text-[#14B8A6]">on track</span>
      </>
    ),
    body: 'Assign people to work, watch utilization across the team, and compare milestones against the plan.',
    features: [
      { icon: UserPlus, chip: 'bg-[#EEF2FF]', ink: 'text-[#4F6EF7]', title: 'Resource Assignment', sub: 'Assign people to tasks' },
      { icon: Gauge, chip: 'bg-[#FFF3E6]', ink: 'text-[#F59E0B]', title: 'Workload', sub: 'Spot over-allocation early' },
      { icon: Flag, chip: 'bg-[#E8F8F5]', ink: 'text-[#14B8A6]', title: 'Milestones & Baseline', sub: 'Track progress vs plan' },
    ],
    illustration: <WorkloadIllustration />,
  },
];

function GanttIllustration() {
  return (
    <div className="relative">
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_44px_-20px_rgba(15,23,42,0.28)] ring-1 ring-black/5">
        <svg viewBox="0 0 320 190" className="h-auto w-full" role="presentation" aria-hidden="true">
          {[120, 180, 240].map((x) => (
            <line key={x} x1={x} y1={14} x2={x} y2={176} stroke="#EEF1F5" strokeWidth="1" />
          ))}

          {[24, 56, 88, 120, 152].map((y) => (
            <rect key={y} x={2} y={y - 4} width={62} height={7} rx={3.5} fill="#EDF0F3" />
          ))}

          <rect x={110} y={20} width={90} height={10} rx={5} fill="#14B8A6" />
          <rect x={150} y={52} width={120} height={10} rx={5} fill="#E8ECF1" />
          <rect x={150} y={52} width={62} height={10} rx={5} fill="#14B8A6" />
          <rect x={190} y={84} width={104} height={10} rx={5} fill="#DCE7FB" />
          <rect x={190} y={84} width={54} height={10} rx={5} fill="#4F6EF7" />
          <rect x={120} y={116} width={150} height={10} rx={5} fill="#DCE7FB" />
          <rect x={120} y={116} width={70} height={10} rx={5} fill="#7FA9F5" />
          <rect x={160} y={148} width={96} height={10} rx={5} fill="#DCE7FB" />

          <circle cx={250} cy={84} r={4} fill="#0F172A" />
          <line
            x1={250}
            y1={12}
            x2={250}
            y2={176}
            stroke="#9AA7B4"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        </svg>
      </div>

      <div className="absolute -bottom-6 -left-6 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_16px_36px_-18px_rgba(15,23,42,0.3)] ring-1 ring-black/5">
        <svg width="44" height="44" viewBox="0 0 44 44" role="presentation" aria-hidden="true">
          <circle cx="22" cy="22" r="17" fill="none" stroke="#E8ECF1" strokeWidth="5" />
          <circle
            cx="22"
            cy="22"
            r="17"
            fill="none"
            stroke="#14B8A6"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="83.3 106.8"
            transform="rotate(-90 22 22)"
          />
          <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F172A">
            78%
          </text>
        </svg>
        <div>
          <p className="text-sm font-bold text-[#0F172A]">Project Progress</p>
          <p className="text-[12px] text-[#5B6B79]">12 of 15 tasks completed</p>
        </div>
      </div>
    </div>
  );
}

function DependencyIllustration() {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_18px_44px_-20px_rgba(15,23,42,0.28)] ring-1 ring-black/5">
      <svg viewBox="0 0 320 190" className="h-auto w-full" role="presentation" aria-hidden="true">
        <defs>
          <marker id="dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0 0L6 3L0 6Z" fill="#9AA7B4" />
          </marker>
        </defs>

        {[16, 48, 80, 112, 144].map((y) => (
          <rect key={y} x={2} y={y - 4} width={54} height={7} rx={3.5} fill="#EDF0F3" />
        ))}

        <rect x={16} y={24} width={64} height={10} rx={5} fill="#14B8A6" />
        <rect x={96} y={58} width={96} height={10} rx={5} fill="#4F6EF7" />
        <rect x={176} y={92} width={88} height={10} rx={5} fill="#EF4444" />
        <rect x={60} y={126} width={120} height={10} rx={5} fill="#E8ECF1" />

        <path d="M80 34 V63 H96" fill="none" stroke="#9AA7B4" strokeWidth="1.5" markerEnd="url(#dep-arrow)" />
        <path d="M192 68 V97 H176" fill="none" stroke="#9AA7B4" strokeWidth="1.5" markerEnd="url(#dep-arrow)" />
        <path d="M176 102 V131 H60" fill="none" stroke="#9AA7B4" strokeWidth="1.5" markerEnd="url(#dep-arrow)" />

        <line x1={250} y1={12} x2={250} y2={176} stroke="#9AA7B4" strokeWidth="1" strokeDasharray="4 4" />
      </svg>
    </div>
  );
}

function WorkloadIllustration() {
  const rows = [
    { y: 22, width: 120, fill: '#14B8A6' },
    { y: 46, width: 150, fill: '#14B8A6' },
    { y: 70, width: 96, fill: '#7FA9F5' },
    { y: 94, width: 210, fill: '#F59E0B' },
    { y: 118, width: 132, fill: '#14B8A6' },
    { y: 142, width: 84, fill: '#A7E8DF' },
  ];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_18px_44px_-20px_rgba(15,23,42,0.28)] ring-1 ring-black/5">
      <svg viewBox="0 0 320 190" className="h-auto w-full" role="presentation" aria-hidden="true">
        {rows.map((row) => (
          <rect key={row.y} x={40} y={row.y} width={220} height={12} rx={6} fill="#EEF1F5" />
        ))}

        {rows.map((row) => (
          <rect key={row.y} x={40} y={row.y} width={row.width} height={12} rx={6} fill={row.fill} />
        ))}

        <line x1={200} y1={12} x2={200} y2={166} stroke="#9AA7B4" strokeWidth="1" strokeDasharray="4 4" />
        <text x={200} y={176} textAnchor="middle" fontSize="9" fontWeight="600" fill="#9AA7B4">
          capacity
        </text>
      </svg>
    </div>
  );
}
