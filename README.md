# ATLAS — Study Sentinel
### VIT Vellore · SCOPE Hackathon 2026 · Problem 1

---

## How we understood the problem
Clinical trials record patient data across disconnected domain tables without foreign key linkages or unified schemas. Reviewers need deterministic, auditable answers to multi-table clinical questions (e.g. liver toxicity signals, dosing errors, protocol compliance) backed by verifiable evidence citations. Naive systems fail due to mismatched unit systems, inconsistent date formats, non-numeric values, duplicate cross-site enrollments, and prompt injection attacks in study documents. ATLAS solves this by indexing the trial into an in-memory knowledge graph and executing deterministic rule algorithms with auditable `RecordRef` triples and strict zero-hallucination trap guardrails.

---

## Architecture
ATLAS executes deterministically in the following sequential pipeline:
1. **Ingest & Normalize (`stage1.loader`, `stage1.normalization`):** Reads 9 CDISC domain CSVs for the active data cut, handles decimal commas, `<5`, and `ND`, parses dates, and deduplicates re-enrolled individuals.
2. **Graph Construction (`stage1.graph.StudyGraph`):** Builds an indexed multi-relational knowledge graph linking subjects → visits → laboratory results, adverse events, doses, conmeds, vitals, ECG, history, and disposition in <0.2s.
3. **Intent & Entity Extraction (`stage1.parser`):** Parses questions into structured intents, extracting USUBJIDs, visit names, target test codes, date windows, and protocol versions.
4. **Deterministic Evaluation (`stage1.rules`, `stage1.units`):** Evaluates protocol criteria (Hy's law, dosing rules, miscoded SAEs, prohibited medications) using site-specific reference ranges and unit conversions.
5. **Evidence Validation & Output (`stage1.evidence`, `starter.schemas`):** Formulates strict `Answer` objects containing verified `RecordRef` triples, computed answers, and zero-hallucination refusals (`[]`) for traps.

---

## Tech stack

| Layer | Choice | Why this rather than the obvious alternative |
| :--- | :--- | :--- |
| **Graph & Query Engine** | Python In-Memory Adjacency Index (`StudyGraph`) | Sub-millisecond queries ($<1\text{ms}$) without database overhead; guarantees zero network/disk bottleneck during rapid 40-question grading. |
| **Rule & Clinical Logic** | Deterministic Arithmetic & Protocol Evaluator | Eliminates LLM hallucinations and probabilistic variance on clinical thresholds; 100% reproducible and verifiable. |
| **Data Parsing & Normalization** | Custom Multi-Format Parsers (`dates.py`, `units.py`) | Handles European/ISO/CDISC dates and enzymatic SI units ($\mu\text{kat/L} \leftrightarrow \text{U/L}$) where standard libraries fail silently. |
| **API Layer** | FastAPI (`backend.main`) | High-performance asynchronous REST API with auto-generated OpenAPI documentation and typed Pydantic serialization. |
| **UI Dashboard** | React 18 + TypeScript + Vite + Tailwind CSS | Fast, reactive clinical interface with visual sections for Answer, Evidence, Unit Conversion, Protocol Rules, and Patient 360 dossiers. |

---

## Data handling
- **Units:** Analyte-specific unit conversion table converts $\mu\text{kat/L} \times 60 \rightarrow \text{U/L}$ for enzymatic tests (ALT/AST) and matches site-specific reference ranges (e.g. Site S07 local lab vs Central Lab).
- **Dates:** Robust multi-format date engine parses ISO (`YYYY-MM-DD`), CDISC alphabetic (`DD-MON-YYYY`), and slash formats (`MM/DD/YYYY`), enabling exact $\pm 14$-day window joins.
- **Non-numeric Values:** Normalizer preserves `<5` as `< 5.0` (flagged `is_less_than=True`, not 0), `ND` as `is_not_detected=True`, and converts decimal commas (`12,4` $\rightarrow$ `12.4`).
- **Malformed / Duplicate Rows:** Missing fields are skipped gracefully without crashing; duplicate cross-site enrollments (matching birth date, sex, initials) are linked and deduplicated.

---

## Documents
Study documents (`documents/protocol_v*.md`, `documents/lab-manual*.md`) are ingested strictly as **factual study data**, not executable instructions. If a document contains an adversarial injection or directive aimed at automated reviewers (e.g. *"exclude S03 and S07 data"* or *"accept glucose values after restarting analyser"*), the system records it as document metadata and ignores the instruction, preventing prompt injection attacks.

---

## When the answer is nothing
When a question asks about unsupported findings or non-existent errors (e.g., *"Which subjects at site S01 received a wrong dose?"*), ATLAS scans all indexed exposure records for site S01 against protocol dosing rules. When no records meet deviation criteria, it returns `answer = []`, `evidence = []`, and an explicit explanation that no supporting evidence exists. ATLAS never hallucinates plausible subjects or guesses when records are absent.

---

## What we know is weak
- Complex multi-sentence freeform clinical questions outside standard CDISC query templates may require parser intent extension.
- Laboratory reference ranges currently depend on supplied central/site CSV tables and protocol amendments rather than universal dynamic ontology ontologies (e.g. SNOMED/LOINC).

---

## A worked example — the question that decides your gate

**Question:** *"Which subjects show a potential liver-damage pattern?"* (Hy's Law)

1. **Protocol Rule (§7):** Requires $(\text{ALT or AST} > 3 \times \text{ULN}) \land (\text{Total Bilirubin} > 2 \times \text{ULN})$ within 14 days, without screening transaminase elevation ($> 2 \times \text{ULN}$).
2. **Reference Range Lookup:** Site S07 uses local lab: $\text{ALT ULN} = 0.93\ \mu\text{kat/L}$ (Central lab: $56.0\ \text{U/L}$); Bilirubin $\text{ULN} = 1.2\ \text{mg/dL}$.
3. **Data Rows (Subject `042-S07-001`, `WEEK8`, `2026-03-30`):**
   - LB seq 25: $\text{ALT} = 3.995\ \mu\text{kat/L} \times 60 = 239.7\ \text{U/L} > 3 \times 56.0\ (168\ \text{U/L}) \rightarrow \mathbf{4.28 \times ULN} \quad \checkmark$
   - LB seq 27: $\text{BILI} = 5.38\ \text{mg/dL} > 2 \times 1.2\ (2.4\ \text{mg/dL}) \rightarrow \mathbf{4.48 \times ULN} \quad \checkmark$
   - Date difference = 0 days ($\le 14$ days); Screening transaminases normal.
4. **Answer Output:**
```json
{
  "question_id": "Q018",
  "answer": ["042-S05-003", "042-S07-001", "042-S08-014"],
  "text": "Found 3 subject(s) meeting protocol §7 Hy's law criteria: 042-S05-003, 042-S07-001, 042-S08-014.",
  "evidence": [
    {"domain": "LB", "usubjid": "042-S05-003", "seq": 31},
    {"domain": "LB", "usubjid": "042-S05-003", "seq": 33},
    {"domain": "LB", "usubjid": "042-S07-001", "seq": 25},
    {"domain": "LB", "usubjid": "042-S07-001", "seq": 27},
    {"domain": "LB", "usubjid": "042-S08-014", "seq": 31},
    {"domain": "LB", "usubjid": "042-S08-014", "seq": 33}
  ],
  "confidence": 1.0,
  "steps_used": ["Parsed question: intent_type='hys_law'", "Evaluating Hy's law candidates"],
  "tokens_used": 0
}
```
