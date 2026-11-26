
import dotenv from "dotenv";
import process from "node:process";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url:
      process.env["DATABASE_URL"] ||
      "postgresql://postgres:admin@db:5432/mortgage_ai_db",
  },
});
