# Study Sentinel — Problem 1 (ATLAS)

Members: Sudharshan S

## Run it
```bash
pip install -r requirements.txt
python -m stage1.atlas --data hackathon-data
python starter/run_local_harness.py --module stage1.atlas --data hackathon-data
pytest -v
```

## How we understood the problem
The challenge requires constructing a unified, read-optimized clinical knowledge graph across nine domains and answering diverse queries (count, lookup, finding, trap) with zero hallucinated evidence. We identified unit incongruity (e.g. S07 reporting transaminases in µkat/L vs Central in U/L) combined with multi-window logic (Hy's law 14-day rule and visit windows) as the hardest component because naive table joins silently produce false negatives. Longitudinal data evolution across twelve cuts and embedded adversarial text demand dynamic recalculation rather than static indexing. Downstream operational interventions (e.g. monitoring workflows) were treated as strictly out of scope for Atlas.

## Architecture
```text
Clinical CSVs (DM, AE, LB, EX, CM, DS, VS, EG, MH) + Reference Ranges + Amendments
                                │
                                ▼
                       DataLoader & Parser
                                │ (Cut filtering, Date/Unit Normalization, Corrections)
                                ▼
                           StudyGraph
                                │ (Indexed Stores: Subjects, Visits, Analytes, RecordRef Triples)
                                ▼
                         Question Parser
                                │ (Entity & Intent Extraction: COUNT, LOOKUP, FINDING, TRAP)
                                ▼
                     Deterministic Rule Engine
                                │ (Pure Python Arithmetic, Hy's Law, Dosing, Miscoded SAEs)
                                ▼
                         Evidence Validator
                                │ (O(1) Triple Existence & Semantic Grounding Verification)
                                ▼
                        Verified Answer Object
```

## Tech stack
| Layer | Choice | Why this instead of obvious alternative |
|---|---|---|
| Language | Python 3.10+ | Native datetime, strict type annotations, and seamless CDISC data ecosystem compatibility |
| Data Handling | Plain Python Dicts / Dataclasses | Zero runtime overhead compared to Pandas/Polars for O(1) indexed lookups; eliminates memory bloat |
| Graph / Storage | In-Memory Relational Multi-Index | NetworkX/Neo4j introduced 350ms+ build latency and serialization overhead without querying benefits for sub-100k nodes |
| Reasoning Model | Purely Deterministic (No LLM for Facts) | LLMs hallucinate numeric boundaries and fail arithmetic; deterministic logic guarantees 100% precision and zero-cost repeatability |
| Schemas | Pydantic v2 | High-throughput data validation, immutable models (`frozen=True`), and strict schema compliance |
| Testing | PyTest | Granular test parametrization, fast execution (<4s for 42 tests), and deterministic assertions |

## Data handling
* **Units**: Laboratory units are never evaluated without checking `reference_ranges.csv` against the reporting laboratory. S07 transaminase values in `ukat/L` are normalized to `U/L` using the 1 µkat/L = 60 U/L enzymatic factor before comparing to Central ULNs. Unknown units are preserved raw and flagged non-comparable.
* **Dates**: Handled via `stage1/dates.py`. Parses ISO (`%Y-%m-%d`), alphabetic (`%d-%b-%Y`, e.g. `03-FEB-2026`), and slash variants into canonical `datetime.date`. Malformed dates are marked invalid without crashing and excluded only from window arithmetic.
* **Non-numeric Lab Values**: Results like `<5` become structured objects with `numeric_value: null`, `qualifier: '<'`, and `detection_limit: 5.0`. `ND` becomes `qualifier: 'ND'`. Empty values remain null. Comma decimals (`12,4`) are safely parsed as European floating-point notation (`12.4`). None are converted to zero.
* **Malformed Rows**: Rows with corrupted fields are safely recorded in data audit logs and skipped without terminating the ingestion pipeline.
* **Duplicates**: Subjects sharing identical demographic fingerprints (birth date, sex, initials) across sites (e.g. `042-S02-013` and `042-S05-021`) are identified as cross-site duplicate enrollments, preventing duplicate subject inflation in count queries.

## Documents
Protocol versions (v1, v2, v3), the laboratory manual, and the SAP are parsed into structured rule objects. Rules define dynamic visit windows (±7 days in v1 to ±3 days in v2) and prohibited medication classes (Glucocorticoids in v1/v2, adding Sulfonylureas in v3). **Adversarial Defense**: Sentences addressed to automated reviewers (e.g. `lab-manual.md` line 11 instructing reviewers to ignore sites S03 and S07) are parsed strictly as document facts/evidence and isolated completely from software execution logic.

## When the answer is nothing
When query criteria yield zero qualifying records (e.g. searching for dosing errors at site S01 or AE discontinuations at site S07), Atlas returns `answer = []` (or `answer = 0` for counts) with `evidence = []` and `confidence = 1.0`. The accompanying text explicitly confirms that exhaustive evaluation was performed and no records met the condition. The agent never guesses or infers false positive records.

## Graph
* **Nodes (27,178)**: Subjects (241), Sites (12), and Clinical Observation Records (26,925).
* **Edges (29,567)**: Enrollment links (`Subject -> Site`), observation ownership (`Subject -> Record`), temporal scheduling (`Record -> Visit`), and duplicate enrollment pointers (`Subject -> Subject`).
* **Indexes**: O(1) multi-indexes by Subject ID, Site, Visit, Observation Date, and `RecordRef` triple (`DOMAIN|USUBJID|SEQ`).
* **Patient 360**: Assembles a complete clinical dossier per subject across all nine domains and applicable protocol rules; missing records remain strictly missing.

## What we know is weak
1. **Natural Language Syntax Scope**: The question parser uses regex-based deterministic entity extraction tailored to clinical trial nomenclature; complex multi-clause compound questions outside standard patterns may require manual query parameter hints.
2. **Fixed Unit Conversion Catalog**: Enzymatic conversion is implemented for transaminases (`ukat/L` to `U/L`); novel site-specific conversions for unmapped analytes require manual reference range specification.
3. **In-Memory Scale**: The entire graph resides in RAM for sub-millisecond querying; scaling to studies with millions of records would necessitate an on-disk embedded key-value store (e.g. LMDB/RocksDB).
