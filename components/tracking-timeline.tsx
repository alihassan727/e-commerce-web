import type { OrderTrackingEvent } from '@/lib/types';

/**
 * Tracking timeline stages and how they map to values that can appear in
 * either `orders.status` (the enum) or `order_tracking_events.status`
 * (free-text strings the admin types).
 *
 * Problem this solves: the orders.status enum uses 'shipped' but the admin
 * tracking form uses more granular stages like 'dispatched', 'in_transit',
 * 'out_for_delivery'. We need a single consistent mapping so the progress
 * bar fills correctly regardless of which set of values is in play.
 *
 * Strategy: define a canonical stage order and map every known alias to its
 * canonical index. The timeline renders based on that index.
 */

const STAGES = [
  { key: 'placed',           label: 'Order Placed' },
  { key: 'confirmed',        label: 'Order Confirmed' },
  { key: 'processing',       label: 'Processing' },
  { key: 'shipped',          label: 'Shipped' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered',        label: 'Delivered' },
];

/**
 * Maps every known status value (from orders.status enum OR
 * order_tracking_events.status free text) to a canonical stage index.
 * Values not found here return -1 (unknown / no progress shown).
 */
const STATUS_TO_INDEX: Record<string, number> = {
  // Order placed → index 0
  pending: 0,
  placed: 0,

  // Confirmed → index 1
  confirmed: 1,

  // Processing → index 2
  processing: 2,

  // Shipped (and all dispatched/in-transit aliases) → index 3
  shipped: 3,
  dispatched: 3,
  in_transit: 3,
  'in transit': 3,

  // Out for delivery → index 4
  out_for_delivery: 4,
  'out for delivery': 4,

  // Delivered → index 5
  delivered: 5,
};

const CANCELLED_VALUES = new Set([
  'cancelled',
  'canceled',
  'returned',
  'out_of_stock',
]);

export default function TrackingTimeline({
  currentStatus,
  events,
}: {
  currentStatus: string;
  events: OrderTrackingEvent[];
}) {
  const normalised = currentStatus.toLowerCase().trim();
  const isCancelled = CANCELLED_VALUES.has(normalised);

  // The furthest reached index is the max of:
  //  1. The index of the current orders.status
  //  2. The index of the furthest order_tracking_events.status event
  // This means manually added tracking events can advance the bar even when
  // the orders.status hasn't caught up yet.
  const orderStatusIdx = STATUS_TO_INDEX[normalised] ?? -1;
  const eventMaxIdx = events.reduce((max, e) => {
    const idx = STATUS_TO_INDEX[e.status.toLowerCase().trim()] ?? -1;
    return Math.max(max, idx);
  }, -1);
  const currentIdx = Math.max(orderStatusIdx, eventMaxIdx);

  // Build a map of the most recent event per stage index for descriptions.
  const eventByStageIdx = new Map<number, OrderTrackingEvent>();
  for (const e of [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )) {
    const idx = STATUS_TO_INDEX[e.status.toLowerCase().trim()];
    if (idx !== undefined) eventByStageIdx.set(idx, e);
  }

  if (isCancelled) {
    const lastEvent = events.at(-1);
    return (
      <div className="border border-line dark:border-dark-line p-4">
        <p className="font-medium text-ink dark:text-dark-ink capitalize">
          Order {currentStatus.replace(/_/g, ' ')}
        </p>
        {lastEvent?.description && (
          <p className="text-sm text-muted dark:text-dark-muted mt-1">
            {lastEvent.description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {STAGES.map((stage, idx) => {
        const reached  = currentIdx >= idx;
        const isActive = currentIdx === idx;
        const event    = eventByStageIdx.get(idx);

        return (
          <div key={stage.key} className="flex gap-4 items-start">
            {/* Dot + vertical connector */}
            <div className="flex flex-col items-center shrink-0">
              <div
                className={`w-3 h-3 border-2 mt-1 ${
                  reached
                    ? 'theme-border theme-bg'
                    : 'border-line dark:border-dark-line bg-canvas dark:bg-dark-canvas'
                }`}
                style={{ borderRadius: '0' }}
              />
              {idx < STAGES.length - 1 && (
                <div
                  className={`w-px flex-1 mt-0 ${
                    reached ? 'theme-bg' : 'bg-line dark:bg-dark-line'
                  }`}
                  style={{ minHeight: '2rem' }}
                />
              )}
            </div>

            {/* Stage label + event detail */}
            <div className="pb-6">
              <p
                className={`text-sm font-medium ${
                  isActive
                    ? 'theme-text'
                    : reached
                      ? 'text-ink dark:text-dark-ink'
                      : 'text-muted dark:text-dark-muted'
                }`}
              >
                {stage.label}
              </p>
              {event && (
                <>
                  {event.description && (
                    <p className="text-xs text-muted dark:text-dark-muted mt-0.5">
                      {event.description}
                    </p>
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
