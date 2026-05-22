import { Card, CardContent } from "@ui/components";
import { exceptionsCopy } from "../../_content/app-copy";

// Placeholder route for Phase 2 surface 1. Managed-mode recommendations that
// need user attention link here. The real Exception Review list, resolution
// categories, and decision-record wiring ship with surface 6.
export default function ExceptionsPlaceholderPage() {
  return (
    <div
      className="flex flex-col gap-6 max-w-3xl"
      data-testid="exceptions-placeholder-page"
    >
      <div>
        <h1 className="text-xl font-semibold text-charcoal-50 mb-1">
          {exceptionsCopy.heading}
        </h1>
        <p className="text-sm text-charcoal-400">{exceptionsCopy.subheading}</p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <p
            className="text-sm text-charcoal-300"
            data-testid="exceptions-placeholder-body"
          >
            {exceptionsCopy.placeholder}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
