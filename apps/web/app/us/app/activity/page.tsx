import type { Metadata } from "next";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@ui/components";
import { appCopy } from "../../_content/app-copy";

export const metadata: Metadata = { title: "Activity" };

const { activity } = appCopy;

export default function ActivityPage() {
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
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-charcoal-500 py-12 text-sm"
            >
              {activity.emptyState}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
