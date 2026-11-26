export const agentPrompts: Record<string, string[]> = {
  orchestrator: [
    "Review the attached document and prepare an extraction plan for all critical loan and borrower terms.",
  ],

  auditor: [
    "Audit the extracted data against the document and prepare in excel format.",
    "Audit the extracted data against the document and prepare in json format.",
  ],
};