"""
Study Knowledge Graph implementation for Study Sentinel ATLAS.
Constructs a unified, read-optimized, multi-relational clinical graph
supporting Patient 360 dossiers and instant indexed queries.
"""

from collections import defaultdict
from time import perf_counter
from typing import Any, Dict, List, Optional, Set, Tuple

from .documents import DocumentManager
from .loader import (
    AERecord,
    ConMedRecord,
    DataLoader,
    DispositionRecord,
    ECGRecord,
    ExposureRecord,
    LabRecord,
    MedHistoryRecord,
    SubjectRecord,
    VitalSignRecord,
)
from .units import UnitManager


class StudyGraph:
    """
    In-memory, read-optimized clinical Knowledge Graph.
    Connects subjects, sites, visits, laboratory tests, adverse events,
    doses, concomitant medicines, ECG, vitals, and protocol rules.
    """

    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.loader = DataLoader(data_dir)
        self.document_manager = DocumentManager(data_dir)
        ref_path = self.loader._get_csv_path("reference_ranges.csv") if hasattr(self.loader, "_get_csv_path") else None
        self.unit_manager = UnitManager(ref_path)

        self.current_cut: Optional[int] = None
        self.protocol_version: int = 1

        # Indexed stores
        self.subjects: Dict[str, SubjectRecord] = {}
        self.site_to_subjects: Dict[str, Set[str]] = defaultdict(set)
        self.subject_to_site: Dict[str, str] = {}

        self.records_by_ref: Dict[Tuple[str, str, int], Any] = {}

        self.labs_by_subject: Dict[str, List[LabRecord]] = defaultdict(list)
        self.aes_by_subject: Dict[str, List[AERecord]] = defaultdict(list)
        self.ex_by_subject: Dict[str, List[ExposureRecord]] = defaultdict(list)
        self.cm_by_subject: Dict[str, List[ConMedRecord]] = defaultdict(list)
        self.ds_by_subject: Dict[str, List[DispositionRecord]] = defaultdict(list)
        self.vs_by_subject: Dict[str, List[VitalSignRecord]] = defaultdict(list)
        self.eg_by_subject: Dict[str, List[ECGRecord]] = defaultdict(list)
        self.mh_by_subject: Dict[str, List[MedHistoryRecord]] = defaultdict(list)

        # Multi-relational indexes
        self.by_subject_visit: Dict[Tuple[str, str], List[Any]] = defaultdict(list)
        self.by_subject_date: Dict[Tuple[str, str], List[Any]] = defaultdict(list)

        # Graph topology metrics
        self.nodes_count: int = 0
        self.edges_count: int = 0
        self.stats: Dict[str, Any] = {}

    def build(self, cut: Optional[int] = None) -> Dict[str, Any]:
        """
        Builds or rebuilds the study knowledge graph visible at a specific cut.
        Loads all datasets once, applies corrections, and builds rich indexes.
        """
        t0 = perf_counter()
        self.current_cut = cut
        dataset = self.loader.load(cut=cut)
        self.protocol_version = dataset.protocol_version

        # Reset indexes
        self.subjects.clear()
        self.site_to_subjects.clear()
        self.subject_to_site.clear()
        self.records_by_ref.clear()
        self.labs_by_subject.clear()
        self.aes_by_subject.clear()
        self.ex_by_subject.clear()
        self.cm_by_subject.clear()
        self.ds_by_subject.clear()
        self.vs_by_subject.clear()
        self.eg_by_subject.clear()
        self.mh_by_subject.clear()
        self.by_subject_visit.clear()
        self.by_subject_date.clear()

        # 1. Index Subjects
        self.subjects = dataset.subjects
        for usubjid, subj in self.subjects.items():
            site = subj.siteid
            self.site_to_subjects[site].add(usubjid)
            self.subject_to_site[usubjid] = site
            self.records_by_ref[("DM", usubjid, 1)] = subj

        # 2. Index LB
        for lb in dataset.lb:
            self.labs_by_subject[lb.usubjid].append(lb)
            self.records_by_ref[("LB", lb.usubjid, lb.seq)] = lb
            if lb.visit:
                self.by_subject_visit[(lb.usubjid, lb.visit)].append(lb)
            if lb.dtc.iso:
                self.by_subject_date[(lb.usubjid, lb.dtc.iso)].append(lb)

        # 3. Index AE
        for ae in dataset.ae:
            self.aes_by_subject[ae.usubjid].append(ae)
            self.records_by_ref[("AE", ae.usubjid, ae.seq)] = ae
            if ae.stdtc.iso:
                self.by_subject_date[(ae.usubjid, ae.stdtc.iso)].append(ae)

        # 4. Index EX
        for ex in dataset.ex:
            self.ex_by_subject[ex.usubjid].append(ex)
            self.records_by_ref[("EX", ex.usubjid, ex.seq)] = ex
            if ex.visit:
                self.by_subject_visit[(ex.usubjid, ex.visit)].append(ex)
            if ex.stdtc.iso:
                self.by_subject_date[(ex.usubjid, ex.stdtc.iso)].append(ex)

        # 5. Index CM
        for cm in dataset.cm:
            self.cm_by_subject[cm.usubjid].append(cm)
            self.records_by_ref[("CM", cm.usubjid, cm.seq)] = cm
            if cm.stdtc.iso:
                self.by_subject_date[(cm.usubjid, cm.stdtc.iso)].append(cm)

        # 6. Index DS
        for ds in dataset.ds:
            self.ds_by_subject[ds.usubjid].append(ds)
            self.records_by_ref[("DS", ds.usubjid, ds.seq)] = ds
            if ds.stdtc.iso:
                self.by_subject_date[(ds.usubjid, ds.stdtc.iso)].append(ds)

        # 7. Index VS
        for vs in dataset.vs:
            self.vs_by_subject[vs.usubjid].append(vs)
            self.records_by_ref[("VS", vs.usubjid, vs.seq)] = vs
            if vs.visit:
                self.by_subject_visit[(vs.usubjid, vs.visit)].append(vs)
            if vs.dtc.iso:
                self.by_subject_date[(vs.usubjid, vs.dtc.iso)].append(vs)

        # 8. Index EG
        for eg in dataset.eg:
            self.eg_by_subject[eg.usubjid].append(eg)
            self.records_by_ref[("EG", eg.usubjid, eg.seq)] = eg
            if eg.visit:
                self.by_subject_visit[(eg.usubjid, eg.visit)].append(eg)
            if eg.dtc.iso:
                self.by_subject_date[(eg.usubjid, eg.dtc.iso)].append(eg)

        # 9. Index MH
        for mh in dataset.mh:
            self.mh_by_subject[mh.usubjid].append(mh)
            self.records_by_ref[("MH", mh.usubjid, mh.seq)] = mh

        # Calculate Graph Topology
        unique_sites = len(self.site_to_subjects)
        unique_subjects = len(self.subjects)
        total_observations = len(self.records_by_ref)

        # Nodes: Subjects + Sites + Observations
        self.nodes_count = unique_sites + unique_subjects + total_observations

        # Edges:
        # Subject -> Site (unique_subjects)
        # Subject -> Observation (total_observations)
        # Observation -> Visit (where visit present)
        # Duplicate Person relationships
        visit_links = len(self.by_subject_visit)
        dup_links = len(dataset.duplicate_enrollments)
        self.edges_count = unique_subjects + total_observations + visit_links + dup_links

        t1 = perf_counter()
        build_time_sec = round(t1 - t0, 4)

        self.stats = {
            "cut_used": cut if cut is not None else 12,
            "protocol_version": self.protocol_version,
            "subjects_covered": unique_subjects,
            "unique_individuals": unique_subjects - len(dataset.duplicate_enrollments),
            "duplicate_enrollments_detected": len(dataset.duplicate_enrollments),
            "sites_count": unique_sites,
            "nodes": self.nodes_count,
            "edges": self.edges_count,
            "records_indexed": total_observations,
            "corrections_applied": dataset.corrections_applied,
            "build_time_seconds": build_time_sec,
        }
        return self.stats

    # Query Helper Methods
    def get_subject_ids(self, site_filter: Optional[str] = None) -> List[str]:
        """Returns sorted list of matching subject IDs."""
        if site_filter:
            s_up = site_filter.upper()
            return sorted(list(self.site_to_subjects.get(s_up, set())))
        return sorted(list(self.subjects.keys()))

    def get_subject(self, usubjid: str) -> Optional[SubjectRecord]:
        return self.subjects.get(usubjid)

    def get_subject_site(self, usubjid: str) -> Optional[str]:
        return self.subject_to_site.get(usubjid)

    def get_subject_labs(self, usubjid: str, visit: Optional[str] = None) -> List[LabRecord]:
        labs = self.labs_by_subject.get(usubjid, [])
        if visit:
            v_up = visit.upper()
            return [l for l in labs if l.visit == v_up]
        return labs

    def get_subject_aes(self, usubjid: str) -> List[AERecord]:
        return self.aes_by_subject.get(usubjid, [])

    def get_subject_exposure(self, usubjid: str) -> List[ExposureRecord]:
        return self.ex_by_subject.get(usubjid, [])

    def get_subject_conmeds(self, usubjid: str) -> List[ConMedRecord]:
        return self.cm_by_subject.get(usubjid, [])

    def get_subject_disposition(self, usubjid: str) -> List[DispositionRecord]:
        return self.ds_by_subject.get(usubjid, [])

    def get_subject_vitals(self, usubjid: str, visit: Optional[str] = None) -> List[VitalSignRecord]:
        vitals = self.vs_by_subject.get(usubjid, [])
        if visit:
            v_up = visit.upper()
            return [v for v in vitals if v.visit == v_up]
        return vitals

    def get_subject_ecg(self, usubjid: str, visit: Optional[str] = None) -> List[ECGRecord]:
        ecgs = self.eg_by_subject.get(usubjid, [])
        if visit:
            v_up = visit.upper()
            return [e for e in ecgs if e.visit == v_up]
        return ecgs

    def get_subject_mh(self, usubjid: str) -> List[MedHistoryRecord]:
        return self.mh_by_subject.get(usubjid, [])

    def patient360(self, usubjid: str) -> Dict[str, Any]:
        """
        Assembles complete, faithful 360-degree dossier for a single subject.
        Missing data remains missing; never hallucinates absent records.
        """
        subj = self.get_subject(usubjid)
        if not subj:
            return {"error": f"Subject {usubjid} not found in study"}

        # Gather visits
        visits_recorded = sorted(list(set(
            [l.visit for l in self.labs_by_subject.get(usubjid, []) if l.visit] +
            [e.visit for e in self.ex_by_subject.get(usubjid, []) if e.visit] +
            [v.visit for v in self.vs_by_subject.get(usubjid, []) if v.visit] +
            [g.visit for g in self.eg_by_subject.get(usubjid, []) if g.visit]
        )))

        # Format records faithfully
        labs_out = [
            {
                "seq": l.seq,
                "visit": l.visit,
                "date": l.dtc.iso,
                "test": l.testcd,
                "result": l.orres,
                "unit": l.orresu,
                "normalized": l.norm_val.to_dict(),
            }
            for l in self.get_subject_labs(usubjid)
        ]

        aes_out = [
            {
                "seq": a.seq,
                "term": a.term,
                "severity": a.sev,
                "serious_site_flag": a.ser,
                "hospitalisation": a.hosp,
                "is_serious": a.is_serious,
                "is_miscoded": a.is_miscoded_sae,
                "start_date": a.stdtc.iso,
                "end_date": a.endtc.iso,
                "outcome": a.out,
                "narrative": a.narr,
            }
            for a in self.get_subject_aes(usubjid)
        ]

        ex_out = [
            {
                "seq": e.seq,
                "visit": e.visit,
                "date": e.stdtc.iso,
                "dose": e.dose,
                "unit": e.dosu,
                "treatment": e.trt,
            }
            for e in self.get_subject_exposure(usubjid)
        ]

        cm_out = [
            {
                "seq": c.seq,
                "treatment": c.trt,
                "class": c.clas,
                "indication": c.indc,
                "start_date": c.stdtc.iso,
                "dose": c.dose,
            }
            for c in self.get_subject_conmeds(usubjid)
        ]

        ds_out = [
            {
                "seq": d.seq,
                "status": d.decod,
                "date": d.stdtc.iso,
                "reason": d.term,
            }
            for d in self.get_subject_disposition(usubjid)
        ]

        vs_out = [
            {
                "seq": v.seq,
                "visit": v.visit,
                "date": v.dtc.iso,
                "test": v.testcd,
                "value": v.orres,
                "unit": v.orresu,
            }
            for v in self.get_subject_vitals(usubjid)
        ]

        eg_out = [
            {
                "seq": g.seq,
                "visit": g.visit,
                "date": g.dtc.iso,
                "test": g.testcd,
                "value": g.orres,
                "unit": g.orresu,
            }
            for g in self.get_subject_ecg(usubjid)
        ]

        mh_out = [
            {
                "seq": m.seq,
                "term": m.term,
            }
            for m in self.get_subject_mh(usubjid)
        ]

        return {
            "usubjid": usubjid,
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
            "visits": visits_recorded,
            "laboratory": labs_out,
            "adverse_events": aes_out,
            "exposure": ex_out,
            "concomitant_medications": cm_out,
            "disposition": ds_out,
            "vital_signs": vs_out,
            "ecg": eg_out,
            "medical_history": mh_out,
            "applicable_protocol_version": self.protocol_version,
            "active_cut": self.current_cut,
        }
