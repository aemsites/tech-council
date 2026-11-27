#!/usr/bin/env python3
"""Validate structured summary JSON and generate EDS Word tables and optional HTML."""

import argparse
from collections import Counter
from html import escape
import json
from pathlib import Path
import re
import sys

try:
    from docx import Document
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor
    from jsonschema import Draft202012Validator
    from jsonschema.exceptions import best_match
except ModuleNotFoundError as error:
    raise SystemExit(
        "Missing document dependency. Install this skill's requirements.txt "
        "in a Python environment, then rerun the command."
    ) from error


SKILL_ROOT = Path(__file__).resolve().parents[1]
BLOCK_FIELDS = {
    "Talk Overview": ("Summary", "Audience"),
    "Talk Takeaways": ("Takeaways",),
    "Talk Topic": ("Summary", "Key points"),
    "Talk Question": ("Question", "Status", "Answer"),
}
METADATA = ("Start", "End", "Tags")


def seconds(value):
    if value is None or value == "":
        return None
    result = 0
    for part in str(value).split(":"):
        result = result * 60 + int(part)
    if result > 9007199254740991:
        raise ValueError("Timestamp exceeds the browser's safe integer range.")
    return result


def validate_summary(data):
    schema = json.loads((SKILL_ROOT / "assets/summary.schema.json").read_text())
    validator = Draft202012Validator(schema)
    error = best_match(validator.iter_errors(data))
    if error:
        location = "/".join(str(part) for part in error.absolute_path) or "document"
        raise ValueError(f"Schema error at {location}: {error.message}")
    counts = Counter(block["block"] for block in data["blocks"])
    for name in ("Talk Overview", "Talk Takeaways"):
        if counts[name] != 1:
            raise ValueError(f"Expected exactly one {name} block.")
    if not counts["Talk Topic"]:
        raise ValueError("Expected at least one Talk Topic block.")
    previous_rank = -1
    previous_topic_start = -1
    order = list(BLOCK_FIELDS)
    for index, block in enumerate(data["blocks"], 1):
        rank = order.index(block["block"])
        if rank < previous_rank:
            raise ValueError(f"Block {index} is out of section order.")
        previous_rank = rank
        fields = block["fields"]
        start, end = seconds(fields["Start"]), seconds(fields["End"])
        if end is not None and (start is None or end <= start):
            raise ValueError(f"Block {index}: End must be later than a known Start.")
        if block["block"] == "Talk Topic" and start is not None:
            if start < previous_topic_start:
                raise ValueError(f"Block {index}: topic starts must remain in recording order.")
            previous_topic_start = start
    return data


def ordered_fields(block):
    fields = block["fields"]
    keys = (["Title"] if "Title" in fields else []) + list(METADATA)
    keys.extend(BLOCK_FIELDS[block["block"]])
    for key in keys:
        value = fields[key]
        if key == "Tags":
            seen = set()
            normalized = []
            for tag in value:
                text = tag.strip()
                if text and text.casefold() not in seen:
                    normalized.append(text)
                    seen.add(text.casefold())
            value = ", ".join(normalized)
        yield key, value


def create_document(data):
    document = Document()
    section = document.sections[0]
    section.top_margin = section.bottom_margin = Inches(0.65)
    section.left_margin = section.right_margin = Inches(0.75)
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    normal.paragraph_format.space_after = Pt(5)
    document.core_properties.title = data["title"]
    document.core_properties.subject = "Structured EDS recording summary"
    for block in data["blocks"]:
        table = document.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        table.autofit = False
        table.columns[0].width = Inches(1.3)
        table.columns[1].width = Inches(5.6)
        header = table.cell(0, 0).merge(table.cell(0, 1))
        header.text = block["block"]
        shade = OxmlElement("w:shd")
        shade.set(qn("w:fill"), "243B64")
        header._tc.get_or_add_tcPr().append(shade)
        for run in header.paragraphs[0].runs:
            run.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
        for label, value in ordered_fields(block):
            cells = table.add_row().cells
            cells[0].text = label
            for run in cells[0].paragraphs[0].runs:
                run.bold = True
            if isinstance(value, list):
                for index, item in enumerate(value):
                    paragraph = cells[1].paragraphs[0] if index == 0 else cells[1].add_paragraph()
                    paragraph.style = document.styles["List Bullet"]
                    paragraph.add_run(item)
            else:
                cells[1].text = "" if value is None else str(value)
        for row in table.rows:
            row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for row in table.rows[:-1]:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.keep_with_next = True
        document.add_paragraph()
    return document


def create_html(data):
    blocks = []
    for block in data["blocks"]:
        name = re.sub(r"[^a-z0-9]+", "-", block["block"].lower()).strip("-")
        rows = []
        for label, value in ordered_fields(block):
            if isinstance(value, list):
                content = "<ul>" + "".join(f"<li>{escape(item)}</li>" for item in value) + "</ul>"
            else:
                content = "" if value is None or value == "" else f"<p>{escape(str(value))}</p>"
            rows.append(f"<div><div>{escape(label)}</div><div>{content}</div></div>")
        blocks.append(f'<div class="{name}">\n' + "\n".join(rows) + "\n</div>")
    return "<div>\n" + "\n".join(blocks) + "\n</div>\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Summary JSON following assets/summary.schema.json")
    parser.add_argument("output", type=Path, nargs="?", help="Output .docx path")
    parser.add_argument("--html", type=Path, help="Also write an authored EDS .plain.html fragment")
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--force", action="store_true", help="Replace named existing output files")
    args = parser.parse_args()
    try:
        data = validate_summary(json.loads(args.input.read_text(encoding="utf-8")))
        if args.validate_only:
            print(f"Valid summary: {len(data['blocks'])} blocks.")
            return
        if not args.output or args.output.suffix.lower() != ".docx":
            raise ValueError("Provide an output path ending in .docx, or use --validate-only.")
        outputs = [args.output] + ([args.html] if args.html else [])
        if len({path.resolve() for path in [args.input, *outputs]}) != len(outputs) + 1:
            raise ValueError("Input and output paths must be different.")
        for path in outputs:
            if path.exists() and not args.force:
                raise ValueError(f"Output exists: {path}. Use a new path or authorized --force.")
        document = create_document(data)
        html = create_html(data) if args.html else None
        document.save(args.output)
        if args.html:
            args.html.write_text(html, encoding="utf-8")
        print(f"Created {args.output} with {len(data['blocks'])} EDS block tables.")
        if args.html:
            print(f"Created {args.html}.")
    except (ValueError, OSError) as error:
        parser.exit(1, f"Summary generation failed: {error}\n")


if __name__ == "__main__":
    main()
