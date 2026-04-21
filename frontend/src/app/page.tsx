import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Layers3,
  NotebookPen,
  Sparkles,
  Users,
} from 'lucide-react';

export default function LandingPage() {
  const pillars = [
    {
      icon: ClipboardList,
      title: 'Tasks',
      description: 'Clear priorities and progress tracking for personal and team work.',
    },
    {
      icon: CalendarDays,
      title: 'Calendar',
      description: 'Day, week, and month views with group event coordination.',
    },
    {
      icon: NotebookPen,
      title: 'Notes',
      description: 'Fast writing with practical formatting and sharing controls.',
    },
    {
      icon: Users,
      title: 'Workspaces',
      description: 'Role-based collaboration in structured team spaces.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-black tracking-[0.08em] text-[var(--foreground)]">PLANORA</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)]/80 transition-colors hover:bg-[var(--muted)]"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition-transform hover:-translate-y-0.5"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative flex-1">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(78,102,198,0.18),transparent_32%),radial-gradient(circle_at_85%_14%,rgba(210,155,125,0.16),transparent_34%),radial-gradient(circle_at_48%_92%,rgba(78,102,198,0.08),transparent_36%)]" />

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-6xl lg:text-7xl">
              One workspace for
              <span className="block text-[var(--primary)]">tasks, notes, and team planning</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)] md:text-xl">
              Planora keeps your daily flow simple: capture work, organize it fast, and collaborate with clarity.
            </p>

          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-14 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {pillars.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-transform hover:-translate-y-1">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary)]/12 text-[var(--primary)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--foreground)]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="rounded-[30px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(78,102,198,0.08),rgba(255,255,255,0.5))] px-6 py-10 shadow-[0_20px_55px_rgba(15,23,42,0.08)] md:px-10">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
                Built to be simple, clear, and easy to use every day.
              </h2>
              <p className="mt-4 text-base leading-8 text-[var(--muted-foreground)]">
                Planora keeps navigation intuitive and actions consistent, so users can focus on tasks, notes, calendars,
                and collaboration instead of learning a complex interface.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[var(--primary-foreground)] transition-transform hover:-translate-y-0.5"
                >
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-6 py-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--card)] px-6 py-6 text-sm text-[var(--muted-foreground)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:px-2">
          <div className="flex items-center gap-2 text-[var(--foreground)]/80">
            <Layers3 className="h-4 w-4 text-[var(--muted-foreground)]" />
            <span>Planora</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--background)] px-3 py-1.5 text-xs">planora.invitations.noreply@gmail.com</span>
            <span className="rounded-full bg-[var(--background)] px-3 py-1.5 text-xs">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
