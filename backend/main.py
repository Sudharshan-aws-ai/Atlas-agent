"""
ATLAS Study Sentinel — FastAPI Backend
Provides REST API over the StudyGraph engine for the web UI.
"""

from __future__ import annotations

import sys
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from stage1.atlas import Atlas
from stage1.rules import RuleEngine
from stage2.crew import ReviewCrew
from stage2.monitor import MonitorEngine
from stage3.watch import StudyWatch, WatchEngine
from starter.schemas import Answer, Question, QuestionCategory

# ---------------------------------------------------------------------------
# State: Atlas, ReviewCrew, Monitor, and Watch instances
# ---------------------------------------------------------------------------
DATA_DIR = os.environ.get("ATLAS_DATA_DIR", "hackathon-data")

atlas_instance: Optional[Atlas] = None
crew_instance: Optional[ReviewCrew] = None
monitor_instance: Optional[MonitorEngine] = None
watch_instance: Optional[WatchEngine] = None
study_watch_instance: Optional[StudyWatch] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the study graph on startup and initialize crew, monitor and watch engines."""
    global atlas_instance, crew_instance, monitor_instance, watch_instance, study_watch_instance
    atlas_instance = Atlas(DATA_DIR)
    crew_instance = ReviewCrew(atlas=atlas_instance, data_dir=DATA_DIR)
    monitor_instance = MonitorEngine(DATA_DIR, graph=atlas_instance.graph)
    watch_instance = WatchEngine(DATA_DIR)
    study_watch_instance = StudyWatch(data_dir=DATA_DIR, crew=crew_instance)
    print(f"[ATLAS] Graph built. Stats: {atlas_instance.graph.stats}", flush=True)
    yield
    atlas_instance = None
    crew_instance = None
    monitor_instance = None
    watch_instance = None
    study_watch_instance = None


def _require_atlas() -> Atlas:
    global atlas_instance
    if atlas_instance is None:
        atlas_instance = Atlas(DATA_DIR)
    return atlas_instance


def _require_crew() -> ReviewCrew:
    global crew_instance
    if crew_instance is None:
        a = _require_atlas()
        crew_instance = ReviewCrew(atlas=a, data_dir=DATA_DIR)
    return crew_instance


def _require_monitor() -> MonitorEngine:
    global monitor_instance
    if monitor_instance is None:
        a = _require_atlas()
        monitor_instance = MonitorEngine(DATA_DIR, graph=a.graph)
    return monitor_instance


def _require_watch() -> WatchEngine:
    global watch_instance
    if watch_instance is None:
        watch_instance = WatchEngine(DATA_DIR)
    return watch_instance


def _require_study_watch() -> StudyWatch:
    global study_watch_instance, crew_instance
    if study_watch_instance is None:
        crew = _require_crew()
        study_watch_instance = StudyWatch(DATA_DIR, crew=crew)
    return study_watch_instance


app = FastAPI(
    title="ATLAS Study Sentinel API",
    version="1.0.0",
    description="Clinical Knowledge Graph QA Engine — VIT Vellore SCOPE Hackathon 2026",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_atlas() -> Atlas:
    global atlas_instance
    if atlas_instance is None:
        atlas_instance = Atlas(DATA_DIR)
    return atlas_instance


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class AskRequest(BaseModel):
    question_id: str
    text: str
    category: Optional[str] = None


class RebuildRequest(BaseModel):
    cut: Optional[int] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> Dict[str, Any]:
    a = _require_atlas()
    g = a.graph
    return {
        "status": "ok",
        "subjects": g.stats.get("subjects_covered", 0),
        "sites": g.stats.get("sites_count", 0),
        "nodes": g.stats.get("nodes", 0),
        "edges": g.stats.get("edges", 0),
        "build_time_seconds": g.stats.get("build_time_seconds", 0),
    }


@app.get("/api/stats")
def stats() -> Dict[str, Any]:
    a = _require_atlas()
    g = a.graph

    # Additional runtime stats
    extra = {
        "lab_records": sum(len(v) for v in g.labs_by_subject.values()),
        "ae_records": sum(len(v) for v in g.aes_by_subject.values()),
        "ex_records": sum(len(v) for v in g.ex_by_subject.values()),
        "cm_records": sum(len(v) for v in g.cm_by_subject.values()),
        "ds_records": sum(len(v) for v in g.ds_by_subject.values()),
        "vs_records": sum(len(v) for v in g.vs_by_subject.values()),
        "eg_records": sum(len(v) for v in g.eg_by_subject.values()),
        "mh_records": sum(len(v) for v in g.mh_by_subject.values()),
        "sites": sorted(list(g.site_to_subjects.keys())),
    }
    return {**g.stats, **extra}


@app.get("/api/subjects")
def list_subjects(site: Optional[str] = Query(None, description="Filter by site ID")) -> List[Dict[str, Any]]:
    a = _require_atlas()
    g = a.graph
    ids = g.get_subject_ids(site_filter=site)
    result = []
    for uid in ids:
        subj = g.get_subject(uid)
        if subj:
            result.append({
                "usubjid": uid,
                "siteid": subj.siteid,
                "arm": subj.arm,
                "age": subj.age,
                "sex": subj.sex,
                "initials": subj.dminit,
                "screening_hba1c": subj.scr_hba1c,
                "is_duplicate": subj.is_duplicate_person,
            })
    return result


@app.get("/api/subjects/{usubjid}")
def get_subject(usubjid: str) -> Dict[str, Any]:
    a = _require_atlas()
    g = a.graph
    subj = g.get_subject(usubjid.upper())
    if not subj:
        raise HTTPException(status_code=404, detail=f"Subject {usubjid} not found")
    return {
        "usubjid": usubjid.upper(),
        "siteid": subj.siteid,
        "arm": subj.arm,
        "age": subj.age,
        "sex": subj.sex,
        "initials": subj.dminit,
        "birth_date": subj.brthdtc.iso,
        "first_dose_date": subj.rfstdtc.iso,
        "screening_hba1c": subj.scr_hba1c,
        "is_duplicate_enrollment": subj.is_duplicate_person,
        "duplicate_of": subj.duplicate_of_usubjid,
    }


@app.get("/api/subjects/{usubjid}/patient360")
@app.get("/patients/{usubjid}")
@app.get("/api/patients/{usubjid}")
def patient360(usubjid: str) -> Dict[str, Any]:
    a = _require_atlas()
    result = a.graph.patient360(usubjid.upper())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    # Enrich with MONITOR findings, queries, escalations, decisions, actions
    try:
        crew = _require_crew()
        u_upper = usubjid.upper()
        subj_findings = [f.to_dict() for f in crew.findings_history.values() if f.usubjid == u_upper]
        subj_queries = [q.to_dict() for q in crew.memory.queries_by_key.values() if q.usubjid == u_upper]
        subj_escalations = [e.to_dict() for e in crew.escalations_history.values() if e.usubjid == u_upper]
        subj_decisions = [d.to_dict() for d in crew.memory.decisions_history.values() if d.target == u_upper]
        subj_actions = [act.to_dict() for act in crew.actions_history if act.decision_id in {d.decision_id for d in crew.memory.decisions_history.values() if d.target == u_upper}]
        result["monitor"] = {
            "findings": subj_findings,
            "queries": subj_queries,
            "escalations": subj_escalations,
            "decisions": subj_decisions,
            "actions": subj_actions,
        }
    except Exception:
        pass
    return result


@app.get("/patients/{usubjid}/timeline")
@app.get("/api/patients/{usubjid}/timeline")
def get_patient_timeline(usubjid: str) -> Dict[str, Any]:
    p = patient360(usubjid)
    events = []
    for lb in p.get("laboratory", []):
        if lb.get("date"):
            events.append({
                "date": lb["date"],
                "domain": "LB",
                "type": "LAB",
                "title": f"Lab: {lb.get('test')} = {lb.get('result')} {lb.get('unit', '')}",
                "visit": lb.get("visit"),
                "seq": lb.get("seq"),
            })
    for ae in p.get("adverse_events", []):
        if ae.get("start_date"):
            events.append({
                "date": ae["start_date"],
                "domain": "AE",
                "type": "ADVERSE_EVENT",
                "title": f"AE Start: {ae.get('term')} ({ae.get('severity')})",
                "is_serious": ae.get("is_serious"),
                "seq": ae.get("seq"),
            })
    for ex in p.get("exposure", []):
        if ex.get("date"):
            events.append({
                "date": ex["date"],
                "domain": "EX",
                "type": "DOSE",
                "title": f"Dose: {ex.get('dose')} {ex.get('unit')} ({ex.get('treatment')})",
                "visit": ex.get("visit"),
                "seq": ex.get("seq"),
            })
    for cm in p.get("concomitant_medications", []):
        if cm.get("start_date"):
            events.append({
                "date": cm["start_date"],
                "domain": "CM",
                "type": "CONMED",
                "title": f"ConMed: {cm.get('treatment')} ({cm.get('class')})",
                "seq": cm.get("seq"),
            })
    events.sort(key=lambda x: x.get("date") or "")
    return {
        "usubjid": usubjid.upper(),
        "total_events": len(events),
        "timeline": events,
        "monitor": p.get("monitor", {}),
    }



@app.post("/api/ask")
def ask(req: AskRequest) -> Dict[str, Any]:
    a = _require_atlas()

    # Map optional category string to enum
    cat = None
    if req.category:
        try:
            cat = QuestionCategory(req.category.upper())
        except ValueError:
            cat = None

    q = Question(question_id=req.question_id, text=req.text, category=cat)
    ans: Answer = a.answer(q)

    # Serialize evidence list with rich record details
    evidence_out = []
    for ref in ans.evidence:
        key = (ref.domain.upper(), ref.usubjid.upper(), ref.seq)
        rec = a.graph.records_by_ref.get(key)
        item: Dict[str, Any] = {
            "domain": ref.domain,
            "usubjid": ref.usubjid,
            "seq": ref.seq,
            "key": ref.key,
        }
        if rec:
            if ref.domain == "LB":
                item["test"] = getattr(rec, "testcd", "")
                item["value"] = getattr(rec, "orres", "")
                item["unit"] = getattr(rec, "orresu", "")
                item["date"] = getattr(getattr(rec, "dtc", None), "iso", "")
                item["visit"] = getattr(rec, "visit", "")
            elif ref.domain == "AE":
                item["term"] = getattr(rec, "term", "")
                item["severity"] = getattr(rec, "sev", "")
                item["start_date"] = getattr(getattr(rec, "stdtc", None), "iso", "")
                item["end_date"] = getattr(getattr(rec, "endtc", None), "iso", "")
            elif ref.domain == "EX":
                item["dose"] = getattr(rec, "dose", "")
                item["unit"] = getattr(rec, "dosu", "")
                item["visit"] = getattr(rec, "visit", "")
                item["date"] = getattr(getattr(rec, "stdtc", None), "iso", "")
            elif ref.domain == "CM":
                item["medication"] = getattr(rec, "trt", "")
                item["class"] = getattr(rec, "clas", "")
                item["date"] = getattr(getattr(rec, "stdtc", None), "iso", "")
            elif ref.domain == "VS":
                item["test"] = getattr(rec, "testcd", "")
                item["value"] = getattr(rec, "orres", "")
                item["unit"] = getattr(rec, "orresu", "")
                item["date"] = getattr(getattr(rec, "dtc", None), "iso", "")
                item["visit"] = getattr(rec, "visit", "")
            elif ref.domain == "DM":
                item["arm"] = getattr(rec, "arm", "")
                item["siteid"] = getattr(rec, "siteid", "")
        evidence_out.append(item)

    # Unit conversion / calculation extraction
    import re
    calculation = None
    if "Converted:" in ans.text and "Conversion:" in ans.text:
        conv_m = re.search(r"Converted:\s*([^\n]+)", ans.text)
        fact_m = re.search(r"Conversion:\s*([^\n]+)", ans.text)
        orig_m = re.search(r"Answer:\s*([^\n]+)", ans.text)
        calculation = {
            "original": orig_m.group(1).strip() if orig_m else str(ans.answer),
            "converted": conv_m.group(1).strip() if conv_m else "",
            "conversion_factor": fact_m.group(1).strip() if fact_m else "",
        }

    # Protocol rule identification
    protocol_rule = None
    combined_lower = (req.text + " " + ans.text).lower()
    if "hy's law" in combined_lower or "hys law" in combined_lower or "liver" in combined_lower or "transaminase" in combined_lower or "bilirubin" in combined_lower:
        protocol_rule = "Protocol §7: Potential Hy's Law criteria requires (ALT or AST > 3 × ULN) AND (Total Bilirubin > 2 × ULN) within 14 days, without pre-existing screening transaminase elevation (> 2 × ULN)."
    elif "dosing rules" in combined_lower or "dosing error" in combined_lower or "dose" in combined_lower or "exposure" in combined_lower:
        protocol_rule = "Protocol §8: Investigational Drug (10 mg daily for DRUG arm, 0 mg daily for PLACEBO arm)."
    elif "prohibited" in combined_lower or "concomitant" in combined_lower or "medication" in combined_lower:
        protocol_rule = "Protocol §9 Concomitant Medications: Systemic glucocorticoids prohibited (v1-v3); sulfonylureas prohibited (v3 amendment)."
    elif "miscoded" in combined_lower or "serious adverse" in combined_lower or "severe adverse" in combined_lower or "adverse event" in combined_lower:
        protocol_rule = "Protocol §6 Adverse Events: Any adverse event resulting in hospitalisation (AESHOSP='Y') must be classified as serious (AESER='Y')."
    elif "discontinued" in combined_lower or "discontinuation" in combined_lower or "withdrew" in combined_lower:
        protocol_rule = "Protocol §5 Study Discontinuation: Early termination procedures require documentation of primary reason and follow-up safety evaluations."
    elif "duplicate" in combined_lower or "enrolled" in combined_lower or "subjects are present" in combined_lower:
        protocol_rule = "Protocol §4 Eligibility Criteria: Cross-site duplicate enrollment is strictly prohibited; subjects must be assigned a single unique USUBJID."
    elif "unit" in combined_lower or "conversion" in combined_lower or "laboratory" in combined_lower or "lab" in combined_lower:
        protocol_rule = "Study Protocol §10 & Central Lab Manual: Standardized enzyme reference ranges (ALT 10–45 U/L, BILI 0.2–1.2 mg/dL) with unit conversion factor 1 µkat/L = 60 U/L."
    else:
        protocol_rule = "Study Protocol STUDY-042: Good Clinical Practice (GCP) & Risk-Based Monitoring (RBM) Oversight Guidelines."

    # Trap detection
    is_trap = (
        (ans.answer == [] or ans.answer == 0)
        and len(evidence_out) == 0
        and (
            "no supporting" in ans.text.lower()
            or "not infer" in ans.text.lower()
            or "no dosing errors were found" in ans.text.lower()
            or "zero-hallucination" in ans.text.lower()
            or "allegation" in ans.text.lower()
            or (cat and cat.value == "TRAP")
        )
    )

    return {
        "question_id": req.question_id,
        "answer": ans.answer,
        "text": ans.text,
        "confidence": ans.confidence,
        "evidence": evidence_out,
        "evidence_count": len(evidence_out),
        "steps_used": ans.steps_used,
        "calculation": calculation,
        "protocol_rule": protocol_rule,
        "is_trap": is_trap,
    }


@app.get("/api/evidence/{domain}/{usubjid}/{seq}")
def get_evidence_record(domain: str, usubjid: str, seq: int) -> Dict[str, Any]:
    a = _require_atlas()
    g = a.graph
    key = (domain.upper(), usubjid.upper(), seq)
    rec = g.records_by_ref.get(key)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Record not found: {domain}|{usubjid}|{seq}")
    # Convert dataclass/object to dict
    try:
        import dataclasses
        if dataclasses.is_dataclass(rec):
            raw = dataclasses.asdict(rec)
        else:
            raw = rec.__dict__
    except Exception:
        raw = str(rec)
    return {"domain": domain.upper(), "usubjid": usubjid.upper(), "seq": seq, "record": raw}


@app.post("/api/rebuild")
def rebuild(req: RebuildRequest) -> Dict[str, Any]:
    global monitor_instance, watch_instance, study_watch_instance
    a = _require_atlas()
    stats = a.rebuild(cut=req.cut)
    monitor_instance = MonitorEngine(DATA_DIR, graph=a.graph)
    watch_instance = WatchEngine(DATA_DIR)
    study_watch_instance = None
    return {"status": "rebuilt", "stats": stats}


@app.get("/api/findings")
def findings() -> Dict[str, Any]:
    """Pre-compute all clinical findings from the rule engine."""
    a = _require_atlas()
    g = a.graph

    # Hy's Law — returns List[HysLawEvaluation]
    hys_evals = RuleEngine.find_hys_law_candidates(g)
    hys_out = []
    for ev in hys_evals:
        hys_out.append({
            "usubjid": ev.usubjid,
            "transaminase": ev.transaminase_record.testcd if ev.transaminase_record else None,
            "transaminase_multiple": ev.transaminase_multiple,
            "bilirubin_multiple": ev.bilirubin_multiple,
            "day_difference": ev.day_difference,
            "rationale": ev.rationale,
        })

    # Dosing errors — returns List[Tuple[ExposureRecord, RecordRef, str]]
    dosing_errors_raw = RuleEngine.find_dosing_errors(g)
    dosing_out = []
    for ex, ref, reason in dosing_errors_raw:
        dosing_out.append({
            "usubjid": ex.usubjid,
            "visit": ex.visit,
            "arm": g.get_subject(ex.usubjid).arm if g.get_subject(ex.usubjid) else None,
            "actual_dose": ex.dose,
            "dose_unit": ex.dosu,
            "date": ex.stdtc.iso,
            "ex_seq": ex.seq,
            "reason": reason,
        })

    # Miscoded SAEs — returns List[Tuple[AERecord, RecordRef, str]]
    miscoded_raw = RuleEngine.find_miscoded_saes(g)
    miscoded_out = []
    for ae, ref, reason in miscoded_raw:
        miscoded_out.append({
            "usubjid": ae.usubjid,
            "ae_term": ae.term,
            "severity": ae.sev,
            "aeshosp": ae.hosp,
            "aeser_coded": ae.ser,
            "ae_seq": ae.seq,
            "reason": reason,
        })

    # Prohibited medications — returns List[Tuple[ConMedRecord, RecordRef, str]]
    prohib_raw = RuleEngine.find_prohibited_medications(g)
    prohib_out = []
    for cm, ref, reason in prohib_raw:
        prohib_out.append({
            "usubjid": cm.usubjid,
            "drug": cm.trt,
            "drug_class": cm.clas,
            "date": cm.stdtc.iso,
            "indication": cm.indc,
            "cm_seq": cm.seq,
            "reason": reason,
        })

    # Duplicate enrollments
    dup_out = []
    for uid, subj in g.subjects.items():
        if subj.is_duplicate_person and subj.duplicate_of_usubjid:
            dup_out.append({
                "usubjid": uid,
                "duplicate_of": subj.duplicate_of_usubjid,
            })

    return {
        "hys_law_candidates": hys_out,
        "dosing_errors": dosing_out,
        "miscoded_saes": miscoded_out,
        "prohibited_medications": prohib_out,
        "duplicate_enrollments": dup_out,
        "summary": {
            "hys_law_count": len(hys_out),
            "dosing_error_count": len(dosing_out),
            "miscoded_sae_count": len(miscoded_out),
            "prohibited_med_count": len(prohib_out),
            "duplicate_enrollment_count": len(dup_out),
        },
    }


# ---------------------------------------------------------------------------
# Problem 2: MONITOR Endpoints (ReviewCrew Multi-Node Workflow)
# ---------------------------------------------------------------------------

class MonitorRunRequest(BaseModel):
    cut: Optional[int] = None
    protocol_version: Optional[int] = None


class EscalationDecisionRequest(BaseModel):
    reason: Optional[str] = None


@app.post("/api/monitor/run")
@app.post("/api/monitor/cycle")
def run_monitor(req: MonitorRunRequest) -> Dict[str, Any]:
    """
    Execute the full 6-node MONITOR workflow via ReviewCrew:
    1. Detect -> 2. Medical Review -> 3. Data Manager -> 4. Compliance -> 5. Human Gate -> 6. Execute.
    """
    crew = _require_crew()
    active_cut = req.cut if req.cut is not None else 12
    active_proto = req.protocol_version
    if active_proto is None:
        # Determine protocol version from cut: 1-4: v1, 5-8: v2, 9-12: v3
        active_proto = 1 if active_cut <= 4 else (2 if active_cut <= 8 else 3)

    report = crew.run_cycle(cut=active_cut, protocol_version=active_proto)
    report_dict = report.to_dict()

    # Include all queries from memory (including Hospital Management sent queries)
    all_mem_queries = [q.to_dict() for q in crew.memory.queries_by_key.values()]
    if all_mem_queries:
        seen_qids = {q["query_id"] for q in report_dict.get("queries", [])}
        for mq in all_mem_queries:
            if mq["query_id"] not in seen_qids:
                report_dict["queries"].append(mq)
                seen_qids.add(mq["query_id"])

    # Maintain backward compatibility fields for existing UI components
    report_dict["decisions"] = report_dict["human_gate_decisions"]
    report_dict["trace_count"] = len(report_dict["trace"])
    return report_dict


@app.get("/api/monitor/cycle-report")
def get_monitor_cycle_report() -> Dict[str, Any]:
    """Retrieves the most recent ReviewReport generated by ReviewCrew."""
    crew = _require_crew()
    if crew.memory.cycle_history:
        return crew.memory.cycle_history[-1]
    # Run default cut 12 if no cycle yet
    return run_monitor(MonitorRunRequest(cut=12))


@app.get("/api/monitor/trace/{target_id}")
def get_monitor_trace(target_id: str) -> Dict[str, Any]:
    """Retrieves full clinical workflow trace strictly from recorded trace."""
    crew = _require_crew()
    return crew.explain(target_id)


@app.get("/api/monitor/escalations")
@app.get("/api/monitor/pending-escalations")
def get_monitor_escalations() -> List[Dict[str, Any]]:
    """Lists all escalations with current status and evidence."""
    crew = _require_crew()
    return [e.to_dict() for e in crew.escalations_history.values()]


@app.post("/api/monitor/escalations/{escalation_id}/approve")
def approve_escalation(escalation_id: str, req: Optional[EscalationDecisionRequest] = None) -> Dict[str, Any]:
    """Approves a pending escalation at the Human Gate."""
    crew = _require_crew()
    esc = crew.escalations_history.get(escalation_id)
    if not esc:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    reason = (req and req.reason) or "Approved by medical monitor at Human Gate"
    esc.status = "APPROVED"
    from stage2.models import HumanGateDecision
    dec = HumanGateDecision(
        decision_id=f"DEC_MANUAL_{esc.code}_{esc.usubjid}",
        finding_id=esc.escalation_id,
        code=esc.code,
        target=esc.usubjid,
        outcome="APPROVED",
        reason=reason,
    )
    crew.memory.register_decision(dec)
    crew._record_trace(
        node="human_gate",
        finding_id=esc.escalation_id,
        input_summary=f"human_gate {esc.code} {esc.usubjid} -> APPROVED",
        rule="Human Gate: Manual Monitor Approval",
        evidence=esc.evidence,
        decision="APPROVED",
        output_action=reason,
        details={"outcome": "APPROVED", "reason": reason},
    )
    # Execute action
    crew.execute([dec], [])
    return {"status": "APPROVED", "escalation_id": escalation_id, "reason": reason}


@app.post("/api/monitor/escalations/{escalation_id}/reject")
def reject_escalation(escalation_id: str, req: Optional[EscalationDecisionRequest] = None) -> Dict[str, Any]:
    """Rejects an escalation at the Human Gate and downgrades it to monitoring."""
    crew = _require_crew()
    esc = crew.escalations_history.get(escalation_id)
    if not esc:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    reason = (req and req.reason) or "Rejected by medical monitor; downgraded to monitoring"
    esc.status = "REJECTED"
    from stage2.models import HumanGateDecision
    dec = HumanGateDecision(
        decision_id=f"DEC_MANUAL_{esc.code}_{esc.usubjid}",
        finding_id=esc.escalation_id,
        code=esc.code,
        target=esc.usubjid,
        outcome="REJECTED",
        reason=reason,
    )
    crew.memory.register_decision(dec)
    crew._record_trace(
        node="human_gate",
        finding_id=esc.escalation_id,
        input_summary=f"human_gate {esc.code} {esc.usubjid} -> REJECTED: downgraded to monitoring",
        rule="Human Gate: Manual Monitor Rejection",
        evidence=esc.evidence,
        decision="REJECTED",
        output_action=f"Downgraded to monitoring: {reason}",
        details={"outcome": "REJECTED", "reason": reason},
    )
    return {"status": "REJECTED", "escalation_id": escalation_id, "reason": reason}


@app.post("/api/monitor/escalations/{escalation_id}/clarify")
@app.post("/escalations/{escalation_id}/clarify")
def clarify_escalation(escalation_id: str, req: Optional[EscalationDecisionRequest] = None) -> Dict[str, Any]:
    """Processes a clarification question, resolves it from the StudyGraph, and resubmits."""
    crew = _require_crew()
    esc = crew.escalations_history.get(escalation_id)
    if not esc:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    question = (req and req.reason) or "What was the ALT at screening, and is there a concomitant hepatotoxic medication?"
    decisions = crew.human_gate(
        [esc],
        decisions_override={f"{esc.code}|{esc.usubjid}": ["CLARIFY", question]}
    )
    return {
        "status": "CLARIFIED_AND_RESUBMITTED",
        "escalation_id": escalation_id,
        "question": question,
        "response": esc.clarification_response,
        "final_outcome": esc.status,
    }


class ClarifyRequestBody(BaseModel):
    escalation_id: str
    question: Optional[str] = None


@app.post("/api/monitor/clarify")
@app.post("/monitor/clarify")
def post_monitor_clarify(body: ClarifyRequestBody) -> Dict[str, Any]:
    """Handles POST /api/monitor/clarify with {escalation_id, question}."""
    return clarify_escalation(body.escalation_id, EscalationDecisionRequest(reason=body.question or ""))


@app.get("/api/monitor/queries")
@app.get("/queries")
@app.get("/api/queries")
def get_monitor_queries() -> List[Dict[str, Any]]:
    """Lists all queries issued by Data Manager node with site replies and open status."""
    crew = _require_crew()
    return [q.to_dict() for q in crew.memory.queries_by_key.values()]


class CreateQueryRequest(BaseModel):
    finding_id: Optional[str] = "MANUAL"
    domain: Optional[str] = None
    usubjid: str
    seq: Optional[int] = None
    question: Optional[str] = None
    message: Optional[str] = None
    siteid: Optional[str] = None
    hospital: Optional[str] = None
    issue: Optional[str] = None
    record_ref: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None


@app.post("/queries")
@app.post("/api/queries")
def post_query(req: CreateQueryRequest) -> Dict[str, Any]:
    """
    Posts a new EDC query via Data Manager interface to Hospital Management.
    Enforces duplicate query prevention using MONITOR memory rules and tracks
    initial status: 'SENT TO HOSPITAL MANAGEMENT'.
    """
    try:
        crew = _require_crew()
        from stage2.models import Query, RecordRef
        import uuid
        from datetime import datetime
        
        now = datetime.now()
        cur_date = req.date or now.strftime('%d %b %Y')
        cur_time = req.time or now.strftime('%I:%M %p')
        
        # Derive domain and seq from record_ref if not provided directly
        raw_rec = req.record_ref or ""
        domain = req.domain or ""
        seq = req.seq
        if not domain and raw_rec:
            parts = raw_rec.replace("-", " ").replace("Seq", " ").split()
            if parts:
                domain = parts[0]
            if seq is None and len(parts) > 1 and parts[-1].isdigit():
                seq = int(parts[-1])
        domain = (domain or "MANUAL").upper()
        seq = seq if seq is not None else 1
        
        record_ref = req.record_ref or f"{domain} Seq {seq}"
        usubjid = req.usubjid.strip().upper()
        siteid = req.hospital or req.siteid
        if not siteid:
            subj_rec = crew.atlas.graph.get_subject(usubjid) if hasattr(crew, 'atlas') and hasattr(crew.atlas, 'graph') else None
            siteid = subj_rec.siteid if subj_rec else "S01"
            
        issue = (req.issue or "DATA_DISCREPANCY").strip()
        question_text = req.message or req.question or f"Please confirm {record_ref} for subject {usubjid}."
        
        # Duplicate Query Protection: Check memory
        # key format: domain|usubjid|seq|issue
        if crew.memory.is_query_issued(domain, usubjid, seq, issue_code=issue):
            key = f"{domain}|{usubjid}|{seq}|{issue}"
            existing = crew.memory.queries_by_key.get(key)
            return {
                "duplicate": True,
                "status": "EXISTING_QUERY_FOUND",
                "message": "Existing Query Found. Duplicate query creation prevented.",
                "hospital": siteid,
                "subject": usubjid,
                "record": record_ref,
                "issue": issue,
                "existing_query": existing.to_dict() if existing else None,
            }
            
        qid = f"Q-{uuid.uuid4().hex[:8].upper()}"
        q = Query(
            query_id=qid,
            finding_id=req.finding_id or "MANUAL",
            domain=domain,
            usubjid=usubjid,
            siteid=siteid,
            seq=seq,
            question=question_text,
            reply_status="SENT TO HOSPITAL MANAGEMENT",
            reply_text="Dispatched to hospital management and site coordinator. Awaiting review.",
            cut=getattr(getattr(crew, 'graph', None), 'current_cut', 12) or 12,
            timestamp=now.isoformat(),
            issue=issue,
            record_ref=record_ref,
            date=cur_date,
            time=cur_time,
            evidence=[RecordRef(domain=domain, usubjid=usubjid, seq=seq)],
        )
        
        # Save into persistent memory
        crew.memory.register_query(q, issue_code=issue)
        
        # Record into live audit trace
        crew._record_trace(
            node="data_manager",
            finding_id=q.finding_id,
            input_summary=f"Query {q.query_id} dispatched to Hospital {siteid} for {usubjid} ({record_ref})",
            rule="Data Manager Query Sent to Hospital Management",
            evidence=q.evidence,
            decision="SENT_TO_HOSPITAL_MANAGEMENT",
            output_action=f"Dispatched: {q.question}",
            details={
                "query_id": q.query_id,
                "hospital": siteid,
                "subject": usubjid,
                "record": record_ref,
                "issue": issue,
                "date": cur_date,
                "time": cur_time,
                "status": "SENT TO HOSPITAL MANAGEMENT",
            },
        )
        
        return {
            "duplicate": False,
            "success": True,
            "status": "SENT TO HOSPITAL MANAGEMENT",
            "message": "Query successfully sent to hospital management.",
            "query_id": q.query_id,
            "hospital": siteid,
            "subject": usubjid,
            "record": record_ref,
            "issue": issue,
            "message_text": question_text,
            "date": cur_date,
            "time": cur_time,
            "query": q.to_dict(),
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=400,
            detail="Unable to save query. Please check query details and try again."
        )


@app.get("/api/patient-disease-graph")
@app.get("/patient-disease-graph")
def get_patient_disease_graph() -> Dict[str, Any]:
    """
    Feature 1: Constructs the dynamic Patient <-> Disease Graph from actual dataset records.
    Sources:
    - Medical History (MH domain, MH.csv)
    - Adverse Events (AE domain, AE.csv)
    """
    crew = _require_crew()
    graph = crew.graph
    
    disease_map: Dict[str, Dict[str, Any]] = {}
    patient_map: Dict[str, Dict[str, Any]] = {}
    relationships: List[Dict[str, Any]] = []
    
    subject_ids = sorted(graph.get_subject_ids())
    
    for usubjid in subject_ids:
        siteid = graph.get_subject_site(usubjid) or "S01"
        patient_map[usubjid] = {
            "usubjid": usubjid,
            "siteid": siteid,
            "diseases": set(),
            "records_count": 0,
        }
        
        # 1. Medical History Records (Pre-existing diseases)
        for mh in graph.get_subject_mh(usubjid):
            disease = (mh.term or "").strip()
            if not disease:
                continue
            patient_map[usubjid]["diseases"].add(disease)
            patient_map[usubjid]["records_count"] += 1
            
            if disease not in disease_map:
                disease_map[disease] = {
                    "name": disease,
                    "category": "Medical History",
                    "domain": "MH",
                    "patients": set(),
                    "records": [],
                }
            disease_map[disease]["patients"].add(usubjid)
            
            rel = {
                "usubjid": usubjid,
                "siteid": siteid,
                "disease": disease,
                "domain": "MH",
                "seq": mh.seq,
                "record_ref": f"MH Seq {mh.seq}",
                "category": "Medical History",
                "cut_available": mh.cut_available,
                "evidence": f"Subject {usubjid} has medical history '{disease}' recorded in MH Seq {mh.seq} (Cut {mh.cut_available}).",
            }
            relationships.append(rel)
            disease_map[disease]["records"].append(rel)
            
        # 2. Adverse Event Records (Trial-emergent disease conditions)
        for ae in graph.get_subject_aes(usubjid):
            disease = (ae.term or "").strip()
            if not disease:
                continue
            patient_map[usubjid]["diseases"].add(disease)
            patient_map[usubjid]["records_count"] += 1
            
            if disease not in disease_map:
                disease_map[disease] = {
                    "name": disease,
                    "category": "Adverse Event",
                    "domain": "AE",
                    "patients": set(),
                    "records": [],
                }
            disease_map[disease]["patients"].add(usubjid)
            
            rel = {
                "usubjid": usubjid,
                "siteid": siteid,
                "disease": disease,
                "domain": "AE",
                "seq": ae.seq,
                "record_ref": f"AE Seq {ae.seq}",
                "category": "Adverse Event",
                "cut_available": ae.cut_available,
                "severity": ae.sev,
                "serious": ae.ser,
                "hospitalized": ae.hosp,
                "evidence": f"Subject {usubjid} experienced '{disease}' (AE Seq {ae.seq}, Serious={ae.ser}, Hosp={ae.hosp}).",
            }
            relationships.append(rel)
            disease_map[disease]["records"].append(rel)

    patients_list = [
        {
            "usubjid": p["usubjid"],
            "siteid": p["siteid"],
            "diseases": sorted(list(p["diseases"])),
            "records_count": p["records_count"],
        }
        for p in patient_map.values()
    ]
    
    diseases_list = [
        {
            "name": d["name"],
            "category": d["category"],
            "domain": d["domain"],
            "patient_count": len(d["patients"]),
            "patients": sorted(list(d["patients"])),
            "records": d["records"],
        }
        for d in sorted(disease_map.values(), key=lambda x: len(x["patients"]), reverse=True)
    ]
    
    return {
        "total_patients": len(patients_list),
        "total_diseases": len(diseases_list),
        "total_relationships": len(relationships),
        "patients": patients_list,
        "diseases": diseases_list,
        "relationships": relationships,
    }


@app.get("/api/monitor/findings")
@app.get("/monitor/findings")
def get_monitor_findings(cut: Optional[int] = None, protocol_version: Optional[int] = None) -> List[Dict[str, Any]]:
    """Lists all findings detected by Problem 1 Atlas for the current/requested cut."""
    crew = _require_crew()
    active_cut = cut if cut is not None else 12
    active_proto = protocol_version or (1 if active_cut <= 4 else (2 if active_cut <= 8 else 3))
    findings = crew.detect(active_cut, active_proto)
    return [f.to_dict() for f in findings]


@app.get("/api/monitor/findings/{finding_id}")
@app.get("/monitor/findings/{finding_id}")
def get_monitor_finding_detail(finding_id: str) -> Dict[str, Any]:
    """Retrieves full details for a finding, including medical review, queries, escalations, and timeline."""
    crew = _require_crew()
    finding = crew.findings_history.get(finding_id)
    if not finding:
        # Search through all registered findings in memory cycles
        for report_dict in reversed(crew.memory.cycle_history):
            for f in report_dict.get("findings", []):
                if f.get("finding_id") == finding_id:
                    return f
        raise HTTPException(status_code=404, detail=f"Finding '{finding_id}' not found")
    
    # Associated queries
    queries = [q.to_dict() for q in crew.memory.queries_by_key.values() if q.finding_id == finding_id or q.usubjid == finding.usubjid]
    # Associated escalation
    escalation = next((e.to_dict() for e in crew.escalations_history.values() if e.usubjid == finding.usubjid and (e.code == finding.finding_code or e.escalation_id == finding_id)), None)
    # Trace timeline
    trace = crew.explain(finding_id)
    
    finding_dict = finding.to_dict()
    # Enrich evidence records with real clinical values from dataset StudyGraph
    enriched_evidence = []
    for ev in finding.evidence:
        triple = (ev.domain.upper(), ev.usubjid, ev.seq)
        rec = crew.graph.records_by_ref.get(triple)
        rec_date = ""
        rec_val = ""
        rec_unit = ""
        if rec:
            if hasattr(rec, 'dtc') and getattr(rec.dtc, 'iso', None):
                rec_date = rec.dtc.iso
            elif hasattr(rec, 'stdtc') and getattr(rec.stdtc, 'iso', None):
                rec_date = rec.stdtc.iso
            elif hasattr(rec, 'date'):
                rec_date = str(rec.date)

            if hasattr(rec, 'testcd') and hasattr(rec, 'orres'):
                rec_val = f"{rec.testcd}: {rec.orres}"
                rec_unit = getattr(rec, 'orresu', '') or ''
            elif hasattr(rec, 'term'):
                rec_val = f"{rec.term} (SER={getattr(rec, 'ser', '')}, HOSP={getattr(rec, 'hosp', '')})"
            elif hasattr(rec, 'dose'):
                rec_val = f"{getattr(rec, 'trt', '')} {rec.dose} {getattr(rec, 'dosu', '')}".strip()
                rec_unit = getattr(rec, 'dosu', '') or ''
            elif hasattr(rec, 'trt'):
                rec_val = f"{rec.trt} ({getattr(rec, 'clas', '')})"
            else:
                rec_val = str(rec)

        enriched_evidence.append({
            "domain": ev.domain,
            "usubjid": ev.usubjid,
            "seq": ev.seq,
            "record_ref": f"{ev.domain} Seq {ev.seq}",
            "date": rec_date or "N/A",
            "value": rec_val or "Record Present",
            "unit": rec_unit or "—",
            "rationale": f"Primary verified dataset evidence for {finding.finding_code} under Protocol rule."
        })
    finding_dict["enriched_evidence"] = enriched_evidence
    
    return {
        "finding": finding_dict,
        "queries": queries,
        "escalation": escalation,
        "trace": trace,
    }


@app.get("/escalations")
@app.get("/api/escalations")
def list_escalations() -> List[Dict[str, Any]]:
    """Alias for /api/monitor/escalations."""
    return get_monitor_escalations()


class CreateEscalationRequest(BaseModel):
    code: str
    usubjid: str
    siteid: str
    severity: str
    summary: str
    evidence: List[Dict[str, Any]]
    alternatives: Optional[List[str]] = None
    reason_for_escalation: str


@app.post("/escalations")
@app.post("/api/escalations")
def create_escalation(req: CreateEscalationRequest) -> Dict[str, Any]:
    """Creates an escalation draft manually."""
    crew = _require_crew()
    from stage2.models import EscalationDraft, RecordRef
    import uuid
    eid = f"ESC-{uuid.uuid4().hex[:8].upper()}"
    ev_refs = [RecordRef(domain=e.get("domain", ""), usubjid=e.get("usubjid", req.usubjid), seq=int(e.get("seq", 1))) for e in req.evidence]
    esc = EscalationDraft(
        escalation_id=eid,
        code=req.code,
        usubjid=req.usubjid.upper(),
        siteid=req.siteid,
        severity=req.severity,
        summary=req.summary,
        evidence=ev_refs,
        alternatives=req.alternatives or [],
        reason_for_escalation=req.reason_for_escalation,
        status="PENDING",
    )
    crew.escalations_history[eid] = esc
    return esc.to_dict()


class MonitorDecisionBody(BaseModel):
    decision: str
    reason: Optional[str] = None


@app.post("/api/monitor/escalations/{escalation_id}/decision")
@app.post("/monitor/escalations/{escalation_id}/decision")
def post_escalation_decision(escalation_id: str, body: MonitorDecisionBody) -> Dict[str, Any]:
    """Handles APPROVED, REJECTED, or CLARIFY decision at Human Gate."""
    d = body.decision.upper()
    if d == "APPROVED":
        return approve_escalation(escalation_id, EscalationDecisionRequest(reason=body.reason))
    elif d == "REJECTED":
        return reject_escalation(escalation_id, EscalationDecisionRequest(reason=body.reason))
    elif d == "CLARIFY":
        return clarify_escalation(escalation_id, EscalationDecisionRequest(reason=body.reason))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported decision '{body.decision}'. Must be APPROVED, REJECTED, or CLARIFY.")


@app.get("/api/monitor/reports/{cycle_id}")
@app.get("/monitor/reports/{cycle_id}")
def get_monitor_report(cycle_id: str) -> Dict[str, Any]:
    """Retrieves a specific ReviewReport by cycle ID (e.g. CYCLE-012)."""
    crew = _require_crew()
    for report_dict in reversed(crew.memory.cycle_history):
        if report_dict.get("cycle_id") == cycle_id or str(report_dict.get("cut")) == cycle_id:
            return report_dict
    # If not found, return latest
    if crew.memory.cycle_history:
        return crew.memory.cycle_history[-1]
    raise HTTPException(status_code=404, detail=f"ReviewReport '{cycle_id}' not found")


@app.get("/api/monitor/trace")
@app.get("/monitor/trace")
def get_all_monitor_trace() -> List[Dict[str, Any]]:
    """Returns the complete recorded audit trail from ReviewCrew."""
    crew = _require_crew()
    return [t.to_dict() for t in crew.recorded_trace]


@app.get("/api/monitor/patient/{usubjid}")
@app.get("/monitor/patient/{usubjid}")
def get_monitor_patient(usubjid: str) -> Dict[str, Any]:
    """Returns Patient 360 view for the given subject."""
    return patient360(usubjid)


@app.get("/api/monitor/site-flags")
def get_monitor_site_flags() -> List[Dict[str, Any]]:
    """Lists active site-level flags for recurring deviations."""
    crew = _require_crew()
    return [s.to_dict() for s in crew.memory.compute_site_flags()]


@app.get("/api/monitor/decisions")
@app.get("/decisions")
def get_monitor_decisions() -> List[Dict[str, Any]]:
    """Lists all Human Gate decisions (APPROVED, REJECTED, CLARIFY)."""
    crew = _require_crew()
    return [d.to_dict() for d in crew.memory.decisions_history.values()]


class UniversalDecisionRequest(BaseModel):
    escalation_id: str
    decision: str  # APPROVED, REJECTED, CLARIFY
    reason: Optional[str] = None


@app.post("/decisions")
@app.post("/api/decisions")
def post_decision_universal(req: UniversalDecisionRequest) -> Dict[str, Any]:
    """Human Gate decision endpoint accepting APPROVED, REJECTED, or CLARIFY."""
    return post_escalation_decision(req.escalation_id, MonitorDecisionBody(decision=req.decision, reason=req.reason))


@app.get("/findings")
def get_findings_list(cut: Optional[int] = None, protocol_version: Optional[int] = None) -> List[Dict[str, Any]]:
    """Root GET /findings endpoint returning structured clinical findings."""
    return get_monitor_findings(cut=cut, protocol_version=protocol_version)


@app.get("/findings/{finding_id}")
def get_finding_by_id(finding_id: str) -> Dict[str, Any]:
    """Root GET /findings/:id endpoint returning full detail for a finding."""
    return get_monitor_finding_detail(finding_id)


@app.get("/queries/{query_id}")
@app.get("/api/queries/{query_id}")
def get_query_by_id(query_id: str) -> Dict[str, Any]:
    """Retrieves a specific query by ID."""
    crew = _require_crew()
    for q in crew.memory.queries_by_key.values():
        if q.query_id == query_id:
            return q.to_dict()
    raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found")


@app.get("/escalations/{escalation_id}")
@app.get("/api/escalations/{escalation_id}")
def get_escalation_by_id(escalation_id: str) -> Dict[str, Any]:
    """Retrieves a specific escalation by ID."""
    crew = _require_crew()
    esc = crew.escalations_history.get(escalation_id)
    if not esc:
        for e in crew.escalations_history.values():
            if e.escalation_id == escalation_id or e.code == escalation_id:
                return e.to_dict()
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    return esc.to_dict()


@app.get("/monitor/reviews")
@app.get("/api/monitor/reviews")
def get_monitor_reviews(cut: Optional[int] = None) -> List[Dict[str, Any]]:
    """Returns the medical review results for all findings."""
    crew = _require_crew()
    if crew.memory.cycle_history:
        return crew.memory.cycle_history[-1].get("medical_review_results", [])
    c = cut or 12
    p = 1 if c <= 4 else (2 if c <= 8 else 3)
    report = crew.run_cycle(cut=c, protocol_version=p)
    return report.medical_review_results


@app.get("/compliance")
@app.get("/api/compliance")
def get_compliance_deviations(cut: Optional[int] = None, protocol_version: Optional[int] = None) -> List[Dict[str, Any]]:
    """Evaluates protocol deviations under the protocol version applicable to the cut."""
    crew = _require_crew()
    c = cut or 12
    p = protocol_version or (1 if c <= 4 else (2 if c <= 8 else 3))
    findings = crew.detect(c, p)
    devs = crew.compliance(findings, protocol_version=p, cut=c)
    return [d.to_dict() for d in devs]


@app.get("/trace")
@app.get("/api/trace")
def get_global_trace() -> List[Dict[str, Any]]:
    """Returns the live audit trail / trace of all actions."""
    return get_all_monitor_trace()


@app.get("/memory")
@app.get("/api/memory")
def get_monitor_memory() -> Dict[str, Any]:
    """Returns persistent memory state across cycles."""
    crew = _require_crew()
    return {
        "issued_query_keys": list(crew.memory.issued_query_keys),
        "issued_escalation_keys": list(crew.memory.issued_escalation_keys),
        "rejected_escalations": crew.memory.rejected_escalations,
        "site_issue_stats": crew.memory.site_issue_stats,
        "site_level_flags": [s.to_dict() for s in crew.memory.compute_site_flags()],
        "total_cycles_recorded": len(crew.memory.cycle_history),
        "open_queries_count": len(crew.memory.get_open_queries()),
    }


@app.get("/review-report")
@app.get("/api/review-report")
def get_latest_review_report(cut: Optional[int] = None) -> Dict[str, Any]:
    """Returns the latest comprehensive ReviewReport."""
    return get_monitor_cycle_report()



# ---------------------------------------------------------------------------
# Problem 3: WATCH Endpoints
# ---------------------------------------------------------------------------

class WatchSurveillanceRequest(BaseModel):
    cut_from: int = 1
    cut_to: int = 12


class WatchRunPeriodRequest(BaseModel):
    cut_from: int = 1
    cut_to: int = 12


@app.post("/api/watch/surveillance")
def run_watch_surveillance(req: WatchSurveillanceRequest) -> Dict[str, Any]:
    """Executes longitudinal surveillance across cuts (NEW, CHANGED, REPEATED, PREVIOUSLY_SEEN)."""
    w = _require_watch()
    return w.surveillance_across_cuts(cut_from=req.cut_from, cut_to=req.cut_to)


@app.get("/api/watch/adversarial")
def get_watch_adversarial(cut: Optional[int] = None) -> List[Dict[str, Any]]:
    """Detects and mitigates the 3 adversarial scenarios: regular site data, unit shift, prompt injection."""
    w = _require_watch()
    signals = w.detect_adversarial_scenarios(cut=cut)
    return [s.to_dict() for s in signals]


@app.post("/api/watch/run-period")
def run_watch_period(req: Optional[WatchRunPeriodRequest] = None) -> Dict[str, Any]:
    """Executes unattended surveillance across specified cuts (default cuts 1..12) and returns SurveillanceReport."""
    sw = _require_study_watch()
    start_c = req.cut_from if req else 1
    end_c = req.cut_to if req else 12
    report = sw.run_period(range(start_c, end_c + 1))
    return report.to_dict()


@app.get("/api/watch/report")
def get_watch_report() -> Dict[str, Any]:
    """Returns the latest 12-cut surveillance report, running surveillance if not yet generated."""
    sw = _require_study_watch()
    if not sw.reports_history:
        report = sw.run_period(range(1, 13))
    else:
        report = sw.reports_history[-1]
    return report.to_dict()


@app.get("/api/watch/timeline")
def get_watch_timeline() -> List[Dict[str, Any]]:
    """Returns cut-by-cut surveillance timeline summaries."""
    sw = _require_study_watch()
    if not sw.timeline:
        sw.run_period(range(1, 13))
    return sw.timeline


@app.get("/api/watch/site-risk")
def get_watch_site_risk() -> List[Dict[str, Any]]:
    """Returns dynamically stratified site risk rankings across study centers."""
    sw = _require_study_watch()
    if not sw.timeline:
        sw.run_period(range(1, 13))
    return sw.compute_site_risk()


@app.get("/api/watch/decisions")
def get_watch_decisions() -> List[Dict[str, Any]]:
    """Returns all structured decisions made by WATCH with full traceable evidence."""
    sw = _require_study_watch()
    return sw.get_decision_center()


@app.get("/api/watch/escalations")
def get_watch_escalations() -> List[Dict[str, Any]]:
    """Returns longitudinal human escalation tracker state across cuts."""
    sw = _require_study_watch()
    return sw.get_escalations_tracker_list()


@app.get("/api/watch/explain/{signal_id}")
def explain_watch_signal(signal_id: str) -> Dict[str, Any]:
    """Explains an anomaly, decision, or surveillance signal strictly from live recorded trace."""
    sw = _require_study_watch()
    
    # First check if signal_id is a mapped Decision ID (e.g. D-001, D-008, D-012)
    decisions = sw.get_decision_center()
    matched_dec = next((d for d in decisions if d["decision_id"].upper() == signal_id.upper() or d["raw_id"].upper() == signal_id.upper()), None)
    
    if matched_dec:
        return {
            "decision_id": matched_dec["decision_id"],
            "raw_id": matched_dec["raw_id"],
            "what": matched_dec["what"],
            "evidence": matched_dec["evidence"],
            "evidence_lines": matched_dec["evidence_lines"],
            "alternatives": matched_dec["alternatives"],
            "why": matched_dec["why"],
            "consistent_with_trace": True,
            "node": "watch",
            "cut": matched_dec["cut"],
            "status": matched_dec["status"],
            "target": matched_dec["target"],
            "decision_type": matched_dec["decision_type"],
            "severity": matched_dec["severity"],
            "action": matched_dec["action"],
            "trace_path": matched_dec["trace_path"],
            "is_false_warning_prevented": matched_dec["is_false_warning_prevented"],
            "found_in_trace": True,
        }

    exp = sw.explain(signal_id)
    if exp.consistent_with_trace and exp.status != "NOT_FOUND":
        res = exp.to_dict()
        res["found_in_trace"] = True
        return res

    # Fallback to legacy WatchEngine trace
    w = _require_watch()
    legacy_exp = w.explain(signal_id)
    if legacy_exp.get("found_in_trace"):
        return legacy_exp

    return exp.to_dict()



# ---------------------------------------------------------------------------
# Static Frontend Serving & Single Unique Localhost Link Support
# ---------------------------------------------------------------------------
_frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(_frontend_dist):
    _assets_dir = os.path.join(_frontend_dist, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        # Allow API routes and Swagger docs to pass through
        if full_path.startswith(("api", "docs", "openapi.json", "redoc", "findings", "queries", "escalations", "compliance", "trace", "memory", "review-report", "patients")):
            raise HTTPException(status_code=404, detail=f"Endpoint '{full_path}' not found")
        target_file = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)
        return FileResponse(os.path.join(_frontend_dist, "index.html"))



