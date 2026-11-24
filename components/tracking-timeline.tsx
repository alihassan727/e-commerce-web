import type { OrderTrackingEvent } from '@/lib/types';

const STAGES = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Order Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const CANCELLED_STAGES = new Set(['cancelled', 'returned', 'out_of_stock']);

function getStageIndex(status: string): number {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

export default function TrackingTimeline({
  currentStatus,
  events,
}: {
  currentStatus: string;
  events: OrderTrackingEvent[];
}) {
  const isCancelled = CANCELLED_STAGES.has(currentStatus);
  const currentIdx = getStageIndex(currentStatus);

  // Map event status to the matching stage for descriptions.
  const eventByStage = new Map<string, OrderTrackingEvent>();
  for (const e of events) {
    eventByStage.set(e.status, e);
  }

  if (isCancelled) {
    return (
      <div className="border border-line dark:border-dark-line p-4">
        <p className="font-medium text-ink dark:text-dark-ink">Order {currentStatus}</p>
        {events.length > 0 && (
          <p className="text-sm text-muted dark:text-dark-muted mt-1">
            {events[events.length - 1]?.description ?? ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {STAGES.map((stage, idx) => {
        const reached = currentIdx >= idx;
        const isActive = currentIdx === idx;
        const event = eventByStage.get(stage.key);

        return (
          <div key={stage.key} className="flex gap-4 items-start">
            {/* Line + dot */}
            <div className="flex flex-col items-center">
      <div
        className={`w-3 h-3 border-2 mt-1 ${reached ? 'theme-border theme-bg' : 'border-line dark:border-dark-line bg-canvas dark:bg-dark-canvas'}`}
        style={{ borderRadius: '0' }}
      />
              {idx < STAGES.length - 1 && (
                <div className={`w-px flex-1 mt-0 ${reached ? 'theme-bg' : 'bg-line dark:bg-dark-line'}`} style={{ minHeight: '2rem' }} />
              )}
            </div>
            {/* Label */}
            <div className="pb-6">
              <p className={`text-sm font-medium ${isActive ? 'theme-text' : reached ? 'text-ink dark:text-dark-ink' : 'text-muted dark:text-dark-muted'}`}>
                {stage.label}
              </p>
              {event && (
                <>
                  {event.description && (
                    <p className="text-xs text-muted dark:text-dark-muted mt-0.5">{event.description}</p>
                  )}
                  <p className="text-xs text-muted dark:text-dark-muted mt-0.5">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
