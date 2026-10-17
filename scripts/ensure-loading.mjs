// Adds a loading.tsx (re-exporting the shared skeleton) to every app route folder that has a
// page.tsx but no loading.tsx. With Cache Components, each segment needs its own Suspense
// boundary for client navigations to be instant (and for `next build` validation to pass).
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("src/app");
let added = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (dir === root && name === "api") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
  }
  // The root segment's own page relies on the root layout's boundary.
  if (dir !== root && existsSync(path.join(dir, "page.tsx")) && !existsSync(path.join(dir, "loading.tsx"))) {
    writeFileSync(path.join(dir, "loading.tsx"), 'export { default } from "@/components/page-skeleton";\n');
    added++;
    console.log("added", path.relative(process.cwd(), path.join(dir, "loading.tsx")));
  }
}
walk(root);
console.log(`${added} loading.tsx file(s) added`);
