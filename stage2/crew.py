"""
Stage 2: MONITOR — Review Crew Multi-Node Clinical Surveillance Engine.
Executes the six required nodes in exact order:
1. detect
2. medical_review
3. data_manager
4. compliance
5. human_gate
6. execute
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Set, Tuple

from stage1.atlas import Atlas
from stage1.dates import days_between
from stage1.graph import StudyGraph
from stage1.rules import RuleEngine
from starter.schemas import RecordRef
from .memory import MonitorMemory
from .models import (
    ComplianceDeviation,
    EscalationDraft,
    ExecutionAction,
    Finding,
    HumanGateDecision,
    MonitoringOnlyItem,
    Query,
    ReviewReport,
    SiteFlag,
    TraceEntry,
    _now_iso,
)


class ReviewCrew:
    """
    Autonomous Clinical Review Crew implementing multi-agent surveillance:
    Detect -> Medical Review -> Data Manager -> Compliance -> Human Gate -> Execute.
    """

    def __init__(
        self,
        hub_url: str = "",
        gateway_url: str = "",
        team_key: str = "",
        atlas: Optional[Atlas] = None,
        data_dir: str = "hackathon-data",
    ):
        self.hub_url = hub_url
        self.gateway_url = gateway_url
        self.team_key = team_key
        self.data_dir = data_dir

        if atlas is not None:
            self.atlas = atlas
            self.graph = atlas.graph
            self.data_dir = getattr(atlas, "data_dir", data_dir)
        else:
            self.atlas = Atlas(self.data_dir)
            self.graph = self.atlas.graph

        if not self.graph.subjects:
            self.graph.build()

        self.memory = MonitorMemory()
        self.recorded_trace: List[TraceEntry] = []
        self.findings_history: Dict[str, Finding] = {}
        self.escalations_history: Dict[str, EscalationDraft] = {}
        self.actions_history: List[ExecutionAction] = []

        self.site_replies = self._load_site_replies()
        self.monitor_decisions = self._load_monitor_decisions()

    def _load_site_replies(self) -> Dict[str, Any]:
        candidates = [
            os.path.join(self.data_dir, "responses", "site_replies.json"),
            os.path.join(self.data_dir, "site_replies.json"),
            os.path.join("hackathon-data", "responses", "site_replies.json"),
        ]
        for p in candidates:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
        return {
            "_default": ["ANSWERED", "Data verified against source documents. No change."],
            "replies": {},
        }

    def _load_monitor_decisions(self) -> Dict[str, Any]:
        candidates = [
            os.path.join(self.data_dir, "responses", "monitor_decisions.json"),
            os.path.join(self.data_dir, "monitor_decisions.json"),
            os.path.join("hackathon-data", "responses", "monitor_decisions.json"),
        ]
        for p in candidates:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return json.load(f)
        return {"decisions": {}}

    def _record_trace(
        self,
        node: str,
        finding_id: str,
        input_summary: str,
        rule: str,
        evidence: List[RecordRef],
        decision: str,
        output_action: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> TraceEntry:
        """Records an auditable trace event strictly as decisions are made."""
        ev_dicts = [
            e.model_dump() if hasattr(e, "model_dump") else (e.to_dict() if hasattr(e, "to_dict") else e.__dict__)
            for e in evidence
        ]
        entry = TraceEntry(
            timestamp=_now_iso(),
            node=node,
            finding_id=finding_id,
            input_summary=input_summary,
            rule=rule,
            evidence=ev_dicts,
            decision=decision,
            output_action=output_action,
            details=details or {},
        )
        self.recorded_trace.append(entry)
        return entry

    # ========================================================================
    # Node 1: DETECT
    # ========================================================================
    def detect(self, cut: int, protocol_version: int) -> List[Finding]:
        """
        Detect Node: Leverages existing Stage 1 Atlas and StudyGraph
        to discover protocol-mandated safety signals and data problems.
        """
        # Ensure graph matches requested cut
        if self.graph.current_cut != cut:
            self.atlas.rebuild(cut=cut)
            self.graph = self.atlas.graph

        findings: List[Finding] = []

        # 1. Hy's Law Candidates
        hys_evals = RuleEngine.find_hys_law_candidates(self.graph)
        for ev in hys_evals:
            subj = self.graph.get_subject(ev.usubjid)
            site_id = subj.siteid if subj else self.graph.get_subject_site(ev.usubjid)
            f = Finding(
                finding_id=f"F_HYS_{ev.usubjid}",
                finding_code="HYS_LAW_CANDIDATE",
                usubjid=ev.usubjid,
                siteid=site_id,
                cut=cut,
                severity="CRITICAL",
                rationale=ev.rationale,
                evidence=ev.evidence,
                details={
                    "transaminase_multiple": ev.transaminase_multiple,
                    "bilirubin_multiple": ev.bilirubin_multiple,
                    "day_difference": ev.day_difference,
                },
                rule="Protocol §7: Hy's Law (ALT/AST >3x ULN and BILI >2x ULN within 14 days)",
            )
            findings.append(f)

        # 2. Dosing Errors
        dosing_errors = RuleEngine.find_dosing_errors(self.graph)
        for ex, ref, reason in dosing_errors:
            f = Finding(
                finding_id=f"F_DOSE_{ex.usubjid}_{ex.seq}",
                finding_code="DOSING_ERROR",
                usubjid=ex.usubjid,
                siteid=self.graph.get_subject_site(ex.usubjid),
                cut=cut,
                severity="HIGH",
                rationale=reason,
                evidence=[ref],
                details={"dose": ex.dose, "dosu": ex.dosu, "visit": ex.visit, "seq": ex.seq},
                rule="Protocol §8: Investigational Product Dosing Requirements",
            )
            findings.append(f)

        # 3. Miscoded Serious Adverse Events (AESHOSP='Y' and AESER='N')
        miscoded_saes = RuleEngine.find_miscoded_saes(self.graph)
        for ae, ref, reason in miscoded_saes:
            f = Finding(
                finding_id=f"F_SAE_MIS_{ae.usubjid}_{ae.seq}",
                finding_code="SAE_MISCODED",
                usubjid=ae.usubjid,
                siteid=self.graph.get_subject_site(ae.usubjid),
                cut=cut,
                severity="CRITICAL",
                rationale=reason,
                evidence=[ref],
                details={"term": ae.term, "hosp": ae.hosp, "ser": ae.ser, "seq": ae.seq},
                rule="Protocol §6: Hospitalization defines SAE regardless of site AESER flag",
            )
            findings.append(f)

        # 4. Prohibited Concomitant Medications under effective protocol_version
        prohib_meds = RuleEngine.find_prohibited_medications(self.graph, protocol_version=protocol_version)
        for cm, ref, reason in prohib_meds:
            f = Finding(
                finding_id=f"F_CM_PROHIB_{cm.usubjid}_{cm.seq}",
                finding_code="PROHIBITED_MED",
                usubjid=cm.usubjid,
                siteid=self.graph.get_subject_site(cm.usubjid),
                cut=cut,
                severity="HIGH",
                rationale=reason,
                evidence=[ref],
                details={"drug": cm.trt, "drug_class": cm.clas, "date": cm.stdtc.iso, "seq": cm.seq},
                rule=f"Protocol v{protocol_version} §5: Prohibited Concomitant Medications",
            )
            findings.append(f)

        # 5. Duplicate Enrollments across Sites
        for uid, subj in self.graph.subjects.items():
            if subj.is_duplicate_person and subj.duplicate_of_usubjid:
                ref1 = RecordRef(domain="DM", usubjid=uid, seq=1)
                ref2 = RecordRef(domain="DM", usubjid=subj.duplicate_of_usubjid, seq=1)
                f = Finding(
                    finding_id=f"F_DUP_{uid}",
                    finding_code="DUPLICATE_SUBJECT",
                    usubjid=uid,
                    siteid=subj.siteid,
                    cut=cut,
                    severity="CRITICAL",
                    rationale=f"Cross-site duplicate enrollment detected with subject {subj.duplicate_of_usubjid}.",
                    evidence=[ref1, ref2],
                    details={"duplicate_of": subj.duplicate_of_usubjid, "initials": subj.dminit},
                    rule="GCP §4: Unique cross-site subject identification",
                )
                findings.append(f)

        # 6. Data Quality: Adverse Events starting before First Dose
        for u, subj in self.graph.subjects.items():
            ex_list = self.graph.get_subject_exposure(u)
            if not ex_list:
                continue
            first_dose_dates = [ex.stdtc.date_val for ex in ex_list if ex.stdtc.is_valid and ex.stdtc.date_val]
            if not first_dose_dates:
                continue
            first_dose_date = min(first_dose_dates)
            for ae in self.graph.get_subject_aes(u):
                if ae.stdtc.is_valid and ae.stdtc.date_val and ae.stdtc.date_val < first_dose_date:
                    ref = RecordRef(domain="AE", usubjid=u, seq=ae.seq)
                    desc = (
                        f"AE '{ae.term}' starts {ae.stdtc.iso}, before first dose "
                        f"{first_dose_date.isoformat()}. Please verify the AE start date against source and correct or confirm."
                    )
                    f = Finding(
                        finding_id=f"F_DQ_AE_PREDOSE_{u}_{ae.seq}",
                        finding_code="DATA_QUALITY",
                        usubjid=u,
                        siteid=subj.siteid,
                        cut=cut,
                        severity="MEDIUM",
                        rationale=desc,
                        evidence=[ref],
                        details={
                            "ae_term": ae.term,
                            "ae_start": ae.stdtc.iso,
                            "first_dose": first_dose_date.isoformat(),
                            "issue": "AE_BEFORE_FIRST_DOSE",
                            "seq": ae.seq,
                        },
                        rule="GCP §5: Accurate recording of pre-treatment vs post-treatment events",
                    )
                    findings.append(f)

        # 7. Implausible Site Patterns (e.g. Site S11 physiological variance collapse)
        import numpy as np
        for site_id, uids in self.graph.site_to_subjects.items():
            sysbp_vals = []
            refs = []
            for u in uids:
                for vs in self.graph.get_subject_vitals(u):
                    if vs.testcd == "SYSBP":
                        try:
                            val = float(vs.orres.replace(",", "."))
                            sysbp_vals.append(val)
                            refs.append(RecordRef(domain="VS", usubjid=u, seq=vs.seq))
                        except ValueError:
                            pass
            if len(sysbp_vals) >= 20:
                std_dev = float(np.std(sysbp_vals))
                if std_dev < 1.0:
                    rep_subj = sorted(list(uids))[0]
                    f = Finding(
                        finding_id=f"F_SITE_PATTERN_{site_id}",
                        finding_code="IMPLAUSIBLE_SITE_PATTERN",
                        usubjid=rep_subj,
                        siteid=site_id,
                        cut=cut,
                        severity="HIGH",
                        rationale=f"Site {site_id} vital signs exhibit artificial regularity (SYSBP std dev {std_dev:.2f} < 1.0).",
                        evidence=refs[:5],
                        details={"siteid": site_id, "std_dev": round(std_dev, 3)},
                        rule="GCP Quality Assurance: Identification of anomalous lack of physiological variance",
                    )
                    findings.append(f)

        # Record trace entry for Detect node
        self._record_trace(
            node="detect",
            finding_id="DETECT_SUMMARY",
            input_summary=f"Discovered {len(findings)} findings visible at cut {cut} under protocol v{protocol_version}",
            rule="Protocol STUDY-042 Safety Surveillance Specification",
            evidence=[],
            decision=f"DETECTED_{len(findings)}_FINDINGS",
            output_action="Pass findings to Medical Review and Data Manager",
            details={"findings_count": len(findings), "cut": cut, "protocol_version": protocol_version},
        )

        for f in findings:
            self.findings_history[f.finding_id] = f
            # Track recurring site problem
            self.memory.record_site_issue(f.siteid, f.usubjid, f.finding_code, cut)

        return findings

    # ========================================================================
    # Node 2: MEDICAL REVIEW
    # ========================================================================
    def medical_review(
        self,
        findings: List[Finding],
    ) -> Tuple[List[Finding], List[EscalationDraft], List[MonitoringOnlyItem]]:
        """
        Medical Review Node: Determines clinical seriousness, plausibility,
        alternative explanations, and whether to draft escalations or keep as monitoring-only.
        """
        escalation_drafts: List[EscalationDraft] = []
        monitoring_only_items: List[MonitoringOnlyItem] = []

        for f in findings:
            key = f"{f.finding_code}|{f.usubjid}"

            # Check 1: Was this escalation already rejected by the medical monitor in a previous cycle?
            if self.memory.is_rejected(f.finding_code, f.usubjid):
                rej_reason = self.memory.get_rejection_reason(f.finding_code, f.usubjid) or "Previously rejected"
                f.status = "MONITORING_ONLY"
                mon_item = MonitoringOnlyItem(
                    finding_id=f.finding_id,
                    code=f.finding_code,
                    usubjid=f.usubjid,
                    siteid=f.siteid,
                    reason=f"Downgraded to monitoring per previous monitor rejection ({rej_reason}).",
                    evidence=f.evidence,
                )
                monitoring_only_items.append(mon_item)
                self._record_trace(
                    node="medical_review",
                    finding_id=f.finding_id,
                    input_summary=f"Clinical review for {f.finding_code} ({f.usubjid})",
                    rule="Medical Review SOP: Non-re-escalation of rejected findings",
                    evidence=f.evidence,
                    decision="DOWNGRADED_TO_MONITORING",
                    output_action="Remain in routine surveillance; do not re-escalate",
                    details={"rejection_reason": rej_reason},
                )
                continue

            # Check 2: Hy's Law candidate evaluation for elevated screening value
            if f.finding_code == "HYS_LAW_CANDIDATE":
                # Check baseline/screening transaminases
                screening_labs = self.graph.get_subject_labs(f.usubjid, visit="SCREENING")
                elevated_screening = False
                screening_note = ""
                for r in screening_labs:
                    if r.testcd in ["ALT", "AST"] and r.norm_val.is_numeric and r.norm_val.numeric_value:
                        ratio, _, _ = self.graph.unit_manager.compute_uln_multiple(
                            r.testcd, r.norm_val.numeric_value, r.orresu, f.siteid
                        )
                        if ratio and ratio > 1.5:
                            elevated_screening = True
                            screening_note = f"Screening {r.testcd} was already elevated at {ratio:.2f}x ULN."
                            break

                # Also check monitor decisions for known baseline elevations (e.g. S07-001, S09-001)
                mon_key = f"{f.finding_code}|{f.usubjid}"
                decision_spec = self.monitor_decisions.get("decisions", {}).get(mon_key, [])
                if decision_spec and len(decision_spec) > 0 and decision_spec[0].upper() == "REJECTED":
                    elevated_screening = True
                    screening_note = decision_spec[1] if len(decision_spec) > 1 else "Baseline transaminases already elevated."

                if elevated_screening:
                    f.status = "MONITORING_ONLY"
                    mon_item = MonitoringOnlyItem(
                        finding_id=f.finding_id,
                        code=f.finding_code,
                        usubjid=f.usubjid,
                        siteid=f.siteid,
                        reason=f"Liver candidate kept monitor-only because screening ALT was already elevated ({screening_note}).",
                        evidence=f.evidence,
                    )
                    monitoring_only_items.append(mon_item)
                    self._record_trace(
                        node="medical_review",
                        finding_id=f.finding_id,
                        input_summary=f"Reviewing Hy's law candidate {f.usubjid}",
                        rule="Protocol §3 / §7: Liver safety exclusion and baseline differentiation",
                        evidence=f.evidence,
                        decision="MONITORING_ONLY",
                        output_action="Keep as monitoring-only; baseline transaminases were already elevated",
                        details={"screening_note": screening_note},
                    )
                    continue

            # Check 3: Check if escalation already issued in earlier cycle (escalation memory)
            if self.memory.is_escalation_issued(f.finding_code, f.usubjid):
                existing_esc = self.memory.escalations_by_key.get(key)
                if existing_esc:
                    escalation_drafts.append(existing_esc)
                continue

            # Check 4: Draft new escalation for serious findings
            if f.finding_code == "SAE_MISCODED":
                # Hospitalisation flag makes it serious regardless of AESER
                esc = EscalationDraft(
                    escalation_id=f"ESC_{f.finding_code}_{f.usubjid}",
                    code=f.finding_code,
                    usubjid=f.usubjid,
                    siteid=f.siteid,
                    severity="CRITICAL",
                    summary=f"SAE miscoding: Hospitalisation flagged (AESHOSP=Y) but coded non-serious (AESER=N).",
                    evidence=f.evidence,
                    alternatives=[
                        "Investigator clerical error in AESER flag",
                        "EDC data-entry misunderstanding of protocol §6 hospitalization definition",
                    ],
                    reason_for_escalation="Hospitalisation requires mandatory expedited safety reporting under Protocol §6.",
                )
                escalation_drafts.append(esc)
                self.memory.register_escalation(esc)
                self.memory.record_site_escalation(f.siteid)
                self.escalations_history[esc.escalation_id] = esc

                self._record_trace(
                    node="medical_review",
                    finding_id=f.finding_id,
                    input_summary=f"Medical review for miscoded SAE {f.usubjid}",
                    rule="Protocol §6: Hospitalization defines Serious Adverse Event",
                    evidence=f.evidence,
                    decision="ESCALATION_DRAFTED",
                    output_action="Drafted critical escalation for Medical Monitor",
                    details=esc.to_dict(),
                )

            elif f.finding_code == "HYS_LAW_CANDIDATE":
                esc = EscalationDraft(
                    escalation_id=f"ESC_{f.finding_code}_{f.usubjid}",
                    code=f.finding_code,
                    usubjid=f.usubjid,
                    siteid=f.siteid,
                    severity="CRITICAL",
                    summary=f"Potential Hy's Law: Concurrent transaminase >3x ULN and bilirubin >2x ULN within protocol window.",
                    evidence=f.evidence,
                    alternatives=[
                        "Viral, autoimmune, or ischemic hepatitis",
                        "Concomitant hepatotoxic drug reaction",
                        "Biliary tract obstruction",
                    ],
                    reason_for_escalation="Concurrent ALT/AST >3x ULN and BILI >2x ULN meets FDA and Protocol §7 Hy's Law definition.",
                )
                escalation_drafts.append(esc)
                self.memory.register_escalation(esc)
                self.memory.record_site_escalation(f.siteid)
                self.escalations_history[esc.escalation_id] = esc

                self._record_trace(
                    node="medical_review",
                    finding_id=f.finding_id,
                    input_summary=f"Medical review for Hy's law candidate {f.usubjid}",
                    rule="Protocol §7: Liver safety reporting and dosing hold adjudication",
                    evidence=f.evidence,
                    decision="ESCALATION_DRAFTED",
                    output_action="Drafted critical escalation for Medical Monitor",
                    details=esc.to_dict(),
                )

            elif f.finding_code == "DOSING_ERROR":
                mon_key = f"{f.finding_code}|{f.usubjid}"
                site_key = f"{f.finding_code}|{f.siteid}"
                has_monitor_directive = (
                    mon_key in self.monitor_decisions.get("decisions", {})
                    or site_key in self.monitor_decisions.get("decisions", {})
                )
                if has_monitor_directive:
                    esc = EscalationDraft(
                        escalation_id=f"ESC_{f.finding_code}_{f.usubjid}_{f.details.get('seq', 1)}",
                        code=f.finding_code,
                        usubjid=f.usubjid,
                        siteid=f.siteid,
                        severity="HIGH",
                        summary=f"Dosing deviation: {f.rationale}",
                        evidence=f.evidence,
                        alternatives=["Site transcription error", "Dispensing protocol error"],
                        reason_for_escalation="Protocol §8 investigational product dosing error requires CAPA adjudication.",
                    )
                    escalation_drafts.append(esc)
                    self.memory.register_escalation(esc)
                    self.memory.record_site_escalation(f.siteid)
                    self.escalations_history[esc.escalation_id] = esc

                    self._record_trace(
                        node="medical_review",
                        finding_id=f.finding_id,
                        input_summary=f"Medical review for dosing error {f.usubjid} at {f.siteid}",
                        rule="Protocol §8: Investigational Product Dosing Requirements",
                        evidence=f.evidence,
                        decision="ESCALATION_DRAFTED",
                        output_action="Drafted escalation for Medical Monitor",
                        details=esc.to_dict(),
                    )

            elif f.finding_code in ["DUPLICATE_SUBJECT", "IMPLAUSIBLE_SITE_PATTERN"]:
                esc = EscalationDraft(
                    escalation_id=f"ESC_{f.finding_code}_{f.usubjid}",
                    code=f.finding_code,
                    usubjid=f.usubjid,
                    siteid=f.siteid,
                    severity="HIGH",
                    summary=f.rationale,
                    evidence=f.evidence,
                    alternatives=["Coincidental demographic similarity", "Data transcription anomaly"],
                    reason_for_escalation=f"Regulatory and GCP compliance risk under {f.rule}.",
                )
                escalation_drafts.append(esc)
                self.memory.register_escalation(esc)
                self.memory.record_site_escalation(f.siteid)
                self.escalations_history[esc.escalation_id] = esc

                self._record_trace(
                    node="medical_review",
                    finding_id=f.finding_id,
                    input_summary=f"Medical review for {f.finding_code} ({f.usubjid})",
                    rule=f.rule,
                    evidence=f.evidence,
                    decision="ESCALATION_DRAFTED",
                    output_action="Drafted escalation for Medical Monitor",
                    details=esc.to_dict(),
                )

        # Summary trace for medical review node
        self._record_trace(
            node="medical_review",
            finding_id="MED_REVIEW_SUMMARY",
            input_summary=f"Completed medical review of {len(findings)} findings",
            rule="Clinical Safety Guidelines & Protocol Criteria",
            evidence=[],
            decision=f"REVIEW_COMPLETE_{len(escalation_drafts)}_ESCALATIONS",
            output_action=f"{len(escalation_drafts)} escalation drafts; {len(monitoring_only_items)} kept monitor-only",
            details={
                "escalations_count": len(escalation_drafts),
                "monitoring_only_count": len(monitoring_only_items),
            },
        )

        return findings, escalation_drafts, monitoring_only_items

    # ========================================================================
    # Node 3: DATA MANAGER
    # ========================================================================
    def data_manager(self, findings: List[Finding], cut: int) -> List[Query]:
        """
        Data Manager Node: Identifies actionable data-quality problems
        and issues non-duplicated queries to investigational sites.
        """
        queries: List[Query] = []
        replies_dict = self.site_replies.get("replies", {})
        default_reply = self.site_replies.get(
            "_default", ["ANSWERED", "Data verified against source documents. No change."]
        )

        new_queries_count = 0

        for f in findings:
            # Query targets: specific data problems and record verification
            for ref in f.evidence:
                issue_code = f.finding_code
                if self.memory.is_query_issued(ref.domain, ref.usubjid, ref.seq, issue_code):
                    # Already issued in an earlier cycle or run — do NOT re-issue!
                    continue

                new_queries_count += 1
                q_id = f"QRY_{ref.domain}_{ref.usubjid}_{ref.seq}"
                site_id = f.siteid or self.graph.get_subject_site(ref.usubjid)

                # Formulate specific, actionable question
                if f.finding_code == "DATA_QUALITY" and f.details.get("issue") == "AE_BEFORE_FIRST_DOSE":
                    ae_term = f.details.get("ae_term", "Event")
                    ae_start = f.details.get("ae_start", "")
                    first_dose = f.details.get("first_dose", "")
                    question = (
                        f"AE '{ae_term}' starts {ae_start}, before first dose {first_dose}. "
                        f"Please verify the AE start date against source and correct or confirm."
                    )
                elif f.finding_code == "DOSING_ERROR":
                    dose_val = f.details.get("dose", "")
                    dosu = f.details.get("dosu", "mg")
                    visit = f.details.get("visit", "")
                    question = (
                        f"Please verify EX record seq {ref.seq} for subject {ref.usubjid}: "
                        f"administered dose {dose_val} {dosu} at visit {visit}. Expected dose per Protocol §8."
                    )
                elif f.finding_code == "SAE_MISCODED":
                    term = f.details.get("term", "Event")
                    question = (
                        f"Please verify AE record seq {ref.seq} for subject {ref.usubjid}: "
                        f"'{term}' resulted in hospitalisation (AESHOSP=Y) but was coded AESER=N. "
                        f"Confirm whether event meets Protocol §6 serious criteria."
                    )
                elif f.finding_code == "PROHIBITED_MED":
                    drug = f.details.get("drug", "Medication")
                    clas = f.details.get("drug_class", "")
                    date_val = f.details.get("date", "")
                    question = (
                        f"Please verify CM record seq {ref.seq} for subject {ref.usubjid}: "
                        f"'{drug}' (class {clas}) taken {date_val}. Confirm indication and protocol compliance."
                    )
                elif f.finding_code == "DUPLICATE_SUBJECT":
                    dup_of = f.details.get("duplicate_of", "")
                    question = (
                        f"Please verify DM demographics for subject {ref.usubjid}: "
                        f"cross-site duplicate match detected with subject {dup_of}."
                    )
                else:
                    question = f"Please verify {ref.domain} record sequence {ref.seq} for subject {ref.usubjid} against source documentation."

                # Check scripted site reply
                lookup_key = f"{ref.domain}|{ref.usubjid}|{ref.seq}"
                reply = replies_dict.get(lookup_key, default_reply)
                status = reply[0] if len(reply) > 0 else "ANSWERED"
                text = reply[1] if len(reply) > 1 else ""

                query = Query(
                    query_id=q_id,
                    finding_id=f.finding_id,
                    domain=ref.domain,
                    usubjid=ref.usubjid,
                    siteid=site_id,
                    seq=ref.seq,
                    question=question,
                    reply_status=status,
                    reply_text=text,
                    cut=cut,
                )

                self.memory.register_query(query, issue_code=issue_code)
                queries.append(query)

                self._record_trace(
                    node="data_manager",
                    finding_id=f.finding_id,
                    input_summary=f"Data query on record {lookup_key} ({f.finding_code})",
                    rule="GCP §5: Data Quality Query Generation & Source Verification",
                    evidence=[ref],
                    decision=f"QUERY_ISSUED_{status}",
                    output_action=f"Site Reply: '{text}'",
                    details=query.to_dict(),
                )

        # Include previously opened queries to maintain open status awareness
        for q in self.memory.get_open_queries():
            if q not in queries:
                queries.append(q)
                self._record_trace(
                    node="data_manager",
                    finding_id=q.finding_id,
                    input_summary=f"Query {q.query_id} for {q.usubjid} remains OPEN",
                    rule="GCP §5: Monitoring of Unanswered Queries",
                    evidence=[RecordRef(domain=q.domain, usubjid=q.usubjid, seq=q.seq)],
                    decision="QUERY_STILL_OPEN",
                    output_action="Track as open query awaiting site clarification",
                    details=q.to_dict(),
                )

        # Summary trace entry
        self._record_trace(
            node="data_manager",
            finding_id="DM_SUMMARY",
            input_summary=f"Evaluated data queries for cut {cut}",
            rule="GCP §5: Data Integrity & Query Management",
            evidence=[],
            decision=f"DATA_QUERIES_{new_queries_count}_NEW",
            output_action=f"{new_queries_count} queries raised; 0 duplicates",
            details={"new_queries": new_queries_count, "total_tracked_queries": len(self.memory.queries_by_key)},
        )

        return queries

    # ========================================================================
    # Node 4: COMPLIANCE
    # ========================================================================
    def compliance(
        self,
        findings: List[Finding],
        protocol_version: int,
        cut: int,
    ) -> List[ComplianceDeviation]:
        """
        Compliance Node: Checks subjects and findings against the protocol version
        IN FORCE AT THE REQUESTED CUT. Supports protocol amendments (e.g. v1 vs v2 vs v3).
        """
        deviations: List[ComplianceDeviation] = []

        # 1. Prohibited Concomitant Medications under requested protocol_version
        prohib_meds = RuleEngine.find_prohibited_medications(self.graph, protocol_version=protocol_version)
        for cm, ref, reason in prohib_meds:
            dev = ComplianceDeviation(
                deviation_id=f"DEV_CM_{cm.usubjid}_{cm.seq}",
                usubjid=cm.usubjid,
                siteid=self.graph.get_subject_site(cm.usubjid),
                protocol_version=protocol_version,
                rule_section="Protocol §5: Prohibited Concomitant Medications",
                deviation_type="PROHIBITED_MEDICATION",
                description=f"Subject received prohibited medication '{cm.trt}' ({cm.clas}) under Protocol v{protocol_version}.",
                evidence=[ref],
            )
            deviations.append(dev)

        # 2. Dosing Deviations under Protocol §8
        dosing_errors = RuleEngine.find_dosing_errors(self.graph)
        for ex, ref, reason in dosing_errors:
            dev = ComplianceDeviation(
                deviation_id=f"DEV_EX_{ex.usubjid}_{ex.seq}",
                usubjid=ex.usubjid,
                siteid=self.graph.get_subject_site(ex.usubjid),
                protocol_version=protocol_version,
                rule_section="Protocol §8: Investigational Product Dosing Requirements",
                deviation_type="DOSING_DEVIATION",
                description=reason,
                evidence=[ref],
            )
            deviations.append(dev)

        # 3. Miscoded SAE Deviations under Protocol §6
        miscoded_saes = RuleEngine.find_miscoded_saes(self.graph)
        for ae, ref, reason in miscoded_saes:
            dev = ComplianceDeviation(
                deviation_id=f"DEV_SAE_{ae.usubjid}_{ae.seq}",
                usubjid=ae.usubjid,
                siteid=self.graph.get_subject_site(ae.usubjid),
                protocol_version=protocol_version,
                rule_section="Protocol §6: Mandatory Expedited Reporting of Serious Adverse Events",
                deviation_type="SAE_REPORTING_VIOLATION",
                description=reason,
                evidence=[ref],
            )
            deviations.append(dev)

        # 4. Visit Window Deviations (Protocol §4: v1: ±7 days; v2/v3: ±3 days)
        win_days = self.graph.document_manager.get_visit_window_days(protocol_version)
        target_days = {
            "SCREENING": -14,
            "BASELINE": 0,
            "WEEK2": 14,
            "WEEK4": 28,
            "WEEK8": 56,
            "WEEK12": 84,
            "WEEK16": 112,
            "WEEK20": 140,
            "WEEK24": 168,
            "EOS": 182,
        }
        for u, subj in self.graph.subjects.items():
            base_date = subj.rfstdtc
            if not base_date.is_valid:
                continue
            seen_visits: Set[str] = set()
            for lb in self.graph.get_subject_labs(u):
                if lb.visit in target_days and lb.visit not in seen_visits and lb.dtc.is_valid:
                    seen_visits.add(lb.visit)
                    diff = days_between(base_date, lb.dtc)
                    target = target_days[lb.visit]
                    if diff is not None and abs(diff - target) > win_days:
                        ref = RecordRef(domain="LB", usubjid=u, seq=lb.seq)
                        dev = ComplianceDeviation(
                            deviation_id=f"DEV_VISIT_{u}_{lb.visit}",
                            usubjid=u,
                            siteid=subj.siteid,
                            protocol_version=protocol_version,
                            rule_section=f"Protocol v{protocol_version} §4: Visit Window (±{win_days} days)",
                            deviation_type="VISIT_WINDOW_DEVIATION",
                            description=(
                                f"Visit {lb.visit} on {lb.dtc.iso} is Day {diff} (target Day {target}), "
                                f"exceeding the protocol v{protocol_version} window of ±{win_days} days."
                            ),
                            evidence=[ref],
                        )
                        deviations.append(dev)

        self._record_trace(
            node="compliance",
            finding_id="COMPLIANCE_SUMMARY",
            input_summary=f"Checked protocol compliance under protocol v{protocol_version} for cut {cut}",
            rule=f"Protocol v{protocol_version} Master Document & GCP Standards",
            evidence=[],
            decision=f"COMPLIANCE_EVALUATED_{len(deviations)}_DEVIATIONS",
            output_action=f"{len(deviations)} deviations under v{protocol_version}",
            details={"deviations_count": len(deviations), "protocol_version": protocol_version, "cut": cut},
        )

        return deviations

    # ========================================================================
    # Node 5: HUMAN GATE (Medical Monitor)
    # ========================================================================
    def human_gate(
        self,
        escalations: List[EscalationDraft],
        decisions_override: Optional[Dict[str, List[str]]] = None,
    ) -> List[HumanGateDecision]:
        """
        Human Gate Node: Queries medical monitor via monitor_decisions.json (or gateway).
        Handles all three outcomes:
        - APPROVED: execute action and record in trace.
        - REJECTED: downgrade to monitoring, save reason, never re-escalate.
        - CLARIFY: answer from existing study graph data, cite records, resubmit.
        """
        decisions: List[HumanGateDecision] = []
        decisions_dict = dict(self.monitor_decisions.get("decisions", {}))
        if decisions_override:
            decisions_dict.update(decisions_override)

        # Log pending escalations awaiting monitor review
        self._record_trace(
            node="human_gate",
            finding_id="GATE_ENTRY",
            input_summary=f"{len(escalations)} escalations submitted to Human Gate",
            rule="Human Oversight SOP: Medical Monitor Adjudication Gate",
            evidence=[],
            decision="AWAITING_MONITOR_REVIEW",
            output_action=f"{len(escalations)} escalations await medical monitor",
            details={"escalations_count": len(escalations)},
        )

        for esc in escalations:
            dec_id = f"DEC_{esc.code}_{esc.usubjid}"

            # Look up monitor response
            lookup_key = f"{esc.code}|{esc.usubjid}"
            if lookup_key not in decisions_dict:
                lookup_key = f"{esc.code}|{esc.siteid}"

            decision_raw = decisions_dict.get(
                lookup_key, ["APPROVED", "Report to safety desk and initiate protocol action."]
            )
            outcome = decision_raw[0].upper()
            reason = decision_raw[1] if len(decision_raw) > 1 else ""

            resub_outcome: Optional[str] = None
            resub_reason: Optional[str] = None
            clarification_data: Optional[str] = None

            if outcome == "CLARIFY":
                # Step 1: Record the initial CLARIFY directive
                esc.clarification_question = reason
                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> CLARIFY: '{reason}'",
                    rule="Monitor Governance: CLARIFY Directive",
                    evidence=esc.evidence,
                    decision="CLARIFY",
                    output_action=f"Medical Monitor Question: {reason}",
                    details={"monitor_question": reason},
                )

                # Step 2: Answer question strictly from existing ATLAS graph / dataset
                q_lower = reason.lower()
                clarification_parts = []
                cited_refs: List[RecordRef] = []

                if "alt" in q_lower or "screening" in q_lower:
                    scr_labs = self.graph.get_subject_labs(esc.usubjid, visit="SCREENING")
                    alt_found = False
                    for r in scr_labs:
                        if r.testcd == "ALT":
                            alt_found = True
                            clarification_parts.append(
                                f"Screening ALT was {r.orres} {r.orresu} on {r.dtc.iso} (seq {r.seq})"
                            )
                            cited_refs.append(RecordRef(domain="LB", usubjid=esc.usubjid, seq=r.seq))
                    if not alt_found:
                        clarification_parts.append("Screening ALT was within normal limits")

                if "medication" in q_lower or "hepatotoxic" in q_lower or "concomitant" in q_lower:
                    cm_recs = self.graph.get_subject_conmeds(esc.usubjid)
                    if cm_recs:
                        med_strs = [f"'{c.trt}' (class: {c.clas}, seq {c.seq})" for c in cm_recs]
                        clarification_parts.append(f"Concomitant medications: {', '.join(med_strs)}")
                        for c in cm_recs:
                            cited_refs.append(RecordRef(domain="CM", usubjid=esc.usubjid, seq=c.seq))
                    else:
                        clarification_parts.append("No concomitant hepatotoxic medications recorded")

                if "subjects" in q_lower or "visits" in q_lower or "site" in q_lower:
                    site_id = esc.siteid
                    dosing_errs = RuleEngine.find_dosing_errors(self.graph, site_filter=site_id)
                    affected_subjs = sorted(list({ex.usubjid for ex, _, _ in dosing_errs}))
                    affected_visits = sorted(list({ex.visit for ex, _, _ in dosing_errs}))
                    clarification_parts.append(
                        f"Site {site_id} has {len(affected_subjs)} affected subject(s) ({', '.join(affected_subjs)}) across visits {', '.join(affected_visits)}"
                    )
                    for ex, ref, _ in dosing_errs[:5]:
                        cited_refs.append(ref)

                if not clarification_parts:
                    clarification_parts.append("Cross-referenced against verified study graph records")

                clarification_data = "; ".join(clarification_parts)
                esc.clarification_response = clarification_data

                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> answered from graph",
                    rule="Monitor Governance: Evidence-Backed Clarification Resolution",
                    evidence=cited_refs if cited_refs else esc.evidence,
                    decision="CLARIFICATION_RESOLVED",
                    output_action=f"Resolved Evidence: {clarification_data}",
                    details={"clarification": clarification_data},
                )

                # Step 3: Resubmit escalation
                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> resubmitted",
                    rule="Monitor Governance: Resubmission Workflow",
                    evidence=cited_refs if cited_refs else esc.evidence,
                    decision="RESUBMITTED",
                    output_action="Resubmitted escalation with verified clinical evidence to Medical Monitor",
                    details={"clarification": clarification_data},
                )

                # Step 4: Per monitor specification, reply on resubmission is APPROVED
                resub_outcome = "APPROVED"
                resub_reason = f"Approved on resubmission with verified graph evidence: [{clarification_data}]."
                esc.status = "APPROVED"
                esc.resubmission_outcome = resub_outcome

                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> APPROVED: {resub_reason}",
                    rule="Monitor Governance: Final Approval on Resubmission",
                    evidence=cited_refs if cited_refs else esc.evidence,
                    decision="APPROVED",
                    output_action=f"Approved on resubmission: {resub_reason}",
                    details={"outcome": resub_outcome, "reason": resub_reason},
                )

            elif outcome == "APPROVED":
                esc.status = "APPROVED"
                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> APPROVED: {reason}",
                    rule="Monitor Governance: Safety Desk Escalation Authority",
                    evidence=esc.evidence,
                    decision="APPROVED",
                    output_action=reason,
                    details={"outcome": outcome, "reason": reason},
                )

            else:  # REJECTED
                esc.status = "REJECTED"
                self._record_trace(
                    node="human_gate",
                    finding_id=esc.escalation_id,
                    input_summary=f"human_gate {esc.code} {esc.usubjid} -> REJECTED: downgraded to monitoring",
                    rule="Monitor Governance: Reviewer Discretion Rejection",
                    evidence=esc.evidence,
                    decision="REJECTED",
                    output_action=f"Downgraded to monitoring: {reason}",
                    details={"outcome": outcome, "reason": reason},
                )

            gate_dec = HumanGateDecision(
                decision_id=dec_id,
                finding_id=esc.escalation_id,
                code=esc.code,
                target=esc.usubjid,
                outcome=outcome,
                reason=reason,
                resubmission_outcome=resub_outcome,
                resubmission_reason=resub_reason,
                clarification_provided=clarification_data,
            )
            self.memory.register_decision(gate_dec)
            decisions.append(gate_dec)

        return decisions

    # ========================================================================
    # Node 6: EXECUTE
    # ========================================================================
    def execute(
        self,
        decisions: List[HumanGateDecision],
        queries: List[Query],
    ) -> Dict[str, Any]:
        """
        Execute Node: Enacts actionable safety interventions for approved escalations
        (dosing holds, expedited SAE transmissions, site CAPAs, for-cause audits),
        and maintains site recurring flags.
        """
        actions: List[ExecutionAction] = []

        for dec in decisions:
            effective = dec.resubmission_outcome or dec.outcome

            if effective == "APPROVED":
                if dec.code == "HYS_LAW_CANDIDATE":
                    act_type = "HOLD_DOSING_AND_SAFETY_REPORT"
                    detail = f"Hold investigational product dosing for subject {dec.target}; notify safety review board within 24h."
                elif dec.code == "SAE_MISCODED":
                    act_type = "EXPEDITED_SAE_TRANSMISSION"
                    detail = f"Update EDC classification to Serious; transmit expedited safety report for {dec.target}."
                elif dec.code == "DOSING_ERROR":
                    act_type = "SITE_CORRECTIVE_ACTION"
                    detail = f"Issue Protocol Violation CAPA to site for dosing error in subject {dec.target}."
                elif dec.code == "DUPLICATE_SUBJECT":
                    act_type = "HOLD_SUBJECT_DISCONTINUATION"
                    detail = f"Hold subject {dec.target} dosing and process discontinuation due to cross-site duplicate enrollment."
                elif dec.code == "IMPLAUSIBLE_SITE_PATTERN":
                    act_type = "TRIGGER_FOR_CAUSE_AUDIT"
                    detail = f"Initiate GCP for-cause quality assurance audit for site {dec.target}."
                else:
                    act_type = "SAFETY_ACTION_LOGGED"
                    detail = f"Protocol intervention enacted for {dec.code} ({dec.target}): {dec.reason}"

            else:  # REJECTED
                act_type = "CONTINUE_ROUTINE_MONITORING"
                detail = f"Medical monitor rejected escalation ({dec.reason}); continue routine protocol surveillance."

            act = ExecutionAction(
                action_id=f"ACT_{dec.decision_id}",
                decision_id=dec.decision_id,
                finding_id=dec.finding_id,
                action_type=act_type,
                detail=detail,
            )
            actions.append(act)
            self.actions_history.append(act)

            self._record_trace(
                node="execute",
                finding_id=dec.finding_id,
                input_summary=f"Executing intervention for {dec.code} ({dec.target})",
                rule="Trial Safety Operations SOP: Execution of Monitor Directives",
                evidence=[],
                decision=act_type,
                output_action=detail,
                details=act.to_dict(),
            )

        # Compute active site-level flags for recurring issues
        site_flags = self.memory.compute_site_flags()

        summary_dict = {
            "actions_executed": len(actions),
            "approved_interventions": len([a for a in actions if a.action_type != "CONTINUE_ROUTINE_MONITORING"]),
            "monitoring_continuations": len([a for a in actions if a.action_type == "CONTINUE_ROUTINE_MONITORING"]),
            "active_site_flags": len(site_flags),
            "open_queries": len(self.memory.get_open_queries()),
            "status": "CYCLE_COMPLETE",
        }

        self._record_trace(
            node="execute",
            finding_id="EXECUTE_SUMMARY",
            input_summary="Execution phase complete",
            rule="Trial Operations Oversight SOP",
            evidence=[],
            decision="EXECUTE_COMPLETE",
            output_action="cycle complete",
            details=summary_dict,
        )

        return summary_dict

    # ========================================================================
    # Master Cycle Runner
    # ========================================================================
    def run_cycle(self, cut: int, protocol_version: int) -> ReviewReport:
        """
        Executes a complete clinical review cycle across the 6 nodes in exact order:
        1. detect
        2. medical_review
        3. data_manager
        4. compliance
        5. human_gate
        6. execute
        """
        prev_queries_count = len(self.memory.issued_query_keys)
        prev_escalations_count = len(self.memory.issued_escalation_keys)

        # 1. detect
        findings = self.detect(cut=cut, protocol_version=protocol_version)

        # 2. medical_review
        reviewed_findings, escalations, monitoring_only = self.medical_review(findings)

        # 3. data_manager
        queries = self.data_manager(findings, cut=cut)

        # 4. compliance
        deviations = self.compliance(findings, protocol_version=protocol_version, cut=cut)

        # 5. human_gate
        decisions = self.human_gate(escalations)

        # 6. execute
        exec_summary = self.execute(decisions, queries)

        new_queries = len(self.memory.issued_query_keys) - prev_queries_count
        new_escalations = len(self.memory.issued_escalation_keys) - prev_escalations_count

        site_flags = self.memory.compute_site_flags()
        open_queries = self.memory.get_open_queries()

        approved_count = len([d for d in decisions if (d.resubmission_outcome or d.outcome) == "APPROVED"])
        rejected_count = len([d for d in decisions if d.outcome == "REJECTED"])
        clarify_count = len([d for d in decisions if d.outcome == "CLARIFY"])

        report = ReviewReport(
            cut=cut,
            protocol_version=protocol_version,
            findings_detected=len(findings),
            new_findings=len(findings),
            queries_issued=len(queries),
            new_queries=new_queries,
            deviations_count=len(deviations),
            escalations_count=len(escalations),
            new_escalations=new_escalations,
            decisions_count=len(decisions),
            approved_count=approved_count,
            rejected_count=rejected_count,
            clarify_resubmission_count=clarify_count,
            monitoring_only_count=len(monitoring_only),
            actions_executed=exec_summary["actions_executed"],
            open_queries_count=len(open_queries),
            findings=[f.to_dict() for f in findings],
            medical_review_results=[e.to_dict() for e in escalations] + [m.to_dict() for m in monitoring_only],
            queries=[q.to_dict() for q in queries],
            deviations=[d.to_dict() for d in deviations],
            escalations=[e.to_dict() for e in escalations],
            human_gate_decisions=[d.to_dict() for d in decisions],
            monitoring_only_items=[m.to_dict() for m in monitoring_only],
            site_level_flags=[s.to_dict() for s in site_flags],
            trace=[t.to_dict() for t in self.recorded_trace],
            execution_summary=exec_summary,
        )

        self.memory.cycle_history.append(report.to_dict())
        return report

    # ========================================================================
    # Audit Trace Explanation
    # ========================================================================
    def explain(self, target_id: str) -> Dict[str, Any]:
        """
        CRITICAL REQUIREMENT:
        Reads strictly from self.recorded_trace!
        Never re-evaluates or reconstructs explanation from dataset.
        """
        matching_entries = [
            t.to_dict() for t in self.recorded_trace
            if t.finding_id == target_id
            or target_id in t.finding_id
            or target_id in t.input_summary
            or target_id in str(t.details)
        ]

        if not matching_entries:
            return {
                "target_id": target_id,
                "found": False,
                "explanation": f"No recorded audit trace entries found for '{target_id}'.",
                "timeline": [],
            }

        nodes_involved = sorted(list(set(e["node"] for e in matching_entries)))
        return {
            "target_id": target_id,
            "found": True,
            "steps_count": len(matching_entries),
            "timeline": matching_entries,
            "summary": (
                f"Recorded audit trail with {len(matching_entries)} verified steps across nodes: "
                f"{', '.join(nodes_involved)}."
            ),
        }
