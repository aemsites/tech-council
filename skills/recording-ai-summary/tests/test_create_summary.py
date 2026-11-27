import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from docx import Document


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/create_summary.py"
SAMPLE = ROOT / "assets/sample-summary.json"


class SummaryGenerationTest(unittest.TestCase):
    def run_generator(self, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            capture_output=True, text=True, check=False,
        )

    def test_roundtrip_keeps_metadata_lists_and_disclosure_status(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "summary.docx"
            html = Path(directory) / "summary.plain.html"
            result = self.run_generator(SAMPLE, output, "--html", html)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = Document(output)
            data = json.loads(SAMPLE.read_text())
            self.assertEqual(len(document.tables), len(data["blocks"]))
            topic = document.tables[2]
            fields = {row.cells[0].text: row.cells[1] for row in topic.rows[1:]}
            self.assertEqual(fields["Start"].text, "00:30")
            self.assertEqual(fields["Timing confidence"].text, "segment")
            self.assertTrue(all(
                paragraph.style.name == "List Bullet"
                for paragraph in fields["Key points"].paragraphs
            ))
            self.assertIn("Unresolved", html.read_text())
            self.assertFalse(any(paragraph.text.strip() for paragraph in document.paragraphs))

    def test_invalid_times_and_wrong_block_fields_are_rejected_before_writing(self):
        for change in ("reversed", "wrong-field", "unknown-confidence"):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                data = json.loads(SAMPLE.read_text())
                fields = data["blocks"][2]["fields"]
                if change == "reversed":
                    fields["End"] = "00:10"
                elif change == "wrong-field":
                    fields["Answer"] = "This field belongs on a question, not a topic."
                else:
                    fields["Timing confidence"] = "probably"
                source = Path(directory) / "summary.json"
                output = Path(directory) / "summary.docx"
                source.write_text(json.dumps(data))
                result = self.run_generator(source, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())

    def test_existing_outputs_are_not_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "summary.docx"
            output.write_bytes(b"existing document")
            result = self.run_generator(SAMPLE, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(output.read_bytes(), b"existing document")

    def test_topic_limit_accepts_ten_and_rejects_eleven(self):
        for count in (10, 11):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as directory:
                data = json.loads(SAMPLE.read_text())
                topic = data["blocks"][2]
                data["blocks"][2:] = [copy.deepcopy(topic) for _ in range(count)] + [
                    block for block in data["blocks"][2:] if block["block"] != "Talk Topic"
                ]
                source = Path(directory) / "summary.json"
                output = Path(directory) / "summary.docx"
                source.write_text(json.dumps(data))
                result = self.run_generator(source, output)
                self.assertEqual(result.returncode == 0, count == 10, result.stderr)
                self.assertEqual(output.exists(), count == 10)

    def test_extra_summary_sections_are_rejected(self):
        for name, extra_fields in (
            ("Talk Follow-ups", {"Items": ["A recorded follow-up."]}),
            ("Talk Source Note", {"Source": "transcript.docx", "Limitations": "Missing timing."}),
        ):
            with self.subTest(block=name), tempfile.TemporaryDirectory() as directory:
                data = json.loads(SAMPLE.read_text())
                fields = {
                    "Start": None, "End": None,
                    "Timing confidence": "unverified", "Tags": [],
                    **extra_fields,
                }
                data["blocks"].append({"block": name, "fields": fields})
                source = Path(directory) / "summary.json"
                output = Path(directory) / "summary.docx"
                source.write_text(json.dumps(data))
                result = self.run_generator(source, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())

    def test_excluded_question_statuses_are_rejected(self):
        for status in ("Deferred", "Partially answered"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                data = json.loads(SAMPLE.read_text())
                data["blocks"][4]["fields"]["Status"] = status
                source = Path(directory) / "summary.json"
                output = Path(directory) / "summary.docx"
                source.write_text(json.dumps(data))
                result = self.run_generator(source, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
