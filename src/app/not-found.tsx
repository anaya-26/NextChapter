import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">We couldn’t find that page</h1>
      <p className="text-sm text-muted">Check the address, or start again from Today.</p>
      <Link href="/today" className="text-primary underline">
        Go to Today
      </Link>
    </main>
  );
}
