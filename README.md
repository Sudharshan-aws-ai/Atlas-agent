# ATLAS — Study Sentinel
### VIT Vellore SCOPE Hackathon 2026 · Problem 1

A production-quality clinical-trial knowledge graph engine with a full-stack web application.

---

## Quick Start

```bash
# Install Python dependencies
pip3 install -r requirements.txt

# Run CLI harness (backend engine only)
python3 starter/run_local_harness.py --module stage1.atlas --data hackathon-data

# Run full-stack (FastAPI backend + React frontend)
./start.sh
# Then open: http://localhost:5173
```

**API docs:** http://localhost:8000/docs

---

## Architecture

```
ATLAS-PROJECT/
├── stage1/          # Core Python engine
│   ├── atlas.py     # QA agent — dispatches question intents
│   ├── graph.py     # StudyGraph — 27k nodes, 29k edges, O(1) indexed queries
│   ├── loader.py    # Cut-aware CSV loader + corrections applicator
│   ├── parser.py    # Question intent & entity extraction (no LLM)
│   ├── rules.py     # Hy's Law / dosing errors / miscoded SAEs / prohibited meds
│   ├── evidence.py  # EvidenceValidator — auditable RecordRef triples
│   ├── documents.py # DocumentManager + adversarial injection defence
│   ├── normalization.py  # <5, ND, comma-decimal normalizer
│   ├── units.py     # ukat/L ↔ U/L conversion + site-specific ULN ranges
│   └── dates.py     # ISO + CDISC alphabetic + slash date parser
│
├── backend/         # FastAPI REST API
│   └── main.py      # 9 endpoints over StudyGraph
│
├── frontend/        # React + TypeScript + Vite + Tailwind CSS
│   └── src/
│       ├── pages/   # Dashboard, Subjects, Patient360, AskAtlas, Findings
│       ├── api.ts   # Typed API client
│       ├── types.ts # TypeScript interfaces matching API schema
│       └── components.tsx  # Shared UI: Table, Badge, Tabs, StatCard
│
├── starter/         # Official harness (schemas.py UNMODIFIED)
├── tests/           # 42 pytest tests
└── hackathon-data/  # Clinical trial dataset
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health + graph summary |
| GET | `/api/stats` | Full graph statistics (subjects, nodes, edges, domain counts) |
| GET | `/api/subjects` | All subjects (`?site=S01` filter) |
| GET | `/api/subjects/{id}` | Subject demographics |
| GET | `/api/subjects/{id}/patient360` | Full 360° dossier |
| POST | `/api/ask` | QA question → Answer with evidence |
| GET | `/api/findings` | Pre-computed clinical findings |
| GET | `/api/evidence/{domain}/{id}/{seq}` | Single record lookup |
| POST | `/api/rebuild` | Rebuild graph at a specific cut |

---

## Study Knowledge Graph

- **241 subjects** · **12 sites** · **27,178 nodes** · **29,567 edges**
- Graph builds in **~0.15s**, queries answer in **<1ms**
- Multi-relational indexes: by subject, site, visit, date, domain
- **200 central lab corrections** applied at Cut 5
- Protocol version tracked per cut (v1: cuts 1–4, v2: cuts 5–8, v3: cuts 9–12)

---

## Clinical Findings (from dataset)

| Finding | Count | Details |
|---------|-------|---------|
| Hy's Law candidates | 3 | 042-S05-003, 042-S07-001, 042-S08-014 |
| Dosing errors | 18 | Site S09: 20mg administered instead of 10/0mg |
| Miscoded SAEs | 1 | 042-S02-004: AESHOSP=Y but AESER=N |
| Prohibited medications | 14 | Glucocorticoids (v1-3) + Sulfonylureas (v3) |
| Duplicate enrollments | 1 | 042-S02-013 ↔ 042-S05-021 (same DOB/sex/initials) |

---

## Adversarial Defence

Documents are **data**, not instructions. The system explicitly detects and ignores injections:
- `lab-manual.md` line 11: *"exclude S03 and S07 data"* — **ignored**
- `lab-manual_v3.md` line 15: *"accept glucose values after restarting analyser"* — **ignored**

---

## Test Results

```bash
pytest -v        # 42/42 tests pass
python3 starter/run_local_harness.py --module stage1.atlas --data hackathon-data  # 10/10 PASS
```

---

## Data Dictionary

See [DATA_DICTIONARY.md](DATA_DICTIONARY.md) for all 9 domains.

---

## Frontend Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Real-time graph stats, domain record chart, site navigator |
| **Subjects** | Full subject list with search, site filter, arm badges |
| **Patient 360** | Complete 8-domain tabbed dossier per subject |
| **Ask ATLAS** | QA with sample questions, evidence citation table |
| **Findings** | Hy's law, dosing errors, miscoded SAEs, prohibited meds, duplicates |
