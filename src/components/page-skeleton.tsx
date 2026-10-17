import { Skeleton } from "@/components/ui/feedback";

/** Shared loading state for app pages (each route segment re-exports it from loading.tsx). */
export default function PageSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}
