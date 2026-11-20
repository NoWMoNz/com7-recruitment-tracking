import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Nightly processor at 00:30 Bangkok time (17:30 UTC): resignations, transfers, store closures, new hires.
    { path: "/api/cron/process", schedule: "30 17 * * *" },
  ],
};
