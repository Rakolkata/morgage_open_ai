
from dataclasses import dataclass, field
import os
import shutil

import pymupdf as fitz
import pytesseract

from PIL import Image

from app.config import get_settings
from app.errors import AppError


# --------------------------------------------------
# TESSERACT OCR CONFIGURATION
# --------------------------------------------------

# Use an explicitly configured path if provided.
# Otherwise, automatically locate Tesseract in PATH.
TESSERACT_PATH = os.getenv("TESSERACT_CMD")

if TESSERACT_PATH:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH
else:
    detected_path = shutil.which("tesseract")

    if detected_path:
        pytesseract.pytesseract.tesseract_cmd = detected_path


# --------------------------------------------------
# EXTRACTED PAGE DATA MODEL
# --------------------------------------------------

@dataclass
class ExtractedPage:
    page_number: int
    text: str
    needs_ocr: bool = False
    page_type: str = "financial_or_other"
    width: float = 0.0
    height: float = 0.0
    words: list = field(default_factory=list)


# --------------------------------------------------
# PAGE CLASSIFICATION
# --------------------------------------------------

def classify_page(text: str) -> str:

    value = (text or "").lower()

    if not value.strip():
        return "blank"

    if len(value.strip()) < 300 and any(
        x in value
        for x in (
            "loan application",
            "mortgage application",
            "loan package"
        )
    ):
        return "cover"

    if any(
        x in value
        for x in (
            "privacy notice",
            "equal credit opportunity",
            "right to receive a copy",
            "initial escrow account disclosure"
        )
    ):
        return "disclosure"

    return "financial_or_other"


# --------------------------------------------------
# PDF TEXT EXTRACTION
# --------------------------------------------------

def extract_pdf(raw: bytes) -> list[ExtractedPage]:

    if not raw.startswith(b"%PDF-"):
        raise AppError(
            "INVALID_PDF",
            "The uploaded file is not a valid PDF.",
            400
        )

    pdf = None

    try:

        pdf = fitz.open(stream=raw, filetype="pdf")

        if pdf.page_count == 0:
            raise AppError(
                "EMPTY_PDF",
                "The PDF contains no pages.",
                400
            )

        if pdf.page_count > get_settings().max_pdf_pages:
            raise AppError(
                "TOO_MANY_PAGES",
                "The PDF exceeds the configured page limit.",
                413
            )

        pages = []

        for index, page in enumerate(pdf):

            # --------------------------------------
            # STEP 1: EXTRACT EMBEDDED PDF TEXT
            # --------------------------------------

            words = page.get_text("words", sort=True)

            text = " ".join(
                str(word[4]) for word in words
            ).strip()

            needs_ocr = not bool(text)

            # --------------------------------------
            # STEP 2: USE OCR IF TEXT IS UNAVAILABLE
            # --------------------------------------

            if needs_ocr:

                try:

                    pix = page.get_pixmap(
                        matrix=fitz.Matrix(2, 2),
                        alpha=False
                    )

                    image = Image.frombytes(
                        "RGB",
                        [pix.width, pix.height],
                        pix.samples
                    )

                    ocr = pytesseract.image_to_data(
                        image,
                        lang="eng",
                        output_type=pytesseract.Output.DICT
                    )

                    scale_x = page.rect.width / pix.width
                    scale_y = page.rect.height / pix.height

                    ocr_words = []

                    for i, token in enumerate(ocr["text"]):

                        token = str(token).strip()

                        if not token:
                            continue

                        x0 = float(ocr["left"][i]) * scale_x
                        y0 = float(ocr["top"][i]) * scale_y

                        x1 = (
                            x0 +
                            float(ocr["width"][i]) * scale_x
                        )

                        y1 = (
                            y0 +
                            float(ocr["height"][i]) * scale_y
                        )

                        ocr_words.append(
                            (x0, y0, x1, y1, token)
                        )

                    words = ocr_words

                    text = " ".join(
                        word[4] for word in words
                    ).strip()

                    # OCR succeeded if text was recognized.
                    needs_ocr = not bool(text)

                except pytesseract.TesseractNotFoundError as exc:

                    raise AppError(
                        "TESSERACT_NOT_FOUND",
                        "Tesseract OCR executable was not found. "
                        "Check the Tesseract installation path.",
                        500
                    ) from exc

                except Exception as exc:

                    raise AppError(
                        "OCR_FAILED",
                        f"OCR failed on PDF page {index + 1}: {str(exc)}",
                        500
                    ) from exc

            # --------------------------------------
            # STEP 3: STORE PAGE INFORMATION
            # --------------------------------------

            pages.append(
                ExtractedPage(
                    page_number=index + 1,
                    text=text,
                    needs_ocr=needs_ocr,
                    page_type=classify_page(text),
                    width=float(page.rect.width),
                    height=float(page.rect.height),
                    words=words
                )
            )

        return pages

    except AppError:
        raise

    except Exception as exc:

        raise AppError(
            "PDF_READ_FAILED",
            f"The PDF could not be read: {str(exc)}",
            400
        ) from exc

    finally:

        if pdf is not None:
            pdf.close()
