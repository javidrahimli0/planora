export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
            <span className="text-[var(--primary-foreground)] font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-lg tracking-tight text-[var(--foreground)]">
            Planora
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
