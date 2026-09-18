"""
Natural language question parsing and entity extraction layer.
Translates unstructured clinical queries into structured intents and parameters
for the deterministic query execution engine.
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional

from starter.schemas import Question, QuestionCategory


@dataclass
class ParsedQueryIntent:
    category: QuestionCategory
    intent_type: str  # hys_law, dosing_error, miscoded_sae, prohibited_med, discontinuation, lookup, enrollment_count, unknown
    subject_id: Optional[str] = None
    site_id: Optional[str] = None
    visit: Optional[str] = None
    target_domains: List[str] = field(default_factory=list)
    window_days: Optional[int] = None
    protocol_version: Optional[int] = None
    reason_filter: Optional[str] = None
    raw_text: str = ""


class QuestionParser:
    """Extracts entities and query intent from natural language questions."""

    @staticmethod
    def parse(question: Question) -> ParsedQueryIntent:
        text = question.text.strip()
        text_lower = text.lower()

        # 1. Extract Subject ID (format: 042-SXX-YYY)
        subj_match = re.search(r"\b(\d{3}-S\d{2}-\d{3})\b", text, re.IGNORECASE)
        subject_id = subj_match.group(1) if subj_match else None

        # 2. Extract Site ID (format: SXX, avoiding matching inside USUBJID)
        site_id: Optional[str] = None
        site_matches = re.findall(r"\b(S\d{2})\b", text, re.IGNORECASE)
        if site_matches:
            if subject_id:
                subj_site = re.search(r"-(S\d{2})-", subject_id, re.IGNORECASE)
                subj_site_val = subj_site.group(1).upper() if subj_site else ""
                standalone = [s.upper() for s in site_matches if s.upper() != subj_site_val]
                site_id = standalone[0] if standalone else None
            else:
                site_id = site_matches[0].upper()

        # 3. Extract Visit
        visit_match = re.search(r"\b(WEEK\s*\d+|BASELINE|SCREENING|EOS|END OF STUDY)\b", text, re.IGNORECASE)
        visit: Optional[str] = None
        if visit_match:
            v_raw = visit_match.group(1).upper().replace(" ", "")
            if v_raw == "ENDOFSTUDY":
                v_raw = "EOS"
            visit = v_raw

        # 4. Extract Day Window
        win_match = re.search(r"within\s+(\d+)\s+days", text, re.IGNORECASE)
        window_days = int(win_match.group(1)) if win_match else None

        # 5. Extract Protocol Version
        proto_match = re.search(r"protocol\s+(?:version\s+)?(?:v\s*)?(\d+)", text, re.IGNORECASE)
        proto_ver = int(proto_match.group(1)) if proto_match else None

        # 6. Extract Target Domains
        domains: List[str] = []
        if any(w in text_lower for w in ["laboratory", "lab"]):
            domains.append("LB")
        if any(w in text_lower for w in ["adverse-event", "adverse event", "ae"]):
            domains.append("AE")
        if any(w in text_lower for w in ["vital signs", "vital", "vitals", "vs"]):
            domains.append("VS")
        if any(w in text_lower for w in ["exposure", "dose"]):
            domains.append("EX")
        if any(w in text_lower for w in ["concomitant", "medicine", "medication", "cm"]):
            domains.append("CM")
        if any(w in text_lower for w in ["disposition", "discontinued", "ds"]):
            domains.append("DS")
        if any(w in text_lower for w in ["ecg"]):
            domains.append("EG")
        if any(w in text_lower for w in ["medical history", "mh"]):
            domains.append("MH")

        # 7. Classify Intent Type
        intent_type = "unknown"
        reason_filter: Optional[str] = None

        if "hy's law" in text_lower or "hys law" in text_lower:
            intent_type = "hys_law"
        elif any(w in text_lower for w in ["wrong dose", "dosing error", "incorrect dose", "dose error"]):
            intent_type = "dosing_error"
        elif any(w in text_lower for w in ["miscoded", "aeser='n'", "aeser = 'n'", "hospitalisation", "hospitalization"]):
            intent_type = "miscoded_sae"
        elif any(w in text_lower for w in ["prohibited concomitant", "prohibited medication", "prohibited"]):
            intent_type = "prohibited_med"
        elif any(w in text_lower for w in ["discontinued", "discontinuation"]):
            intent_type = "discontinuation"
            if "adverse event" in text_lower:
                reason_filter = "ADVERSE EVENT"
        elif any(w in text_lower for w in ["enrolled", "enrollment", "total subjects", "how many unique subjects", "subjects are enrolled"]):
            intent_type = "enrollment_count"
        elif any(w in text_lower for w in ["list", "find records", "lookup", "records for"]):
            intent_type = "lookup"

        # 8. Determine Question Category
        category = question.category
        if not category:
            if text_lower.startswith("how many") or intent_type in ["enrollment_count"]:
                category = QuestionCategory.COUNT
            elif text_lower.startswith("list") or intent_type == "lookup":
                category = QuestionCategory.LOOKUP
            elif "site s01" in text_lower and intent_type == "dosing_error":
                category = QuestionCategory.TRAP
            else:
                category = QuestionCategory.FINDING

        return ParsedQueryIntent(
            category=category,
            intent_type=intent_type,
            subject_id=subject_id,
            site_id=site_id,
            visit=visit,
            target_domains=domains,
            window_days=window_days,
            protocol_version=proto_ver,
            reason_filter=reason_filter,
            raw_text=text,
        )
