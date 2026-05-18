"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@ui/components";
import { useActivity } from "@refi/api-clients";
import { appCopy } from "../../_content/app-copy";

const { activity } = appCopy;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ActivityPage() {
  const { data, isLoading } = useActivity();
  const events = data ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {activity.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{activity.subheading}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{activity.type}</TableHead>
            <TableHead>{activity.timestamp}</TableHead>
            <TableHead>{activity.description}</TableHead>
            <TableHead>{activity.status}</TableHead>
            <TableHead>{activity.decisionRecord}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-charcoal-500 py-12 text-sm"
              >
                Loading…
              </TableCell>
            </TableRow>
          ) : events.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-charcoal-500 py-12 text-sm"
              >
                {activity.emptyState}
              </TableCell>
            </TableRow>
          ) : (
            events.map((evt) => (
              <TableRow key={evt.id}>
                <TableCell className="capitalize">{evt.type}</TableCell>
                <TableCell className="font-mono tabular-nums text-charcoal-400">
                  {formatTimestamp(evt.created_at)}
                </TableCell>
                <TableCell>{evt.description}</TableCell>
                <TableCell className="text-charcoal-400">—</TableCell>
                <TableCell className="text-charcoal-400">—</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
