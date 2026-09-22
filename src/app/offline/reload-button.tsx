"use client";

import { Button } from "@/components/ui/button";

/**
 * Retry affordance for the offline fallback page. Client component because the
 * page itself stays a server component for metadata support.
 */
export function ReloadButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      Retry the connection
    </Button>
  );
}
