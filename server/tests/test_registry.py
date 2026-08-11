import unittest

from scissors_server.registry import get_tool, list_tool_ids


EXPECTED_TOOL_IDS = {
    "ai-assistant",
    "ai-extract-tables",
    "ai-rewrite",
    "ai-summarize",
    "ai-translate",
    "convert-html-to-pdf",
    "convert-images-to-pdf",
    "convert-pdf-to-images",
    "convert-pdf-to-word",
    "convert-word-to-pdf",
    "edit-annotate",
    "edit-draw",
    "edit-forms",
    "edit-highlight",
    "edit-images",
    "edit-shapes",
    "edit-signature",
    "edit-text",
    "optimize-compress",
    "optimize-images",
    "optimize-ocr",
    "organize-delete",
    "organize-extract",
    "organize-merge",
    "organize-rearrange",
    "organize-rotate",
    "organize-split",
    "security-protect",
    "security-sign",
    "security-unlock",
    "security-watermark",
}


class ToolRegistryTests(unittest.TestCase):
    def test_registry_contains_every_frontend_tool(self):
        self.assertEqual(set(list_tool_ids()), EXPECTED_TOOL_IDS)

    def test_every_tool_resolves_to_a_handler(self):
        for tool_id in EXPECTED_TOOL_IDS:
            with self.subTest(tool_id=tool_id):
                self.assertTrue(callable(get_tool(tool_id)))


if __name__ == "__main__":
    unittest.main()
