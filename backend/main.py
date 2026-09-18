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
from pydantic import BaseModel

from stage1.atlas import Atlas
from stage1.rules import RuleEngine
from starter.schemas import Answer, Question, QuestionCategory

# ---------------------------------------------------------------------------
# State: single Atlas instance (built once at startup)
# ---------------------------------------------------------------------------
DATA_DIR = os.environ.get("ATLAS_DATA_DIR", "hackathon-data")

atlas_instance: Optional[Atlas] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the study graph on startup."""
    global atlas_instance
    atlas_instance = Atlas(DATA_DIR)
    print(f"[ATLAS] Graph built. Stats: {atlas_instance.graph.stats}", flush=True)
    yield
    atlas_instance = None


app = FastAPI(
    title="ATLAS Study Sentinel API",
    version="1.0.0",
    description="Clinical Knowledge Graph QA Engine — VIT Vellore SCOPE Hackathon 2026",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_atlas() -> Atlas:
    if atlas_instance is None:
        raise HTTPException(status_code=503, detail="Graph not yet initialized")
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
def patient360(usubjid: str) -> Dict[str, Any]:
    a = _require_atlas()
    result = a.graph.patient360(usubjid.upper())
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


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

    # Serialize evidence list
    evidence_out = []
    for ref in ans.evidence:
        evidence_out.append({
            "domain": ref.domain,
            "usubjid": ref.usubjid,
            "seq": ref.seq,
            "key": ref.key,
        })

    return {
        "question_id": req.question_id,
        "answer": ans.answer,
        "evidence": evidence_out,
        "evidence_count": len(evidence_out),
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
    a = _require_atlas()
    stats = a.rebuild(cut=req.cut)
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

