# DATA DICTIONARY — STUDY SENTINEL (STUDY-042)

## 1. Overview
This document specifies the schema, clinical definitions, join keys, and critical edge cases for the datasets in STUDY-042 (synthetic Phase III double-blind randomized clinical trial of DRUG-042 vs placebo in adult type 2 diabetes).

Universal Join Key: `USUBJID` (Format: `042-S<SITE>-<SUBJECT>`, e.g. `042-S07-001`).  
Record Identity Triple: `(DOMAIN, USUBJID, <DOMAIN>SEQ)`.

---

## 2. Datasets

### 2.1 Demographics (`DM.csv`)
* **File**: `data/DM.csv`
* **Rows**: 241
* **Primary Key**: `USUBJID`
* **Columns**:
  * `USUBJID` (string): Universal Subject Identifier.
  * `SITEID` (string): Clinical site code (S01 to S12).
  * `COUNTRY` (string): Country ISO code (e.g. IN, DE, US).
  * `AGE` (integer): Subject age at screening.
  * `SEX` (string): Biological sex (`M`, `F`).
  * `DMINIT` (string): Subject initials.
  * `BRTHDTC` (string): Date of birth (`YYYY-MM-DD`).
  * `ARM` (string): Treatment allocation (`DRUG`, `PLACEBO`).
  * `RFSTDTC` (string): Reference start date / first dose date (`YYYY-MM-DD` or `DD-MON-YYYY`).
  * `SCR_HBA1C` (float): Screening HbA1c percentage.
  * `cut_available` (integer): Cut number at which record first appeared.
  * `corrected_at_cut` (float/int): Cut number at which record was corrected.
* **Edge Cases & Quality Insights**:
  * **Duplicate Enrollment**: Subjects `042-S02-013` (Site S02) and `042-S05-021` (Site S05) share identical birth date (`1953-05-28`), sex (`M`), and initials (`VER`), representing a duplicate enrollment of the same individual across sites.
  * Date fields contain both ISO (`2026-01-31`) and CDISC alphabetic formats (`31-JAN-2026`).

---

### 2.2 Adverse Events (`AE.csv`)
* **File**: `data/AE.csv`
* **Rows**: 294
* **Join Key**: `USUBJID`, `AESEQ`
* **Columns**:
  * `USUBJID` (string): Subject identifier.
  * `AESEQ` (integer): Sequence number (1-indexed per subject).
  * `AETERM` (string): Reported adverse event term (e.g. Headache, Cellulitis).
  * `AESEV` (string): Severity (`MILD`, `MODERATE`, `SEVERE`).
  * `AESER` (string): Site serious adverse event flag (`Y`, `N`).
  * `AESHOSP` (string): Hospitalisation flag (`Y`, `N`).
  * `AESTDTC` (string): Event onset date (`YYYY-MM-DD` or `DD-MON-YYYY`).
  * `AEENDTC` (string): Event resolution date.
  * `AEOUT` (string): Outcome (`RECOVERED`, `RESOLVED`, `ONGOING`).
  * `AENARR` (string): Clinical narrative.
  * `cut_available` (integer): Cut visibility.
  * `corrected_at_cut` (float/int): Revision cut.
* **Edge Cases & Quality Insights**:
  * **Miscoded SAE**: Protocol §6 mandates that any event with `AESHOSP == 'Y'` is serious regardless of how `AESER` was coded. Subject `042-S02-004` (Cellulitis, Seq 1) has `AESHOSP = 'Y'` but `AESER = 'N'`.
  * **Pre-Dose Events**: Several AEs have onset dates before first study drug exposure (`RFSTDTC`).

---

### 2.3 Laboratory Results (`LB.csv`)
* **File**: `data/LB.csv`
* **Rows**: 14,400
* **Join Key**: `USUBJID`, `LBSEQ`
* **Columns**:
  * `USUBJID` (string): Subject identifier.
  * `LBSEQ` (integer): Sequence number.
  * `VISIT` (string): Study visit (`SCREENING`, `BASELINE`, `WEEK2`, `WEEK4`, `WEEK8`, `WEEK12`, `WEEK16`, `WEEK20`, `WEEK24`, `EOS`).
  * `LBDTC` (string): Specimen collection date (`YYYY-MM-DD` or `DD-MON-YYYY`).
  * `LBTESTCD` (string): Analyte code (`ALT`, `AST`, `BILI`, `HBA1C`, `GLUC`, `CREAT`).
  * `LBORRES` (string): Original result as reported by laboratory.
  * `LBORRESU` (string): Original reported unit (`U/L`, `ukat/L`, `mg/dL`, `%`).
  * `cut_available` (integer): Cut visibility.
  * `corrected_at_cut` (float/int): Revision cut.
* **Edge Cases & Quality Insights**:
  * **Site-Specific Units**: Site S07 reports ALT and AST in `ukat/L` (1 µkat/L = 60 U/L), whereas the Central lab reports in `U/L`.
  * **Non-Numeric Values**: Includes below-detection results (`<5`), unperformed/not detected tests (`ND`), and blank/empty values (42 rows). These must never be converted to 0.0.
  * **European Comma Decimals**: Certain entries use comma as decimal point (e.g. `117,9`, `12,4`, `8,17`).
  * **Re-issued Central Lab Results**: 200 values are corrected at Cut 5 (documented in `corrections.csv`).

---

### 2.4 Study Drug Exposure (`EX.csv`)
* **File**: `data/EX.csv`
* **Rows**: 2,154
* **Join Key**: `USUBJID`, `EXSEQ`
* **Columns**:
  * `USUBJID` (string): Subject identifier.
  * `EXSEQ` (integer): Sequence number.
  * `VISIT` (string): Visit at which dose was dispensed/recorded.
  * `EXSTDTC` (string): Dosing date.
  * `EXDOSE` (float): Dose administered.
  * `EXDOSU` (string): Dose unit (`mg`).
  * `EXTRT` (string): Treatment name (`DRUG` or `PLACEBO`).
  * `cut_available` (integer): Cut visibility.
  * `corrected_at_cut` (float/int): Revision cut.
* **Edge Cases & Quality Insights**:
  * **Dosing Errors**: Protocol §8 requires 10 mg for DRUG arm and 0 mg for PLACEBO arm. 18 exposure records show deviations (20 mg administered), all clustered at Site S09.
  * **Missing Rows**: Missing exposure rows represent missed doses and deviations.

---

### 2.5 Concomitant Medications (`CM.csv`)
* **File**: `data/CM.csv`
* **Rows**: 468
* **Join Key**: `USUBJID`, `CMSEQ`
* **Columns**:
  * `USUBJID` (string): Subject identifier.
  * `CMSEQ` (integer): Sequence number.
  * `CMTRT` (string): Reported medication name.
  * `CMCLAS` (string): Medication class (e.g. `ACE_INHIBITOR`, `SYSTEMIC_GLUCOCORTICOID`, `SULFONYLUREA`).
  * `CMINDC` (string): Medical indication.
  * `CMSTDTC` (string): Start date.
  * `CMDOSE` (float/string): Dose.
  * `cut_available` (integer): Cut visibility.
  * `corrected_at_cut` (float/int): Revision cut.
* **Edge Cases & Quality Insights**:
  * **Protocol Amendments**: Under Protocol v1 and v2, only `SYSTEMIC_GLUCOCORTICOID` is prohibited. Under Protocol v3 (introduced at Cut 9), `SULFONYLUREA` is also prohibited.

---

### 2.6 Study Disposition (`DS.csv`)
* **File**: `data/DS.csv`
* **Rows**: 240
* **Join Key**: `USUBJID`, `DSSEQ`
* **Columns**:
  * `USUBJID` (string): Subject identifier.
  * `DSSEQ` (integer): Sequence number.
  * `DSDECOD` (string): Standard disposition status (`COMPLETED`, `DISCONTINUED`).
  * `DSSTDTC` (string): Date of completion or discontinuation.
  * `DSTERM` (string): Reason for discontinuation (`ADVERSE EVENT`, `WITHDRAWAL BY SUBJECT`, `LOST TO FOLLOW-UP`).
  * `cut_available` (integer): Cut visibility.
  * `corrected_at_cut` (float/int): Revision cut.
* **Edge Cases & Quality Insights**:
  * Subject `042-S05-021` has no disposition record (enrolled as duplicate subject and did not complete visits).
  * Site S07 has 0 discontinuations due to adverse events (one discontinuation occurred due to `WITHDRAWAL BY SUBJECT`).

---

### 2.7 Vital Signs (`VS.csv`)
* **File**: `data/VS.csv`
* **Rows**: 7,200
* **Join Key**: `USUBJID`, `VSSEQ`
* **Columns**: `USUBJID`, `VSSEQ`, `VISIT`, `VSDTC`, `VSTESTCD` (`SYSBP`, `DIABP`, `PULSE`), `VSORRES`, `VSORRESU`, `cut_available`, `corrected_at_cut`.

---

### 2.8 Electrocardiogram (`EG.csv`)
* **File**: `data/EG.csv`
* **Rows**: 1,440
* **Join Key**: `USUBJID`, `EGSEQ`
* **Columns**: `USUBJID`, `EGSEQ`, `VISIT`, `EGDTC`, `EGTESTCD` (`QTCF`), `EGORRES`, `EGORRESU`, `cut_available`, `corrected_at_cut`.

---

### 2.9 Medical History (`MH.csv`)
* **File**: `data/MH.csv`
* **Rows**: 488
* **Join Key**: `USUBJID`, `MHSEQ`
* **Columns**: `USUBJID`, `MHSEQ`, `MHTERM`, `cut_available`, `corrected_at_cut`.

---

### 2.10 Reference Ranges (`reference_ranges.csv`)
* **File**: `data/reference_ranges.csv`
* **Rows**: 8
* **Columns**: `LBTESTCD`, `UNIT`, `LOW`, `HIGH`, `LAB`.
* **Values**:
  * ALT: CENTRAL (7–56 U/L), S07 (0.12–0.93 ukat/L)
  * AST: CENTRAL (10–40 U/L), S07 (0.17–0.67 ukat/L)
  * BILI: CENTRAL (0.1–1.2 mg/dL)
  * HBA1C: CENTRAL (4.0–5.6 %)
  * GLUC: CENTRAL (70–99 mg/dL)
  * CREAT: CENTRAL (0.6–1.2 mg/dL)

---

### 2.11 Cuts & Corrections (`cuts.csv`, `corrections.csv`)
* **`cuts.csv`** (12 rows): Maps cuts 1–12 to protocol versions (1–4: v1, 5–8: v2, 9–12: v3).
* **`corrections.csv`** (200 rows): Cut 5 re-issuance of central laboratory measurements (`LBORRES`).
