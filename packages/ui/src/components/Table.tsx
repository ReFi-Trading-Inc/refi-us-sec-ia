import { cn } from "../lib/utils";
import { ChevronUp, ChevronDown } from "../icons";

function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-auto rounded-lg border border-charcoal-700">
      <table
        className={cn("w-full text-sm text-charcoal-200", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-charcoal-700 bg-charcoal-800/50",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn("divide-y divide-charcoal-700/50", className)}
      {...props}
    />
  );
}

function TableRow({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-charcoal-700/30",
        selected && "bg-mint-400/5 hover:bg-mint-400/10",
        className,
      )}
      aria-selected={selected}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc" | null;

function TableHead({
  className,
  sortable,
  sortDirection,
  onSort,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-charcoal-400",
        sortable && "cursor-pointer select-none hover:text-charcoal-200",
        className,
      )}
      aria-sort={
        sortDirection === "asc"
          ? "ascending"
          : sortDirection === "desc"
            ? "descending"
            : sortable
              ? "none"
              : undefined
      }
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortable && (
          <span className="flex flex-col" aria-hidden="true">
            <ChevronUp
              className={cn(
                "h-3 w-3 -mb-0.5",
                sortDirection === "asc" ? "text-mint-400" : "text-charcoal-600",
              )}
            />
            <ChevronDown
              className={cn(
                "h-3 w-3 -mt-0.5",
                sortDirection === "desc"
                  ? "text-mint-400"
                  : "text-charcoal-600",
              )}
            />
          </span>
        )}
      </span>
    </th>
  );
}

function TableCell({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3",
        numeric && "font-mono tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
