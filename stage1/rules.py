"""
Deterministic clinical rule engine for Study Sentinel ATLAS.
Executes protocol-mandated evaluations (Hy's law, dosing violations, prohibited meds,
miscoded SAEs, and disposition analysis) with zero LLM guesswork.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from starter.schemas import RecordRef
from .dates import days_between
from .loader import AERecord, ConMedRecord, DispositionRecord, ExposureRecord, LabRecord


@dataclass
class HysLawEvaluation:
    usubjid: str
    is_candidate: bool
    transaminase_record: Optional[LabRecord] = None
    transaminase_multiple: Optional[float] = None
    bilirubin_record: Optional[LabRecord] = None
    bilirubin_multiple: Optional[float] = None
    day_difference: Optional[int] = None
    screening_excluded: bool = False
    screening_reason: Optional[str] = None
    evidence: List[RecordRef] = field(default_factory=list)
    rationale: str = ""


class RuleEngine:
    """
    Implements deterministic clinical evaluation rules according to
    Protocol STUDY-042 and Laboratory Manual specifications.
    """

    @staticmethod
    def evaluate_hys_law_for_subject(usubjid: str, graph: Any) -> HysLawEvaluation:
        """
        Evaluates Protocol §7 Hy's Law:
        (ALT or AST > 3 × ULN) AND (Total Bilirubin > 2 × ULN) within 14 days,
        without cholestasis or alternative explanation (e.g. pre-existing hepatic disease at screening).
        """
        site_id = graph.get_subject_site(usubjid)

        # 1. Check Screening exclusion (Protocol §3: ALT or AST > 2 × ULN at screening)
        screening_labs = graph.get_subject_labs(usubjid, visit="SCREENING")
        for rec in screening_labs:
            if rec.testcd in ["ALT", "AST"] and rec.norm_val.is_numeric and rec.norm_val.numeric_value is not None:
                ratio, ref, _ = graph.unit_manager.compute_uln_multiple(
                    testcd=rec.testcd,
                    numeric_val=rec.norm_val.numeric_value,
                    unit=rec.orresu,
                    site_id=site_id,
                )
                if ratio is not None and ratio > 2.0:
                    return HysLawEvaluation(
                        usubjid=usubjid,
                        is_candidate=False,
                        screening_excluded=True,
                        screening_reason=f"Exclusion criteria met: Screening {rec.testcd} was {ratio:.2f}x ULN (>2x ULN).",
                        rationale="Baseline transaminases were already elevated; excluded per protocol §3.",
                    )

        # 2. Identify post-baseline transaminase elevations (> 3x ULN)
        post_baseline_labs = [
            rec for rec in graph.get_subject_labs(usubjid)
            if rec.visit not in ["SCREENING"] and rec.norm_val.is_numeric and rec.norm_val.numeric_value is not None
        ]

        transaminase_elevations: List[Tuple[LabRecord, float]] = []
        bilirubin_elevations: List[Tuple[LabRecord, float]] = []

        for rec in post_baseline_labs:
            val = rec.norm_val.numeric_value
            if val is None:
                continue

            if rec.testcd in ["ALT", "AST"]:
                ratio, ref, _ = graph.unit_manager.compute_uln_multiple(
                    testcd=rec.testcd,
                    numeric_val=val,
                    unit=rec.orresu,
                    site_id=site_id,
                )
                if ratio is not None and ratio > 3.0:
                    transaminase_elevations.append((rec, ratio))

            elif rec.testcd == "BILI":
                ratio, ref, _ = graph.unit_manager.compute_uln_multiple(
                    testcd=rec.testcd,
                    numeric_val=val,
                    unit=rec.orresu,
                    site_id=site_id,
                )
                if ratio is not None and ratio > 2.0:
                    bilirubin_elevations.append((rec, ratio))

        # 3. Check co-occurrence within 14 days
        for t_rec, t_ratio in transaminase_elevations:
            for b_rec, b_ratio in bilirubin_elevations:
                diff = days_between(t_rec.dtc, b_rec.dtc)
                if diff is not None and abs(diff) <= 14:
                    evidence_refs = [
                        RecordRef(domain="LB", usubjid=usubjid, seq=t_rec.seq),
                        RecordRef(domain="LB", usubjid=usubjid, seq=b_rec.seq),
                    ]
                    rationale = (
                        f"Potential Hy's law confirmed: {t_rec.testcd} was {t_rec.orres} {t_rec.orresu} "
                        f"({t_ratio:.2f}x ULN > 3x ULN) on {t_rec.dtc.iso} and BILI was {b_rec.orres} {b_rec.orresu} "
                        f"({b_ratio:.2f}x ULN > 2x ULN) on {b_rec.dtc.iso} ({abs(diff)} days apart, within 14-day window)."
                    )
                    return HysLawEvaluation(
                        usubjid=usubjid,
                        is_candidate=True,
                        transaminase_record=t_rec,
                        transaminase_multiple=t_ratio,
                        bilirubin_record=b_rec,
                        bilirubin_multiple=b_ratio,
                        day_difference=abs(diff),
                        evidence=evidence_refs,
                        rationale=rationale,
                    )

        return HysLawEvaluation(
            usubjid=usubjid,
            is_candidate=False,
            rationale="Did not satisfy combined transaminase >3x ULN and bilirubin >2x ULN within 14 days.",
        )

    @staticmethod
    def find_hys_law_candidates(graph: Any, site_filter: Optional[str] = None) -> List[HysLawEvaluation]:
        """Scans study for all qualifying Hy's Law candidates."""
        candidates: List[HysLawEvaluation] = []
        subject_ids = graph.get_subject_ids(site_filter=site_filter)
        for usubjid in subject_ids:
            res = RuleEngine.evaluate_hys_law_for_subject(usubjid, graph)
            if res.is_candidate:
                candidates.append(res)
        return candidates

    @staticmethod
    def find_dosing_errors(
        graph: Any,
        site_filter: Optional[str] = None
    ) -> List[Tuple[ExposureRecord, RecordRef, str]]:
        """
        Protocol §8 Dosing:
        DRUG arm expected: 10 mg once daily.
        PLACEBO arm expected: 0 mg.
        Any other dose is a dosing error and deviation.
        """
        errors: List[Tuple[ExposureRecord, RecordRef, str]] = []
        subject_ids = graph.get_subject_ids(site_filter=site_filter)

        for usubjid in subject_ids:
            subj = graph.get_subject(usubjid)
            if not subj:
                continue
            arm = subj.arm.upper()
            expected_dose = 10.0 if arm == "DRUG" else 0.0

            ex_records = graph.get_subject_exposure(usubjid)
            for ex in ex_records:
                if ex.dose != expected_dose:
                    ref = RecordRef(domain="EX", usubjid=usubjid, seq=ex.seq)
                    reason = (
                        f"Dosing error: Subject {usubjid} ({arm} arm) received {ex.dose} {ex.dosu} "
                        f"at visit {ex.visit} (expected {expected_dose} mg)."
                    )
                    errors.append((ex, ref, reason))
        return errors

    @staticmethod
    def find_miscoded_saes(
        graph: Any,
        site_filter: Optional[str] = None
    ) -> List[Tuple[AERecord, RecordRef, str]]:
        """
        Protocol §6 Safety reporting:
        A hospitalisation flag (AESHOSP = Y) makes an event serious regardless
        of how AESER was coded. If AESHOSP = 'Y' and AESER = 'N', it is miscoded.
        """
        miscoded: List[Tuple[AERecord, RecordRef, str]] = []
        subject_ids = graph.get_subject_ids(site_filter=site_filter)

        for usubjid in subject_ids:
            ae_records = graph.get_subject_aes(usubjid)
            for ae in ae_records:
                if ae.is_miscoded_sae:
                    ref = RecordRef(domain="AE", usubjid=usubjid, seq=ae.seq)
                    reason = (
                        f"Miscoded SAE: Event '{ae.term}' resulted in hospitalisation (AESHOSP='Y') "
                        f"but was coded as non-serious (AESER='N'). Serious under protocol §6."
                    )
                    miscoded.append((ae, ref, reason))
        return miscoded

    @staticmethod
    def find_prohibited_medications(
        graph: Any,
        protocol_version: Optional[int] = None,
        site_filter: Optional[str] = None
    ) -> List[Tuple[ConMedRecord, RecordRef, str]]:
        """
        Protocol §5 Prohibited Concomitant Medications:
        v1 & v2: Systemic Glucocorticoids (e.g. Prednisolone)
        v3: Systemic Glucocorticoids + Sulfonylureas (e.g. Glibenclamide)
        """
        prohibited_findings: List[Tuple[ConMedRecord, RecordRef, str]] = []
        subject_ids = graph.get_subject_ids(site_filter=site_filter)

        proto_ver = protocol_version if protocol_version is not None else graph.protocol_version
        prohibited_classes = graph.document_manager.get_prohibited_medication_classes(proto_ver)

        for usubjid in subject_ids:
            cm_records = graph.get_subject_conmeds(usubjid)
            for cm in cm_records:
                clas_clean = cm.clas.upper().replace(" ", "_")
                if clas_clean in prohibited_classes or cm.clas.upper() in prohibited_classes:
                    ref = RecordRef(domain="CM", usubjid=usubjid, seq=cm.seq)
                    reason = (
                        f"Prohibited medication: '{cm.trt}' (class: {cm.clas}) taken on {cm.stdtc.iso} "
                        f"is prohibited under Protocol version {proto_ver} §5."
                    )
                    prohibited_findings.append((cm, ref, reason))
        return prohibited_findings

    @staticmethod
    def find_discontinuations(
        graph: Any,
        reason_keyword: Optional[str] = None,
        site_filter: Optional[str] = None
    ) -> List[Tuple[DispositionRecord, RecordRef, str]]:
        """
        Finds disposition discontinuation records, optionally matching a specific reason
        like 'ADVERSE EVENT'.
        """
        findings: List[Tuple[DispositionRecord, RecordRef, str]] = []
        subject_ids = graph.get_subject_ids(site_filter=site_filter)

        for usubjid in subject_ids:
            ds_records = graph.get_subject_disposition(usubjid)
            for ds in ds_records:
                if ds.decod.upper() == "DISCONTINUED":
                    term_str = (ds.term or "").upper()
                    if reason_keyword:
                        kw = reason_keyword.upper()
                        if kw not in term_str and kw not in ds.decod.upper():
                            continue
                    ref = RecordRef(domain="DS", usubjid=usubjid, seq=ds.seq)
                    desc = f"Subject {usubjid} discontinued study on {ds.stdtc.iso} due to: {ds.term or ds.decod}."
                    findings.append((ds, ref, desc))
        return findings
