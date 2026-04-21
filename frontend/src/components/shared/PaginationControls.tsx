'use client';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}

export default function PaginationControls({ page, totalPages, onPageChange, className }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className={`mt-3 flex items-center justify-between gap-2 ${className || ''}`}>
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs disabled:opacity-50"
      >
        Previous
      </button>
      <p className="text-xs text-[var(--muted-foreground)]">
        Page {page} of {totalPages}
      </p>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}
