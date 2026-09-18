"""
Data loading and cut-filtering layer for clinical trial CSVs.
Applies data cut filtering, re-issued central lab corrections, and malformed row defenses.
"""

import csv
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .dates import ParsedDate, parse_date
from .normalization import NormalizedLabValue, parse_lab_result


@dataclass
class SubjectRecord:
    usubjid: str
    siteid: str
    country: str
    age: Optional[int]
    sex: str
    dminit: str
    brthdtc: ParsedDate
    arm: str
    rfstdtc: ParsedDate
    scr_hba1c: Optional[float]
    cut_available: int
    corrected_at_cut: Optional[int] = None
    is_duplicate_person: bool = False
    duplicate_of_usubjid: Optional[str] = None


@dataclass
class AERecord:
    usubjid: str
    seq: int
    term: str
    sev: str
    ser: str
    hosp: str
    stdtc: ParsedDate
    endtc: ParsedDate
    out: str
    narr: str
    cut_available: int
    corrected_at_cut: Optional[int] = None

    @property
    def is_serious(self) -> bool:
        """Hospitalisation (AESHOSP='Y') makes event serious regardless of site coding."""
        return self.ser.upper() == "Y" or self.hosp.upper() == "Y"

    @property
    def is_miscoded_sae(self) -> bool:
        """True if hospitalized (serious) but site coded AESER='N'."""
        return self.hosp.upper() == "Y" and self.ser.upper() == "N"


@dataclass
class LabRecord:
    usubjid: str
    seq: int
    visit: str
    dtc: ParsedDate
    testcd: str
    orres: str
    orresu: str
    norm_val: NormalizedLabValue
    cut_available: int
    corrected_at_cut: Optional[int] = None
    original_orres: Optional[str] = None


@dataclass
class ExposureRecord:
    usubjid: str
    seq: int
    visit: str
    stdtc: ParsedDate
    dose: float
    dosu: str
    trt: str
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class ConMedRecord:
    usubjid: str
    seq: int
    trt: str
    clas: str
    indc: str
    stdtc: ParsedDate
    dose: str
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class DispositionRecord:
    usubjid: str
    seq: int
    decod: str
    stdtc: ParsedDate
    term: Optional[str]
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class VitalSignRecord:
    usubjid: str
    seq: int
    visit: str
    dtc: ParsedDate
    testcd: str
    orres: str
    orresu: str
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class ECGRecord:
    usubjid: str
    seq: int
    visit: str
    dtc: ParsedDate
    testcd: str
    orres: str
    orresu: str
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class MedHistoryRecord:
    usubjid: str
    seq: int
    term: str
    cut_available: int
    corrected_at_cut: Optional[int] = None


@dataclass
class StudyDataSet:
    cut: Optional[int]
    protocol_version: int
    subjects: Dict[str, SubjectRecord] = field(default_factory=dict)
    ae: List[AERecord] = field(default_factory=list)
    lb: List[LabRecord] = field(default_factory=list)
    ex: List[ExposureRecord] = field(default_factory=list)
    cm: List[ConMedRecord] = field(default_factory=list)
    ds: List[DispositionRecord] = field(default_factory=list)
    vs: List[VitalSignRecord] = field(default_factory=list)
    eg: List[ECGRecord] = field(default_factory=list)
    mh: List[MedHistoryRecord] = field(default_factory=list)
    corrections_applied: int = 0
    duplicate_enrollments: List[Tuple[str, str]] = field(default_factory=list)


class DataLoader:
    """Loads and sanitizes clinical study data."""

    def __init__(self, data_dir: str):
        self.data_dir = data_dir
        self.cuts_info = self._load_cuts_info()
        self.corrections = self._load_corrections()

    def _get_csv_path(self, filename: str) -> str:
        candidates = [
            os.path.join(self.data_dir, "data", filename),
            os.path.join(self.data_dir, filename),
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        raise FileNotFoundError(f"File {filename} not found in {self.data_dir}")

    def _load_cuts_info(self) -> Dict[int, int]:
        """Returns dict mapping cut_number -> protocol_version."""
        cuts_map: Dict[int, int] = {}
        try:
            path = self._get_csv_path("cuts.csv")
            with open(path, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    cut_num = int(row["cut"])
                    proto_ver = int(row["protocol_version"])
                    cuts_map[cut_num] = proto_ver
        except Exception:
            # Fallback based on specification: 1-4: v1, 5-8: v2, 9-12: v3
            for c in range(1, 13):
                if c <= 4:
                    cuts_map[c] = 1
                elif c <= 8:
                    cuts_map[c] = 2
                else:
                    cuts_map[c] = 3
        return cuts_map

    def _load_corrections(self) -> List[Dict[str, Any]]:
        """Loads corrections from corrections.csv."""
        corr_list: List[Dict[str, Any]] = []
        try:
            path = self._get_csv_path("corrections.csv")
            with open(path, "r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    corr_list.append({
                        "cut": int(row["cut"]),
                        "domain": row["domain"].strip().upper(),
                        "usubjid": row["usubjid"].strip(),
                        "seq": int(row["seq"]),
                        "field": row["field"].strip(),
                        "old_value": row["old_value"],
                        "new_value": row["new_value"],
                        "reason": row["reason"],
                    })
        except Exception:
            pass
        return corr_list

    def load(self, cut: Optional[int] = None) -> StudyDataSet:
        """
        Loads the study data visible as of cut number `cut`.
        If cut is None, all cuts (latest data) are loaded.
        """
        effective_cut = cut if cut is not None else 9999
        max_known_cut = max(self.cuts_info.keys()) if self.cuts_info else 12
        proto_version = self.cuts_info.get(cut if cut is not None else max_known_cut, 3)

        # Build lookup for corrections applicable at or before effective_cut
        # Key: (domain, usubjid, seq, field) -> new_value
        active_corrections: Dict[Tuple[str, str, int, str], str] = {}
        for c in self.corrections:
            if c["cut"] <= effective_cut:
                active_corrections[(c["domain"], c["usubjid"], c["seq"], c["field"])] = c["new_value"]

        dataset = StudyDataSet(cut=cut, protocol_version=proto_version)

        # 1. Load DM
        dataset.subjects = self._load_dm(effective_cut)

        # Identify duplicate individuals (same birth date, sex, and initials)
        person_fingerprints: Dict[Tuple[str, str, str], str] = {}
        for subj in dataset.subjects.values():
            if subj.brthdtc.is_valid and subj.sex and subj.dminit:
                fp = (subj.brthdtc.iso or "", subj.sex.upper(), subj.dminit.upper())
                if fp in person_fingerprints:
                    original_id = person_fingerprints[fp]
                    subj.is_duplicate_person = True
                    subj.duplicate_of_usubjid = original_id
                    dataset.duplicate_enrollments.append((original_id, subj.usubjid))
                else:
                    person_fingerprints[fp] = subj.usubjid

        # 2. Load AE
        dataset.ae = self._load_ae(effective_cut, active_corrections)

        # 3. Load LB
        dataset.lb, corrections_count = self._load_lb(effective_cut, active_corrections)
        dataset.corrections_applied = corrections_count

        # 4. Load EX
        dataset.ex = self._load_ex(effective_cut, active_corrections)

        # 5. Load CM
        dataset.cm = self._load_cm(effective_cut, active_corrections)

        # 6. Load DS
        dataset.ds = self._load_ds(effective_cut, active_corrections)

        # 7. Load VS
        dataset.vs = self._load_vs(effective_cut, active_corrections)

        # 8. Load EG
        dataset.eg = self._load_eg(effective_cut, active_corrections)

        # 9. Load MH
        dataset.mh = self._load_mh(effective_cut, active_corrections)

        return dataset

    def _load_dm(self, cut: int) -> Dict[str, SubjectRecord]:
        subjects: Dict[str, SubjectRecord] = {}
        path = self._get_csv_path("DM.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    usubjid = row["USUBJID"].strip()
                    age_val = int(row["AGE"]) if row.get("AGE") and row["AGE"].isdigit() else None
                    scr_hba1c = float(row["SCR_HBA1C"]) if row.get("SCR_HBA1C") else None
                    corr_cut = int(row["corrected_at_cut"]) if row.get("corrected_at_cut") and row["corrected_at_cut"].isdigit() else None

                    subj = SubjectRecord(
                        usubjid=usubjid,
                        siteid=row["SITEID"].strip(),
                        country=row.get("COUNTRY", "").strip(),
                        age=age_val,
                        sex=row.get("SEX", "").strip(),
                        dminit=row.get("DMINIT", "").strip(),
                        brthdtc=parse_date(row.get("BRTHDTC")),
                        arm=row.get("ARM", "").strip(),
                        rfstdtc=parse_date(row.get("RFSTDTC")),
                        scr_hba1c=scr_hba1c,
                        cut_available=c_avail,
                        corrected_at_cut=corr_cut,
                    )
                    subjects[usubjid] = subj
                except Exception:
                    continue
        return subjects

    def _load_ae(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[AERecord]:
        records: List[AERecord] = []
        path = self._get_csv_path("AE.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    usubjid = row["USUBJID"].strip()
                    seq = int(row["AESEQ"])

                    records.append(AERecord(
                        usubjid=usubjid,
                        seq=seq,
                        term=row.get("AETERM", "").strip(),
                        sev=row.get("AESEV", "").strip(),
                        ser=row.get("AESER", "").strip(),
                        hosp=row.get("AESHOSP", "").strip(),
                        stdtc=parse_date(row.get("AESTDTC")),
                        endtc=parse_date(row.get("AEENDTC")),
                        out=row.get("AEOUT", "").strip(),
                        narr=row.get("AENARR", "").strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_lb(
        self,
        cut: int,
        corrections: Dict[Tuple[str, str, int, str], str]
    ) -> Tuple[List[LabRecord], int]:
        records: List[LabRecord] = []
        applied_count = 0
        path = self._get_csv_path("LB.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    usubjid = row["USUBJID"].strip()
                    seq = int(row["LBSEQ"])
                    raw_orres = row.get("LBORRES", "")
                    original_orres = raw_orres

                    # Check for applicable central lab re-issued correction
                    key = ("LB", usubjid, seq, "LBORRES")
                    if key in corrections:
                        raw_orres = corrections[key]
                        applied_count += 1

                    records.append(LabRecord(
                        usubjid=usubjid,
                        seq=seq,
                        visit=row.get("VISIT", "").strip().upper(),
                        dtc=parse_date(row.get("LBDTC")),
                        testcd=row.get("LBTESTCD", "").strip().upper(),
                        orres=raw_orres,
                        orresu=row.get("LBORRESU", "").strip(),
                        norm_val=parse_lab_result(raw_orres),
                        cut_available=c_avail,
                        original_orres=original_orres if raw_orres != original_orres else None,
                    ))
                except Exception:
                    continue
        return records, applied_count

    def _load_ex(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[ExposureRecord]:
        records: List[ExposureRecord] = []
        path = self._get_csv_path("EX.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    records.append(ExposureRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["EXSEQ"]),
                        visit=row.get("VISIT", "").strip().upper(),
                        stdtc=parse_date(row.get("EXSTDTC")),
                        dose=float(row.get("EXDOSE", 0.0)),
                        dosu=row.get("EXDOSU", "").strip(),
                        trt=row.get("EXTRT", "").strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_cm(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[ConMedRecord]:
        records: List[ConMedRecord] = []
        path = self._get_csv_path("CM.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    records.append(ConMedRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["CMSEQ"]),
                        trt=row.get("CMTRT", "").strip(),
                        clas=row.get("CMCLAS", "").strip().upper(),
                        indc=row.get("CMINDC", "").strip(),
                        stdtc=parse_date(row.get("CMSTDTC")),
                        dose=str(row.get("CMDOSE", "")).strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_ds(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[DispositionRecord]:
        records: List[DispositionRecord] = []
        path = self._get_csv_path("DS.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    term_val = row.get("DSTERM")
                    if term_val and term_val.lower() in ["nan", "none", ""]:
                        term_val = None
                    records.append(DispositionRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["DSSEQ"]),
                        decod=row.get("DSDECOD", "").strip().upper(),
                        stdtc=parse_date(row.get("DSSTDTC")),
                        term=term_val.strip() if term_val else None,
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_vs(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[VitalSignRecord]:
        records: List[VitalSignRecord] = []
        path = self._get_csv_path("VS.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    records.append(VitalSignRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["VSSEQ"]),
                        visit=row.get("VISIT", "").strip().upper(),
                        dtc=parse_date(row.get("VSDTC")),
                        testcd=row.get("VSTESTCD", "").strip().upper(),
                        orres=str(row.get("VSORRES", "")).strip(),
                        orresu=row.get("VSORRESU", "").strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_eg(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[ECGRecord]:
        records: List[ECGRecord] = []
        path = self._get_csv_path("EG.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    records.append(ECGRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["EGSEQ"]),
                        visit=row.get("VISIT", "").strip().upper(),
                        dtc=parse_date(row.get("EGDTC")),
                        testcd=row.get("EGTESTCD", "").strip().upper(),
                        orres=str(row.get("EGORRES", "")).strip(),
                        orresu=row.get("EGORRESU", "").strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records

    def _load_mh(self, cut: int, corrections: Dict[Tuple[str, str, int, str], str]) -> List[MedHistoryRecord]:
        records: List[MedHistoryRecord] = []
        path = self._get_csv_path("MH.csv")
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    c_avail = int(row.get("cut_available", 1))
                    if c_avail > cut:
                        continue
                    records.append(MedHistoryRecord(
                        usubjid=row["USUBJID"].strip(),
                        seq=int(row["MHSEQ"]),
                        term=row.get("MHTERM", "").strip(),
                        cut_available=c_avail,
                    ))
                except Exception:
                    continue
        return records
