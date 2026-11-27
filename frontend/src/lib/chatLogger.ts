import { prisma } from "@/lib/prisma";

export interface LogChatParams {
  documentId: string;
  conversationId?: string | null;
  agent: string;
  message: string;
  response: string;
}

/**
 * Persists chat and agent execution interactions directly into the PostgreSQL database.
 * If a valid UUID conversationId is supplied, it ensures the conversation record exists first.
 */
export async function logChatInteraction({
  documentId,
  conversationId,
  agent,
  message,
  response,
}: LogChatParams): Promise<void> {
  try {
    let validConvId: string | null = null;

    const isValidUuid =
      typeof conversationId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        conversationId
      );

    if (isValidUuid && conversationId) {
      try {
        const existingConv = await prisma.conversations.findUnique({
          where: { id: conversationId },
        });

        if (existingConv) {
          validConvId = existingConv.id;
        } else {
          // Verify document exists before linking conversation
          const doc = await prisma.documents.findUnique({
            where: { id: documentId },
          });

          if (doc) {
            const newConv = await prisma.conversations.create({
              data: {
                id: conversationId,
                document_id: documentId,
                session_id: "default-session",
              },
            });
            validConvId = newConv.id;
          }
        }
      } catch (convErr) {
        console.warn("Could not link conversation record, saving log independently:", convErr);
      }
    }

    await prisma.chat_logs.create({
      data: {
        conversation_id: validConvId,
        agent,
        message,
        response,
      },
    });

    console.log(`[Database] Chat interaction successfully saved (Agent: ${agent})`);
  } catch (error) {
    console.error("Failed to persist chat log in PostgreSQL:", error);
  }
}
