import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { env } from "./env";
import { bootstrapStudent } from "./services/profile";

function createAuth() {
  const e = env();
  return betterAuth({
    appName: "Kadam",
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    socialProviders: e.googleConfigured
      ? { google: { clientId: e.GOOGLE_CLIENT_ID!, clientSecret: e.GOOGLE_CLIENT_SECRET! } }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: e.NODE_ENV === "production", window: 60, max: 30 },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await bootstrapStudent(user.id, user.name);
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | null = null;

/** Lazily created so `next build` does not need runtime secrets. */
export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
