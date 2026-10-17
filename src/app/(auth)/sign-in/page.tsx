import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next } = await props.searchParams;
  return <AuthForm mode="sign-in" next={typeof next === "string" ? next : undefined} googleEnabled={env().googleConfigured} />;
}
