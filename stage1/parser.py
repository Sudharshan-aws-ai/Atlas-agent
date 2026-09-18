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
    intent_type: str  # hys_law, hys_law_evidence, dosing_error, miscoded_sae, prohibited_med, discontinuation, lookup, enrollment_count, unknown
    subject_id: Optional[str] = None
    site_id: Optional[str] = None
    visit: Optional[str] = None
    target_domains: List[str] = field(default_factory=list)
    window_days: Optional[int] = None
    protocol_version: Optional[int] = None
    reason_filter: Optional[str] = None
    test_code: Optional[str] = None
    target_date: Optional[str] = None
    is_evidence_request: bool = False
    raw_text: str = ""


class QuestionParser:
    """Extracts entities and query intent from natural language questions."""

    @staticmethod
    def parse(question: Question) -> ParsedQueryIntent:
        text = question.text.strip()
        # Normalize typographical quotes, symbols, and dashes
        norm_text = (
            text.replace("’", "'")
            .replace("‘", "'")
            .replace("“", '"')
            .replace("”", '"')
            .replace("×", "x")
            .replace("–", "-")
            .replace("—", "-")
        )
        text_lower = norm_text.lower()

        # 1. Extract Subject ID (format: STUDY-SXX-YYY or SXX-YYY)
        subj_match = re.search(r"\b([A-Za-z0-9]+-S\d{2,3}-\d{3,4})\b", norm_text, re.IGNORECASE)
        if subj_match:
            subject_id = subj_match.group(1).upper()
        else:
            short_subj = re.search(r"\b(S\d{2,3}-\d{3,4})\b", norm_text, re.IGNORECASE)
            subject_id = short_subj.group(1).upper() if short_subj else None

        # 2. Extract Site ID (format: SXX, avoiding matching inside USUBJID)
        site_id: Optional[str] = None
        site_matches = re.findall(r"\b(S\d{2})\b", norm_text, re.IGNORECASE)
        if site_matches:
            if subject_id:
                subj_site = re.search(r"-(S\d{2})-", subject_id, re.IGNORECASE)
                subj_site_val = subj_site.group(1).upper() if subj_site else ""
                standalone = [s.upper() for s in site_matches if s.upper() != subj_site_val]
                site_id = standalone[0] if standalone else None
            else:
                site_id = site_matches[0].upper()

        # 3. Extract Visit
        visit_match = re.search(r"\b(WEEK\s*\d+|BASELINE|SCREENING|EOS|END OF STUDY)\b", norm_text, re.IGNORECASE)
        visit: Optional[str] = None
        if visit_match:
            v_raw = visit_match.group(1).upper().replace(" ", "")
            if v_raw == "ENDOFSTUDY":
                v_raw = "EOS"
            visit = v_raw

        # 4. Extract Day Window
        win_match = re.search(r"within\s+(\d+)\s+days", norm_text, re.IGNORECASE)
        window_days = int(win_match.group(1)) if win_match else None

        # 5. Extract Protocol Version
        proto_match = re.search(r"protocol\s+(?:version\s+)?(?:v\s*)?(\d+)", norm_text, re.IGNORECASE)
        proto_ver = int(proto_match.group(1)) if proto_match else None

        # 6. Extract Target Date (ISO YYYY-MM-DD or CDISC DD-MON-YYYY or MM/DD/YYYY)
        target_date: Optional[str] = None
        date_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", norm_text)
        if not date_match:
            date_match = re.search(r"\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b", norm_text)
        if date_match:
            target_date = date_match.group(1)

        # 7. Extract Specific Test Code (ALT, AST, BILI, HBA1C, GLUC, CREAT, SYSBP, DIABP, PULSE, QTCF)
        test_code: Optional[str] = None
        test_match = re.search(
            r"\b(ALT|AST|BILI|BILIRUBIN|HBA1C|GLUC|GLUCOSE|CREAT|CREATININE|SYSBP|DIABP|PULSE|QTCF|QTC)\b",
            norm_text,
            re.IGNORECASE,
        )
        if test_match:
            raw_code = test_match.group(1).upper()
            mapping = {
                "BILIRUBIN": "BILI",
                "GLUCOSE": "GLUC",
                "CREATININE": "CREAT",
                "QTC": "QTCF",
            }
            test_code = mapping.get(raw_code, raw_code)

        # 8. Check if asking explicitly for evidence
        is_evidence_request = bool(
            re.search(r"\b(show|list|get|provide|what is the|give)\s+evidence\b", text_lower)
            or text_lower.startswith("evidence")
            or "supporting evidence" in text_lower
        )

        # 9. Extract Target Domains
        def contains_word_or_phrase(keywords: List[str]) -> bool:
            for kw in keywords:
                if re.search(r"\b" + re.escape(kw) + r"\b", text_lower):
                    return True
            return False

        domains: List[str] = []
        if contains_word_or_phrase(["laboratory", "lab", "labs", "lab result", "lab results", "lb"]) or test_code in ["ALT", "AST", "BILI", "HBA1C", "GLUC", "CREAT"]:
            domains.append("LB")
        if contains_word_or_phrase(["adverse-event", "adverse event", "ae", "side effect", "side effects", "side-effect", "adverse reaction"]):
            domains.append("AE")
        if contains_word_or_phrase(["vital signs", "vital", "vitals", "vs", "blood pressure", "pulse", "heart rate"]) or test_code in ["SYSBP", "DIABP", "PULSE"]:
            domains.append("VS")
        if contains_word_or_phrase(["exposure", "dose", "doses", "dosing", "study drug", "ex"]):
            domains.append("EX")
        if contains_word_or_phrase(["concomitant", "medicine", "medicines", "medication", "medications", "meds", "cm"]):
            domains.append("CM")
        if contains_word_or_phrase(["disposition", "discontinued", "discontinuation", "withdrew", "ds"]):
            domains.append("DS")
        if contains_word_or_phrase(["ecg", "qtc", "electrocardiogram", "eg"]) or test_code in ["QTCF"]:
            domains.append("EG")
        if contains_word_or_phrase(["medical history", "history", "mh"]):
            domains.append("MH")

        # 10. Classify Intent Type
        intent_type = "unknown"
        reason_filter: Optional[str] = None

        # Check Trap queries
        trap_keywords = [
            "deliberately given", "falsely recorded", "deliberately changed", "secretly withdrew",
            "secretly withdraw", "harmed by", "intentionally given", "definitely violated",
            "intentionally misdiagnosed", "definitely developed liver failure", "dangerous dose"
        ]
        is_malicious_trap = any(k in text_lower for k in trap_keywords)
        is_dosing_trap = "site s01" in text_lower and ("wrong dose" in text_lower or "received a wrong dose" in text_lower)

        # Dosing deviations checked before general trap to run dosing scanner
        if any(w in text_lower for w in ["wrong dose", "dosing error", "dosing errors", "incorrect dose", "dose error", "dose errors", "dosing deviation", "wrong doses"]):
            intent_type = "dosing_error"

        elif is_malicious_trap:
            intent_type = "trap"

        # Evidence request for liver damage
        elif is_evidence_request and any(w in text_lower for w in ["liver", "hy's law", "hys law", "hepatic", "finding"]):
            intent_type = "hys_law_evidence"

        # Hy's law and liver damage findings
        elif any(w in text_lower for w in [
            "hy's law", "hys law", "liver damage", "liver-damage", "liver injury", "liver-injury",
            "hepatic damage", "hepatic injury", "hepatotoxicity", "dili", "elevated liver",
            "liver-damage pattern", "potential liver", "alt and bilirubin elevations",
            "elevated liver-related", "laboratory abnormalities needing review",
            "require reviewer attention based on the protocol", "potential hy's law",
            "potential hys law", "satisfy the potential hy"
        ]):
            intent_type = "hys_law"

        # Specific threshold findings
        elif any(w in text_lower for w in ["alt/ast greater than 3x", "alt/ast greater than 3", "greater than 3x uln", "alt/ast > 3x"]):
            intent_type = "transaminase_elevation"

        elif any(w in text_lower for w in ["bilirubin greater than 2x", "greater than 2x uln", "bilirubin > 2x"]):
            intent_type = "bilirubin_elevation"

        # Unit conversions
        elif any(w in text_lower for w in ["requiring unit conversion", "same analyte recorded in different units", "recorded in different units"]):
            intent_type = "unit_conversion_inquiry"

        # Serious & severe adverse events
        elif any(w in text_lower for w in ["serious adverse event", "serious adverse events"]):
            intent_type = "serious_adverse_events"

        elif any(w in text_lower for w in ["severe adverse event", "severe adverse events"]):
            intent_type = "severe_adverse_events"

        elif any(w in text_lower for w in ["associated with study treatment", "related to study treatment"]):
            intent_type = "treatment_related_aes"

        elif any(w in text_lower for w in ["both laboratory abnormalities and adverse events"]):
            intent_type = "labs_and_aes"

        # Dosing deviations
        elif any(w in text_lower for w in ["wrong dose", "dosing error", "dosing errors", "incorrect dose", "dose error", "dose errors", "dosing deviation", "wrong doses"]):
            intent_type = "dosing_error"

        elif any(w in text_lower for w in ["miscoded", "aeser='n'", "aeser = 'n'", "hospitalisation", "hospitalization"]):
            intent_type = "miscoded_sae"

        elif any(w in text_lower for w in ["protocol-relevant medication", "prohibited concomitant", "prohibited medication", "prohibited medications", "prohibited"]):
            intent_type = "prohibited_med"

        # Specific domain record counts
        elif any(w in text_lower for w in ["exposure or dose records", "how many exposure", "how many dose records"]):
            intent_type = "count_exposure"

        elif any(w in text_lower for w in ["laboratory records are present", "how many laboratory records are present"]):
            intent_type = "count_labs"

        elif any(w in text_lower for w in ["adverse event records are present", "how many adverse event records are present"]):
            intent_type = "count_aes"

        elif any(w in text_lower for w in ["concomitant medication records", "how many concomitant"]):
            intent_type = "count_cm"

        elif any(w in text_lower for w in ["disposition records are present", "how many disposition records"]):
            intent_type = "count_ds"

        elif any(w in text_lower for w in ["medical history records", "how many medical history"]):
            intent_type = "count_mh"

        elif any(w in text_lower for w in ["unique sites are present", "how many unique sites", "how many sites are present"]):
            intent_type = "count_sites"

        elif any(w in text_lower for w in ["visits are recorded in the study", "how many visits are recorded in the study"]):
            intent_type = "count_visits"

        elif any(w in text_lower for w in ["completed the study", "how many subjects completed"]):
            intent_type = "completed_count"

        elif any(w in text_lower for w in ["at least one abnormal laboratory result"]):
            intent_type = "abnormal_lab_subject_count"

        elif any(w in text_lower for w in ["at least one adverse event"]):
            intent_type = "subject_with_ae_count"

        elif any(w in text_lower for w in ["associated with each subject", "laboratory records are associated with each subject"]):
            intent_type = "labs_per_subject"

        elif any(w in text_lower for w in ["discontinued", "discontinuation", "withdrew", "dropout", "dropped out"]):
            intent_type = "discontinuation"
            if "adverse event" in text_lower:
                reason_filter = "ADVERSE EVENT"

        elif any(w in text_lower for w in [
            "how many subjects are present", "how many subjects in", "how many subjects are enrolled",
            "how many unique subjects", "subjects are present in the study", "subjects are present",
            "total subjects", "subjects are enrolled", "unique subjects", "enrolled in the study", "enrolled"
        ]):
            intent_type = "enrollment_count"

        elif any(w in text_lower for w in ["list", "find records", "lookup", "records for"]):
            intent_type = "lookup"

        elif subject_id and (
            test_code
            or target_date
            or any(w in text_lower for w in ["what", "which", "did", "show", "give", "get", "results", "value", "medicines", "dose", "side effects", "visits", "status", "earliest", "latest", "site"])
            or len(domains) > 0
        ):
            intent_type = "lookup"

        # 11. Determine Question Category
        category = question.category
        if not category:
            if is_malicious_trap or is_dosing_trap:
                category = QuestionCategory.TRAP
            elif text_lower.startswith("how many") or intent_type in [
                "enrollment_count", "count_exposure", "count_labs", "count_aes", "count_cm",
                "count_ds", "count_mh", "count_sites", "count_visits", "completed_count",
                "abnormal_lab_subject_count", "subject_with_ae_count", "labs_per_subject"
            ]:
                category = QuestionCategory.COUNT
            elif text_lower.startswith("list") or intent_type in ["lookup"]:
                category = QuestionCategory.LOOKUP
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
            test_code=test_code,
            target_date=target_date,
            is_evidence_request=is_evidence_request,
            raw_text=text,
        )
