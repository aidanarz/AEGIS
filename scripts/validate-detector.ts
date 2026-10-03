// npm run detect:validate — FR-3.1(b): reproduce the 5 lead times of PRD §6.6 within ±2 h.

import { PrismaClient } from "@prisma/client";
import { validateDetector } from "../lib/detect/run";

const prisma = new PrismaClient();

validateDetector(prisma)
  .then((rows) => {
    console.log("\n── Detector validation vs PRD §6.6 (±2 h) ──");
    console.table(rows);
    const failed = rows.filter((r) => !r.pass);
    if (failed.length) {
      console.error(`✘ ${failed.length} asset(s) outside tolerance: ${failed.map((f) => f.tag).join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log(`✔ All ${rows.length} lead times reproduced within ±2 h.`);
    }
  })
  .finally(() => prisma.$disconnect());
