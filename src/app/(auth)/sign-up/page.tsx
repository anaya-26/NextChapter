import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  return <AuthForm mode="sign-up" googleEnabled={env().googleConfigured} />;
}
