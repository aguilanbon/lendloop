import type { Availability } from "@convex/tools";
import { formatDate } from "@/lib/format";
import { Badge } from "./ui";

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability.state === "on_loan") {
    return availability.overdue ? (
      <Badge tone="danger">Overdue since {formatDate(availability.until)}</Badge>
    ) : (
      <Badge tone="warn">On loan until {formatDate(availability.until)}</Badge>
    );
  }
  return (
    <Badge tone="accent">
      Available
      {availability.nextBookingStart && <> · booked from {formatDate(availability.nextBookingStart)}</>}
    </Badge>
  );
}
