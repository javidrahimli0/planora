import PlanoraLogoMark from '@/components/shared/PlanoraLogoMark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center justify-center gap-0.5 mb-8">
          <div className="flex items-center justify-center">
            <PlanoraLogoMark className="h-8 w-8" />
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
