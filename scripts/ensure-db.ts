// Runs before `npm run dev` / `npm run build`: syncs the SQLite schema and seeds it on first run,
// so `npm install && npm run dev` works with zero manual steps (PRD §14).

import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const run = (cmd: string) => execSync(cmd, { stdio: "inherit" });

async function main() {
  run("npx prisma db push --skip-generate");

  const prisma = new PrismaClient();
  try {
    const incidents = await prisma.incident.count();
    if (incidents > 0) {
      console.log(`[ensure-db] database already seeded (${incidents} incidents) — skipping seed. Use "npm run db:reset" to reload.`);
      return;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log("[ensure-db] empty database — seeding from /mock-data …");
  run("npx prisma db seed");
}

main().catch((e) => {
  console.error("[ensure-db] failed:", e);
  console.error('If the schema changed incompatibly, run "npm run db:reset".');
  process.exit(1);
});
