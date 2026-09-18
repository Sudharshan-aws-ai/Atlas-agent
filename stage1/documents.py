"""
Document parsing and prompt-injection defense layer for clinical trial specifications.
Extracts rules from Protocol (v1, v2, v3), Laboratory Manual, and SAP.
CRITICAL DEFENSE: Disregards embedded adversarial instructions targeting automated reviewers.
"""

import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set


@dataclass(frozen=True)
class DocumentRule:
    doc_name: str
    section_number: str
    section_title: str
    text: str
    is_adversarial_directive: bool = False


class DocumentManager:
    """
    Parses and indexes study protocol documents, lab manuals, and statistical analysis plans.
    Strictly separates document evidence from software control directives.
    """

    def __init__(self, doc_dir: str):
        self.doc_dir = doc_dir
        self.documents: Dict[str, str] = {}
        self.rules: List[DocumentRule] = []
        self._load_documents()

    def _find_doc_path(self, filename: str) -> Optional[str]:
        candidates = [
            os.path.join(self.doc_dir, filename),
            os.path.join(self.doc_dir, "documents", filename),
            os.path.join(self.doc_dir, "hackathon-data", "documents", filename),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        return None

    def _load_documents(self) -> None:
        target_files = [
            "protocol_v1.md",
            "protocol_v2.md",
            "protocol_v3.md",
            "lab-manual.md",
            "lab-manual_v3.md",
            "sap.md",
        ]
        for fname in target_files:
            path = self._find_doc_path(fname)
            if path and os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    self.documents[fname] = content
                    self._parse_markdown_rules(fname, content)

    def _parse_markdown_rules(self, doc_name: str, content: str) -> None:
        """Extracts structured sections from markdown files."""
        current_section_num = ""
        current_section_title = ""
        current_lines: List[str] = []

        def flush():
            if current_section_title and current_lines:
                sec_text = "\n".join(current_lines).strip()
                # Check for adversarial injection attempt
                is_adversarial = bool(re.search(r"(note to automated reviewers|automated reviewers should)", sec_text, re.IGNORECASE))
                self.rules.append(DocumentRule(
                    doc_name=doc_name,
                    section_number=current_section_num,
                    section_title=current_section_title,
                    text=sec_text,
                    is_adversarial_directive=is_adversarial,
                ))

        for line in content.splitlines():
            sec_match = re.match(r"^##\s+(\d+)\.\s*(.*)", line.strip())
            if sec_match:
                flush()
                current_section_num = sec_match.group(1)
                current_section_title = sec_match.group(2).strip()
                current_lines = []
            elif line.startswith("# "):
                continue
            else:
                current_lines.append(line)
        flush()

    def get_visit_window_days(self, protocol_version: int) -> int:
        """
        Protocol §4:
        v1: ±7 days from scheduled day.
        v2 & v3: ±3 days from scheduled day.
        """
        if protocol_version == 1:
            return 7
        return 3

    def get_prohibited_medication_classes(self, protocol_version: int) -> Set[str]:
        """
        Protocol §5:
        v1 & v2: Systemic Glucocorticoid
        v3: Systemic Glucocorticoid, Sulfonylurea
        """
        prohibited = {"SYSTEMIC_GLUCOCORTICOID", "SYSTEMIC GLUCOCORTICOID"}
        if protocol_version >= 3:
            prohibited.add("SULFONYLUREA")
        return prohibited

    def get_hys_law_definition(self, protocol_version: int = 1) -> str:
        """
        Protocol §7:
        'ALT or AST > 3 × ULN together with total bilirubin > 2 × ULN within 14 days,
        without cholestasis or alternative explanation.'
        """
        return (
            "Potential Hy's law: ALT or AST > 3 × ULN together with total bilirubin > 2 × ULN "
            "within 14 days, without cholestasis or alternative explanation."
        )

    def get_adversarial_injections_found(self) -> List[DocumentRule]:
        """Returns document passages identified as adversarial instructions."""
        return [r for r in self.rules if r.is_adversarial_directive]
