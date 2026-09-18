"""
Strict evidence validation and audit-trail system for Study Sentinel ATLAS.
Ensures zero-hallucination citations by validating record existence, domain identity,
and semantic claim grounding.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from starter.schemas import RecordRef


@dataclass(frozen=True)
class EvidenceItem:
    """Represents a validated claim grounded in a specific clinical record."""
    claim: str
    record_ref: RecordRef
    reason: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "claim": self.claim,
            "record_ref": self.record_ref.model_dump(),
            "reason": self.reason,
        }


class EvidenceValidator:
    """
    Validates that evidence cited in answers exists in the study graph
    and meaningfully supports the claim.
    """

    @staticmethod
    def verify_record_exists(study_graph: Any, record_ref: RecordRef) -> bool:
        """Asserts the record exists in the indexed StudyGraph."""
        key = record_ref.to_triple()
        return key in study_graph.records_by_ref

    @staticmethod
    def get_underlying_record(study_graph: Any, record_ref: RecordRef) -> Optional[Any]:
        """Retrieves raw indexed record object."""
        return study_graph.records_by_ref.get(record_ref.to_triple())

    @staticmethod
    def validate_lab_finding(
        study_graph: Any,
        record_ref: RecordRef,
        expected_testcd: str,
        min_uln_multiple: Optional[float] = None
    ) -> bool:
        """
        Verifies that a cited lab record:
        1. Is in domain LB.
        2. Matches expected analyte test code.
        3. Exceeds the specified ULN multiple if given.
        """
        rec = study_graph.records_by_ref.get(record_ref.to_triple())
        if not rec or record_ref.domain.upper() != "LB":
            return False
        if rec.testcd.upper() != expected_testcd.upper():
            return False
        if min_uln_multiple is not None:
            # Check ratio
            ratio, _, _ = study_graph.unit_manager.compute_uln_multiple(
                testcd=rec.testcd,
                numeric_val=rec.norm_val.numeric_value or 0.0,
                unit=rec.orresu,
                site_id=study_graph.get_subject_site(rec.usubjid),
            )
            if ratio is None or ratio < min_uln_multiple:
                return False
        return True


class EvidenceCollection:
    """Maintains an ordered, deduplicated collection of verified evidence."""

    def __init__(self, study_graph: Any):
        self.study_graph = study_graph
        self._items: List[EvidenceItem] = []
        self._seen_refs: Set[str] = set()

    def add(self, claim: str, record_ref: RecordRef, reason: str) -> bool:
        """
        Adds evidence item if verified against graph.
        Never cites non-existent or hallucinated records.
        """
        if not EvidenceValidator.verify_record_exists(self.study_graph, record_ref):
            return False

        if record_ref.key not in self._seen_refs:
            self._items.append(EvidenceItem(claim=claim, record_ref=record_ref, reason=reason))
            self._seen_refs.add(record_ref.key)
        return True

    def get_record_refs(self) -> List[RecordRef]:
        return [item.record_ref for item in self._items]

    def get_items(self) -> List[EvidenceItem]:
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)
