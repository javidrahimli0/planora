'use client';

import { PlanoraEvent } from '@/types/event';
import { EventCategoryOption, resolveEventCategory } from '@/lib/eventCategories';
import { format } from 'date-fns';
import { useEffect, useRef } from 'react';

interface EventHoverPreviewProps {
  event: PlanoraEvent | null;
  categoryOptions: EventCategoryOption[];
  position: { x: number; y: number } | null;
  visible: boolean;
  calendarBounds: DOMRect | null;
}

const PREVIEW_WIDTH = 280;
const PREVIEW_HEIGHT = 180;
const OFFSET_X = 12;
const OFFSET_Y = 12;

export default function EventHoverPreview({
  event,
  categoryOptions,
  position,
  visible,
  calendarBounds,
}: EventHoverPreviewProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);

  if (!event || !position || !calendarBounds) return null;

  const category = resolveEventCategory(event.event_type, event.color, categoryOptions);

  // Calculate best position to keep preview within calendar bounds
  let x = position.x + OFFSET_X;
  let y = position.y + OFFSET_Y;

  // Adjust horizontal position if preview goes beyond right edge
  if (x + PREVIEW_WIDTH > calendarBounds.right) {
    x = calendarBounds.right - PREVIEW_WIDTH - 12;
  }

  // Adjust vertical position if preview goes beyond bottom edge
  if (y + PREVIEW_HEIGHT > calendarBounds.bottom) {
    y = position.y - PREVIEW_HEIGHT - OFFSET_Y;
  }

  // Ensure preview stays within left edge
  if (x < calendarBounds.left) {
    x = calendarBounds.left + 12;
  }

  // Ensure preview stays within top edge
  if (y < calendarBounds.top) {
    y = calendarBounds.top + 12;
  }

  const startTime = format(new Date(event.start_time), 'HH:mm');
  const endTime = format(new Date(event.end_time), 'HH:mm');

  return (
    <div
      ref={previewRef}
      className={`fixed z-50 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_16px_48px_rgba(9,25,48,0.2)] p-4 pointer-events-none transition-all duration-150 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${PREVIEW_WIDTH}px`,
      }}
    >
      <div className="space-y-2.5">
        {/* Title */}
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)] line-clamp-2">{event.title}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            {startTime} - {endTime}
          </p>
        </div>

        {/* Description */}
        {event.description && (
          <>
            <div className="h-px bg-[var(--border)]/50" />
            <p className="text-xs text-[var(--muted-foreground)] line-clamp-3">{event.description}</p>
          </>
        )}

        {/* Category Tag */}
        <div className="h-px bg-[var(--border)]/50" />
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)]/40 px-2 py-1">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: category.color }} />
          <span className="text-xs font-medium text-[var(--foreground)]">{category.label}</span>
        </div>
      </div>
    </div>
  );
}
