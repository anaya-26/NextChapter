import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = { id: string; name: string; email: string };

/** Reads and validates the session once per request (Data Access Layer entry point). */
export const getSession = cache(async () => {
  return auth().api.getSession({ headers: await headers() });
});

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}

/** Use at the top of every page, Server Action and Route Handler that touches student data. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
