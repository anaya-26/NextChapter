// Writes a working .env for the dev container: fresh secrets, the local database, the public
// Codespaces address, and demo settings. Values you have already set are kept.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const file = ".env";
if (!existsSync(file)) copyFileSync(".env.example", file);
let text = readFileSync(file, "utf8");

const read = (key) => new RegExp(`^${key}="?([^"\\n]*)"?`, "m").exec(text)?.[1] ?? "";
const write = (key, value) => {
  const line = `${key}="${value}"`;
  text = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
};
const fillIfEmpty = (key, value) => {
  if (!read(key)) write(key, value);
};

const codespace = process.env.CODESPACE_NAME;
const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const publicUrl = codespace && domain ? `https://${codespace}-3000.${domain}` : "http://localhost:3000";

fillIfEmpty("DATABASE_URL", "postgresql://nextchapter:change-me@localhost:5432/nextchapter_dev?schema=public");
fillIfEmpty("BETTER_AUTH_SECRET", randomBytes(32).toString("base64"));
fillIfEmpty("APP_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
write("BETTER_AUTH_URL", publicUrl);
// With an Anthropic key (e.g. a Codespaces secret) use real AI; without one, the labelled test double.
if (process.env.ANTHROPIC_API_KEY || read("ANTHROPIC_API_KEY")) write("AI_PROVIDER", "anthropic");
else fillIfEmpty("AI_PROVIDER", "mock");
fillIfEmpty("RUN_WORKER_IN_PROCESS", "true");
write("ENABLE_DEMO_TOOLS", "true");
write("ENABLE_TEST_CLOCK", "true");
write("SEED_DEMO_ACCOUNT", "true");
fillIfEmpty("SEED_DEMO_EMAIL", "demo@example.com");
fillIfEmpty("SEED_DEMO_PASSWORD", "nextchapter-demo");

writeFileSync(file, text);
console.log(`.env ready — app address: ${publicUrl}`);
