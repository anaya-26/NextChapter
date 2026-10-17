import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">We couldn’t find that</h1>
      <p className="text-sm text-muted">It may have been deleted, moved, or it isn’t available to your account.</p>
      <Button asChild variant="outline">
        <Link href="/today">Go to Today</Link>
      </Button>
    </div>
  );
}
