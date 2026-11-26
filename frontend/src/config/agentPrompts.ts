export const agentPrompts: Record<string, string[]> = {
  orchestrator: [
    "Review the uploaded mortgage document and determine the appropriate analysis workflow.",
    "Analyze the loan document and identify the key information that needs to be extracted and verified.",
    "Perform a complete mortgage post-closing review of the document.",
  ],

  "data-extractor": [
    "Review the attached document and prepare an extraction plan for all critical loan and borrower terms.",
    "Extract all relevant borrower, property, loan, financial, and closing details and present them in a structured format.",
    "Identify the required mortgage fields that are missing or unavailable in the document.",
  ],

  auditor: [
    "Review the extracted loan information against the source document.",
    "Identify inconsistencies, discrepancies, and potential post-closing audit issues.",
    "Prepare a structured post-closing audit report with findings.",
  ],

  evidence: [
    "Find supporting evidence for each extracted loan field.",
    "Show the page number and source text for each critical loan value.",
    "Verify the supporting evidence for the extracted mortgage information.",
  ],

  "document-analysis": [
    "Summarize the uploaded loan document.",
    "Identify the document type and its purpose.",
    "Review the important borrower, property, and loan information.",
  ],
};