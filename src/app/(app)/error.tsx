"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-10">
      <Notice tone="danger" title="Something went wrong on this page">
        Your saved work is safe. You can retry, or go back and continue elsewhere.
        {error.digest ? <span className="mt-1 block text-xs opacity-75">Reference: {error.digest}</span> : null}
      </Notice>
      <div>
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}
