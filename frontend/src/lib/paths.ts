import path from "path";

/**
 * Returns the absolute path to the uploads directory inside frontend.
 * Supports UPLOAD_DIR environment variable (used in Docker) with reliable fallback.
 */
export function getUploadDir(): string {
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }

  // If cwd is the frontend directory
  if (path.basename(process.cwd()) === "frontend") {
    return path.resolve(process.cwd(), "uploads");
  }

  // If cwd is the root directory
  return path.resolve(process.cwd(), "frontend", "uploads");
}
