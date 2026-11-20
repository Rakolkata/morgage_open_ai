
import { prisma } from "@/lib/prisma";

export async function getDocuments() {
  const documents = await prisma.documents.findMany({
    orderBy: {
      created_at: "desc",
    },
    select: {
      id: true,
      filename: true,
      page_count: true,
      file_size: true,
      sha256: true,
      extracted_data: true,
      created_at: true,
    },
  });

  return documents.map((document) => ({
    ...document,
    file_size: document.file_size?.toString() ?? null,
  }));
}
