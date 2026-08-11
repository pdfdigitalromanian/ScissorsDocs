import tempfile
import unittest
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from scissors_server.main import app
from scissors_server.services.ai_text import assistant, rewrite, summarize
from scissors_server.services.conversion import images_to_pdf, pdf_to_images
from scissors_server.services.pdf_pages import (
    delete_pages,
    extract_pages,
    merge_pdfs,
    rearrange_pages,
    rotate_pages,
    split_pdf,
)
from scissors_server.services.security import protect_pdf, unlock_pdf, watermark


def create_pdf(path: Path, page_texts):
    document = canvas.Canvas(str(path))
    for text in page_texts:
        document.drawString(72, 720, text)
        document.showPage()
    document.save()


class ProcessingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="scissordoc-test-")
        self.workdir = Path(self.temporary.name)
        self.first_pdf = self.workdir / "first.pdf"
        self.second_pdf = self.workdir / "second.pdf"
        create_pdf(self.first_pdf, ["First page", "Second page"])
        create_pdf(self.second_pdf, ["Third page"])

    def tearDown(self):
        self.temporary.cleanup()

    def test_page_organization_tools(self):
        merged = merge_pdfs([self.first_pdf, self.second_pdf], {}, self.workdir)
        self.assertEqual(len(PdfReader(str(merged.output_path)).pages), 3)

        split = split_pdf([self.first_pdf], {}, self.workdir)
        with zipfile.ZipFile(split.output_path) as archive:
            self.assertEqual(len(archive.namelist()), 2)

        rotated = rotate_pages(
            [self.first_pdf], {"angle": 90, "pages": "1"}, self.workdir
        )
        rotated_pages = PdfReader(str(rotated.output_path)).pages
        self.assertEqual(rotated_pages[0].rotation, 90)
        self.assertEqual(rotated_pages[1].rotation, 0)

        extracted = extract_pages(
            [self.first_pdf], {"pages": "2"}, self.workdir
        )
        self.assertEqual(len(PdfReader(str(extracted.output_path)).pages), 1)

        deleted = delete_pages([self.first_pdf], {"pages": "1"}, self.workdir)
        self.assertEqual(len(PdfReader(str(deleted.output_path)).pages), 1)

        rearranged = rearrange_pages(
            [self.first_pdf], {"order": "2,1"}, self.workdir
        )
        first_page_text = PdfReader(str(rearranged.output_path)).pages[0].extract_text()
        self.assertIn("Second page", first_page_text)

    def test_image_pdf_round_trip(self):
        image_path = self.workdir / "sample.png"
        Image.new("RGB", (240, 120), "#ea4b71").save(image_path)
        converted = images_to_pdf([image_path], {}, self.workdir)
        self.assertEqual(len(PdfReader(str(converted.output_path)).pages), 1)

        images = pdf_to_images(
            [converted.output_path], {"format": "png", "dpi": 72}, self.workdir
        )
        with zipfile.ZipFile(images.output_path) as archive:
            self.assertEqual(len(archive.namelist()), 1)
            self.assertTrue(archive.namelist()[0].endswith(".png"))

    def test_security_round_trip_and_watermark(self):
        protected = protect_pdf(
            [self.first_pdf], {"password": "secret"}, self.workdir
        )
        encrypted_reader = PdfReader(str(protected.output_path))
        self.assertTrue(encrypted_reader.is_encrypted)

        unlocked = unlock_pdf(
            [protected.output_path], {"password": "secret"}, self.workdir
        )
        self.assertFalse(PdfReader(str(unlocked.output_path)).is_encrypted)

        watermarked = watermark(
            [self.first_pdf], {"text": "DRAFT", "opacity": 0.2}, self.workdir
        )
        self.assertEqual(len(PdfReader(str(watermarked.output_path)).pages), 2)

    def test_local_text_tools(self):
        text = (
            "ScissorsDoc processes files locally. "
            "The workspace includes PDF conversion and organization. "
            "In order to work efficiently, users can choose a dedicated tool."
        )
        summary_result = summarize([], {"text": text, "sentences": 2}, self.workdir)
        self.assertEqual(summary_result.payload["method"], "local-extractive")
        self.assertTrue(summary_result.payload["summary"])

        rewrite_result = rewrite(
            [], {"text": text, "mode": "concise"}, self.workdir
        )
        self.assertNotIn("In order to", rewrite_result.payload["rewritten_text"])

        answer_result = assistant(
            [], {"text": text, "question": "What includes conversion?"}, self.workdir
        )
        self.assertIn("conversion", answer_result.payload["answer"])


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_and_tool_index(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["tool_count"], 31)

        tools = self.client.get("/api/tools")
        self.assertEqual(tools.status_code, 200)
        self.assertIn("organize-merge", tools.json()["tools"])

    def test_json_tool_endpoint(self):
        response = self.client.post(
            "/api/tools/ai-rewrite",
            data={
                "options": '{"text":"In order to begin, utilize this.","mode":"plain"}'
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rewritten_text"], "To begin, use this.")

    def test_unknown_tool_returns_404(self):
        response = self.client.post(
            "/api/tools/not-a-tool", data={"options": "{}"}
        )
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
