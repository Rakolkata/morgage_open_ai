from __future__ import annotations

import csv
import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any
import xml.dom.minidom
import xml.etree.ElementTree as ET

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

logger = logging.getLogger(__name__)

# Directory where export files are saved
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
EXPORTS_DIR = ROOT_DIR / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    """Sanitize string to safe filename."""
    base = Path(name).stem if name else "document"
    clean = re.sub(r"[^\w\-_.]", "_", base)
    return clean[:40] or "audit_report"


def detect_requested_formats(prompt: str) -> str:
    """
    Detects desired export format from user prompt.
    Returns: 'excel' | 'json' | 'xml' | 'csv' (defaults to 'excel').
    """
    p = (prompt or "").lower()

    if any(k in p for k in ["excel", "xlsx", "xls", "spreadsheet", "sheet"]):
        return "excel"
    if any(k in p for k in ["json", ".json"]):
        return "json"
    if any(k in p for k in ["xml", ".xml"]):
        return "xml"
    if any(k in p for k in ["csv", ".csv"]):
        return "csv"

    return "excel"


def _normalize_findings(audit_data: dict[str, Any]) -> list[dict[str, Any]]:
    findings = audit_data.get("findings") or []
    normalized: list[dict[str, Any]] = []
    for f in findings:
        if isinstance(f, dict):
            normalized.append(f)
        elif hasattr(f, "model_dump"):
            normalized.append(f.model_dump())
        else:
            normalized.append(dict(f))
    return normalized


def _normalize_extracted(extracted_data: Any) -> list[dict[str, Any]]:
    if isinstance(extracted_data, dict):
        fields = (
            extracted_data.get("extracted_fields")
            or extracted_data.get("fields")
            or []
        )
        if isinstance(fields, list):
            res = []
            for item in fields:
                if isinstance(item, dict):
                    res.append(item)
                elif hasattr(item, "model_dump"):
                    res.append(item.model_dump())
            if res:
                return res
        return [{"field_path": k, "value": str(v)} for k, v in extracted_data.items() if k != "extracted_fields"]

    if isinstance(extracted_data, list):
        res = []
        for item in extracted_data:
            if isinstance(item, dict):
                res.append(item)
            elif hasattr(item, "model_dump"):
                res.append(item.model_dump())
        return res

    return []


# ============================================================================
# EXCEL EXPORT (.xlsx)
# ============================================================================

def generate_excel_export(
    audit_data: dict[str, Any],
    extracted_data: Any,
    file_name: str | None,
    output_path: Path
) -> Path:
    """Generates a professional, multi-sheet Excel workbook with audit findings & styling."""
    wb = openpyxl.Workbook()
    # Remove default sheet
    default_sheet = wb.active
    if default_sheet is not None:
        wb.remove(default_sheet)

    # Styles
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    blue_header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    light_blue_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    gray_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    green_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    green_font = Font(name="Calibri", size=10, bold=True, color="166534")

    red_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    red_font = Font(name="Calibri", size=10, bold=True, color="991B1B")

    yellow_fill = PatternFill(start_color="FEF9C3", end_color="FEF9C3", fill_type="solid")
    yellow_font = Font(name="Calibri", size=10, bold=True, color="854D0E")

    orange_fill = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")
    orange_font = Font(name="Calibri", size=10, bold=True, color="9A3412")

    title_font = Font(name="Calibri", size=15, bold=True, color="FFFFFF")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    bold_font = Font(name="Calibri", size=11, bold=True, color="1E293B")
    regular_font = Font(name="Calibri", size=10, color="1E293B")

    thin_border_side = Side(border_style="thin", color="CBD5E1")
    grid_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side
    )

    findings = _normalize_findings(audit_data)
    extracted_fields = _normalize_extracted(extracted_data)

    total = audit_data.get("total_checks", len(findings))
    passed = audit_data.get("passed", sum(1 for f in findings if f.get("status") == "MATCH"))
    exceptions = audit_data.get("exceptions", sum(1 for f in findings if f.get("status") == "MISMATCH"))
    missing = audit_data.get("missing_evidence", sum(1 for f in findings if "MISSING" in str(f.get("status", ""))))

    # -------------------------------------------------------------
    # SHEET 1: AUDIT SUMMARY
    # -------------------------------------------------------------
    ws_summary = wb.create_sheet(title="Audit Summary")
    ws_summary.views.sheetView[0].showGridLines = True

    # Title Banner
    ws_summary.merge_cells("A1:E2")
    ws_summary["A1"] = "MORTGAGE DOCUMENT AUDIT REPORT"
    ws_summary["A1"].font = title_font
    ws_summary["A1"].fill = navy_fill
    ws_summary["A1"].alignment = Alignment(horizontal="center", vertical="center")

    # Metadata
    meta_rows = [
        ("Source Document", file_name or "Unknown Document"),
        ("Audit Timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        ("Auditing Agent", "Auditor Agent (Mortgage AI)"),
        ("Compliance Verdict", "PASSED" if exceptions == 0 and passed > 0 else "REVIEW REQUIRED"),
    ]

    for idx, (label, val) in enumerate(meta_rows, start=4):
        ws_summary.cell(row=idx, column=1, value=label).font = bold_font
        ws_summary.cell(row=idx, column=1).fill = light_blue_fill
        ws_summary.cell(row=idx, column=1).border = grid_border

        c = ws_summary.cell(row=idx, column=2, value=val)
        c.font = regular_font
        c.border = grid_border
        if label == "Compliance Verdict":
            c.font = green_font if val == "PASSED" else red_font
            c.fill = green_fill if val == "PASSED" else red_fill

    # Metrics Summary Table
    ws_summary.cell(row=9, column=1, value="Metric").font = header_font
    ws_summary.cell(row=9, column=1).fill = blue_header_fill
    ws_summary.cell(row=9, column=1).border = grid_border

    ws_summary.cell(row=9, column=2, value="Count").font = header_font
    ws_summary.cell(row=9, column=2).fill = blue_header_fill
    ws_summary.cell(row=9, column=2).border = grid_border

    metrics = [
        ("Total Verification Checks", total),
        ("Passed Checks (MATCH)", passed),
        ("Exceptions Found (MISMATCH)", exceptions),
        ("Missing / Incomplete Evidence", missing),
    ]

    for idx, (metric_name, count_val) in enumerate(metrics, start=10):
        c1 = ws_summary.cell(row=idx, column=1, value=metric_name)
        c1.font = regular_font
        c1.border = grid_border

        c2 = ws_summary.cell(row=idx, column=2, value=count_val)
        c2.font = bold_font
        c2.border = grid_border
        c2.alignment = Alignment(horizontal="right")

        if "Passed" in metric_name:
            c2.font = green_font
            c2.fill = green_fill
        elif "Exceptions" in metric_name and count_val > 0:
            c2.font = red_font
            c2.fill = red_fill

    ws_summary.column_dimensions["A"].width = 32
    ws_summary.column_dimensions["B"].width = 38

    # -------------------------------------------------------------
    # SHEET 2: AUDIT FINDINGS (DETAILED CHECKS)
    # -------------------------------------------------------------
    ws_findings = wb.create_sheet(title="Audit Findings")
    ws_findings.views.sheetView[0].showGridLines = True

    finding_headers = [
        "Field Name",
        "Audit Status",
        "Extracted Value",
        "Document Verified Value",
        "Page #",
        "Audit Explanation / Note",
    ]

    for col_idx, h in enumerate(finding_headers, start=1):
        cell = ws_findings.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = blue_header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = grid_border

    for row_idx, f in enumerate(findings, start=2):
        status = str(f.get("status") or "REVIEW_REQUIRED").upper()
        row_cells = [
            ws_findings.cell(row=row_idx, column=1, value=f.get("field_path", "")),
            ws_findings.cell(row=row_idx, column=2, value=status),
            ws_findings.cell(row=row_idx, column=3, value=f.get("extracted_value") or ""),
            ws_findings.cell(row=row_idx, column=4, value=f.get("document_value") or ""),
            ws_findings.cell(row=row_idx, column=5, value=f.get("page") if f.get("page") is not None else ""),
            ws_findings.cell(row=row_idx, column=6, value=f.get("explanation", "")),
        ]

        zebra = gray_zebra if row_idx % 2 == 0 else PatternFill(fill_type=None)

        for c in row_cells:
            c.font = regular_font
            c.border = grid_border
            if zebra.fill_type:
                c.fill = zebra

        # Color-code status cell
        status_cell = row_cells[1]
        status_cell.alignment = Alignment(horizontal="center", vertical="center")
        if status == "MATCH":
            status_cell.fill = green_fill
            status_cell.font = green_font
        elif status == "MISMATCH":
            status_cell.fill = red_fill
            status_cell.font = red_font
        elif "MISSING" in status:
            status_cell.fill = orange_fill
            status_cell.font = orange_font
        else:
            status_cell.fill = yellow_fill
            status_cell.font = yellow_font

        # Center page number
        row_cells[4].alignment = Alignment(horizontal="center")

    # Column auto-widths for Findings
    for col in ws_findings.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws_findings.column_dimensions[col_letter].width = max(min(max_len + 3, 55), 14)

    # -------------------------------------------------------------
    # SHEET 3: EXTRACTED DATA
    # -------------------------------------------------------------
    if extracted_fields:
        ws_extracted = wb.create_sheet(title="Extracted Data")
        ws_extracted.views.sheetView[0].showGridLines = True

        ext_headers = ["Field Name", "Extracted Value", "Page #", "Confidence", "Source Snippet"]
        for col_idx, h in enumerate(ext_headers, start=1):
            cell = ws_extracted.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = navy_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = grid_border

        for row_idx, f in enumerate(extracted_fields, start=2):
            val = f.get("value")
            conf = f.get("confidence")
            conf_str = f"{float(conf):.1%}" if conf is not None else ""

            row_cells = [
                ws_extracted.cell(row=row_idx, column=1, value=f.get("field_path", "")),
                ws_extracted.cell(row=row_idx, column=2, value=str(val) if val is not None else ""),
                ws_extracted.cell(row=row_idx, column=3, value=f.get("page") if f.get("page") is not None else ""),
                ws_extracted.cell(row=row_idx, column=4, value=conf_str),
                ws_extracted.cell(row=row_idx, column=5, value=f.get("source_text") or ""),
            ]

            for c in row_cells:
                c.font = regular_font
                c.border = grid_border

        for col in ws_extracted.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws_extracted.column_dimensions[col_letter].width = max(min(max_len + 3, 60), 15)

    wb.save(output_path)
    return output_path


# ============================================================================
# JSON EXPORT (.json)
# ============================================================================

def generate_json_export(
    audit_data: dict[str, Any],
    extracted_data: Any,
    file_name: str | None,
    output_path: Path
) -> Path:
    """Generates structured, pretty-printed JSON file."""
    findings = _normalize_findings(audit_data)
    extracted_fields = _normalize_extracted(extracted_data)

    payload = {
        "metadata": {
            "document_name": file_name or "Unknown Document",
            "audit_timestamp": datetime.now().isoformat(),
            "generator": "Mortgage AI Auditor Agent",
            "format": "json"
        },
        "audit_summary": {
            "total_checks": audit_data.get("total_checks", len(findings)),
            "passed": audit_data.get("passed", sum(1 for f in findings if f.get("status") == "MATCH")),
            "exceptions": audit_data.get("exceptions", sum(1 for f in findings if f.get("status") == "MISMATCH")),
            "missing_evidence": audit_data.get("missing_evidence", sum(1 for f in findings if "MISSING" in str(f.get("status", "")))),
            "verdict": "PASSED" if audit_data.get("exceptions", 0) == 0 else "REVIEW_REQUIRED"
        },
        "audit_findings": findings,
        "extracted_data": extracted_fields
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    return output_path


# ============================================================================
# XML EXPORT (.xml)
# ============================================================================

def generate_xml_export(
    audit_data: dict[str, Any],
    extracted_data: Any,
    file_name: str | None,
    output_path: Path
) -> Path:
    """Generates structured XML report."""
    findings = _normalize_findings(audit_data)
    extracted_fields = _normalize_extracted(extracted_data)

    root = ET.Element("MortgageAuditReport")
    root.set("document", file_name or "Unknown Document")
    root.set("timestamp", datetime.now().isoformat())

    # Summary
    summary_el = ET.SubElement(root, "Summary")
    ET.SubElement(summary_el, "TotalChecks").text = str(audit_data.get("total_checks", len(findings)))
    ET.SubElement(summary_el, "Passed").text = str(audit_data.get("passed", 0))
    ET.SubElement(summary_el, "Exceptions").text = str(audit_data.get("exceptions", 0))
    ET.SubElement(summary_el, "MissingEvidence").text = str(audit_data.get("missing_evidence", 0))
    ET.SubElement(summary_el, "Verdict").text = (
        "PASSED" if audit_data.get("exceptions", 0) == 0 else "REVIEW_REQUIRED"
    )

    # Findings
    findings_el = ET.SubElement(root, "AuditFindings")
    for f in findings:
        item = ET.SubElement(findings_el, "Finding")
        ET.SubElement(item, "FieldPath").text = str(f.get("field_path") or "")
        ET.SubElement(item, "Status").text = str(f.get("status") or "")
        ET.SubElement(item, "ExtractedValue").text = str(f.get("extracted_value") or "")
        ET.SubElement(item, "DocumentValue").text = str(f.get("document_value") or "")
        ET.SubElement(item, "Page").text = str(f.get("page") or "")
        ET.SubElement(item, "Explanation").text = str(f.get("explanation") or "")

    # Extracted data
    if extracted_fields:
        extracted_el = ET.SubElement(root, "ExtractedData")
        for ef in extracted_fields:
            item = ET.SubElement(extracted_el, "Field")
            ET.SubElement(item, "FieldPath").text = str(ef.get("field_path") or "")
            ET.SubElement(item, "Value").text = str(ef.get("value") or "")
            ET.SubElement(item, "Page").text = str(ef.get("page") or "")
            ET.SubElement(item, "Confidence").text = str(ef.get("confidence") or "")
            ET.SubElement(item, "SourceText").text = str(ef.get("source_text") or "")

    raw_xml = ET.tostring(root, encoding="utf-8")
    parsed = xml.dom.minidom.parseString(raw_xml)
    pretty_xml = parsed.toprettyxml(indent="  ")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(pretty_xml)

    return output_path


# ============================================================================
# CSV EXPORT (.csv)
# ============================================================================

def generate_csv_export(
    audit_data: dict[str, Any],
    file_name: str | None,
    output_path: Path
) -> Path:
    """Generates standard CSV table of audit findings."""
    findings = _normalize_findings(audit_data)

    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["# Mortgage Document Audit Findings"])
        writer.writerow(["# Document", file_name or "Unknown"])
        writer.writerow(["# Date", datetime.now().strftime("%Y-%m-%d %H:%M:%S")])
        writer.writerow([])
        writer.writerow([
            "Field Name",
            "Audit Status",
            "Extracted Value",
            "Document Verified Value",
            "Page #",
            "Explanation"
        ])

        for f_item in findings:
            writer.writerow([
                f_item.get("field_path") or "",
                f_item.get("status") or "",
                f_item.get("extracted_value") or "",
                f_item.get("document_value") or "",
                f_item.get("page") if f_item.get("page") is not None else "",
                f_item.get("explanation") or "",
            ])

    return output_path


# ============================================================================
# MASTER EXPORT COORDINATOR
# ============================================================================

def create_audit_exports(
    audit_data: dict[str, Any],
    extracted_data: Any,
    file_name: str | None,
    prompt: str,
    base_url: str = "http://127.0.0.1:8000"
) -> dict[str, Any]:
    """
    Creates audit export file in the requested format (excel, json, xml, csv),
    and creates alternate formats for immediate browser availability.
    Returns download URLs and filename details.
    """
    clean_base_url = base_url.rstrip("/")
    base_name = sanitize_filename(file_name or "loan_doc")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    primary_format = detect_requested_formats(prompt)

    downloads: dict[str, str] = {}
    filenames: dict[str, str] = {}

    # Always generate Excel
    excel_filename = f"audit_{base_name}_{timestamp}.xlsx"
    excel_path = EXPORTS_DIR / excel_filename
    try:
        generate_excel_export(audit_data, extracted_data, file_name, excel_path)
        downloads["excel"] = f"{clean_base_url}/api/v1/download/{excel_filename}"
        filenames["excel"] = excel_filename
    except Exception as exc:
        logger.error("Failed to generate Excel export: %s", exc)

    # Always generate JSON
    json_filename = f"audit_{base_name}_{timestamp}.json"
    json_path = EXPORTS_DIR / json_filename
    try:
        generate_json_export(audit_data, extracted_data, file_name, json_path)
        downloads["json"] = f"{clean_base_url}/api/v1/download/{json_filename}"
        filenames["json"] = json_filename
    except Exception as exc:
        logger.error("Failed to generate JSON export: %s", exc)

    # Always generate XML
    xml_filename = f"audit_{base_name}_{timestamp}.xml"
    xml_path = EXPORTS_DIR / xml_filename
    try:
        generate_xml_export(audit_data, extracted_data, file_name, xml_path)
        downloads["xml"] = f"{clean_base_url}/api/v1/download/{xml_filename}"
        filenames["xml"] = xml_filename
    except Exception as exc:
        logger.error("Failed to generate XML export: %s", exc)

    # Always generate CSV
    csv_filename = f"audit_{base_name}_{timestamp}.csv"
    csv_path = EXPORTS_DIR / csv_filename
    try:
        generate_csv_export(audit_data, file_name, csv_path)
        downloads["csv"] = f"{clean_base_url}/api/v1/download/{csv_filename}"
        filenames["csv"] = csv_filename
    except Exception as exc:
        logger.error("Failed to generate CSV export: %s", exc)

    primary_url = downloads.get(primary_format) or downloads.get("excel") or ""
    primary_file = filenames.get(primary_format) or filenames.get("excel") or ""

    return {
        "primary_format": primary_format,
        "primary_url": primary_url,
        "primary_filename": primary_file,
        "available_downloads": downloads,
        "all_filenames": filenames
    }
