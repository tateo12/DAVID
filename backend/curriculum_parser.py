"""Parse exported_curriculum.md (Duolingo-style export) into Sentinel course modules.

Output rows match skill_lessons: skill_class, title, objective, content (JSON), plus metadata.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _skill_class_for_unit(unit_index: int) -> str:
    if unit_index <= 2:
        return "novice"
    if unit_index <= 4:
        return "developing"
    if unit_index <= 6:
        return "proficient"
    return "advanced"


def _strip_md(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


@dataclass
class _Block:
    title: str
    lines: list[str] = field(default_factory=list)


def _split_blocks(body_lines: list[str], header_re: re.Pattern[str]) -> list[_Block]:
    blocks: list[_Block] = []
    current: _Block | None = None
    for line in body_lines:
        m = header_re.match(line)
        if m:
            if current:
                blocks.append(current)
            current = _Block(title=m.group(1).strip())
            continue
        if current is not None:
            current.lines.append(line)
    if current:
        blocks.append(current)
    return blocks


def _parse_slide_block(block: _Block) -> dict[str, Any]:
    text = "\n".join(block.lines).strip()
    tracks: dict[str, str] = {}
    for label in ("Beginner:", "Intermediate:", "Pro:"):
        idx = text.find(f"**{label}**")
        if idx >= 0:
            rest = text[idx + len(f"**{label}**") :]
            nxt = len(rest)
            for other in ("**Beginner:**", "**Intermediate:**", "**Pro:**"):
                j = rest.find(other)
                if j >= 0 and j < nxt:
                    nxt = j
            tracks[label.lower().rstrip(":")] = _strip_md(rest[:nxt])
    body_md = text
    for label in ("**Beginner:**", "**Intermediate:**", "**Pro:**"):
        body_md = body_md.replace(label, "\n\n_" + label.replace("*", "") + "_\n")
    return {"title": block.title, "body_md": body_md.strip(), "tracks": tracks}


def parse_exported_curriculum(md_text: str) -> list[dict[str, Any]]:
    """Return list of lesson dicts ready for skill_lessons insert (without id)."""
    lines = md_text.splitlines()
    i = 0
    unit_index = 0
    unit_title = ""
    sequence = 0
    out: list[dict[str, Any]] = []

    slide_header = re.compile(r"^####\s+Slide\s+\d+:\s*(.+)$")

    while i < len(lines):
        line = lines[i]
        um = re.match(r"^##\s+Unit\s+(\d+):\s*(.+)$", line)
        if um:
            unit_index = int(um.group(1))
            unit_title = um.group(2).strip()
            i += 1
            continue

        lm = re.match(r"^###\s+Lesson:\s*(.+)$", line)
        if lm:
            lesson_title = lm.group(1).strip()
            i += 1
            body: list[str] = []
            while i < len(lines):
                if re.match(r"^###\s+", lines[i]) or re.match(r"^##\s+", lines[i]):
                    break
                body.append(lines[i])
                i += 1
            slide_blocks = _split_blocks(body, slide_header)
            slides = [_parse_slide_block(b) for b in slide_blocks if b.lines]
            objective = slides[0]["title"] if slides else lesson_title
            sequence += 1
            payload = {
                "version": 1,
                "kind": "lesson",
                "unit_index": unit_index,
                "unit_title": unit_title,
                "lesson_title": lesson_title,
                "slides": slides,
            }
            out.append(
                {
                    "skill_class": _skill_class_for_unit(unit_index),
                    "title": f"Unit {unit_index}: {lesson_title}",
                    "objective": objective,
                    "content": json.dumps(payload, ensure_ascii=False),
                    "sequence_order": sequence,
                    "lesson_kind": "lesson",
                    "unit_title": unit_title,
                }
            )
            continue

        qm = re.match(r"^###\s+Quiz:\s*(.+)$", line)
        if qm:
            i += 1
            while i < len(lines):
                if re.match(r"^###\s+", lines[i]) or re.match(r"^##\s+", lines[i]):
                    break
                i += 1
            continue

        i += 1

    return out


def load_curriculum_rows_from_file(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    return parse_exported_curriculum(path.read_text(encoding="utf-8"))

