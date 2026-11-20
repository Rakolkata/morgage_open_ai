import "dotenv/config";
import process from "node:process";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] || "postgresql://postgres:admin@localhost:5432/mortgage_ai_db",
  },
});
