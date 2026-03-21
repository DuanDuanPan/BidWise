# Reference: Pre-Sales Proposal Writing SOP

**Created:** 2026-03-16
**Based on:** Industry research + user domain expertise

## SIPOC Overview

| Element       | Content                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suppliers** | Client (RFP/requirements), Sales team (client relationship/intel), Product/R&D (technical capabilities), Delivery team (project history), Market team (industry insights/competitor intel)                                                                                                                                                                                |
| **Inputs**    | RFP/tender document, Client communication records (meeting notes/emails/WeChat), Scoring criteria/evaluation method, Company product manuals/tech docs, Historical winning proposal library, Asset library (architecture diagrams/prototypes/tables), Competitor intelligence, Industry standards/regulations, Company Word templates, **Base product capability matrix** |
| **Process**   | 6-phase workflow (see below)                                                                                                                                                                                                                                                                                                                                              |
| **Outputs**   | Technical proposal (Word), Presentation PPT, Pricing/quotation table, Implementation plan, Compliance statement, Review records                                                                                                                                                                                                                                           |
| **Customers** | Client evaluation committee, Client business departments, Client IT/technical department, Client leadership/decision makers                                                                                                                                                                                                                                               |

## ICOM View (Input/Control/Output/Mechanism)

| Element               | Description                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**             | RFP, Client communication materials, Scoring criteria, Competitor intel, Base product capabilities                                                                                          |
| **Control**           | Submission deadline, Scoring weight allocation, Compliance requirements (format/qualifications), Company pricing strategy, Confidentiality requirements, **4号文 cost estimation standard** |
| **Output**            | Technical proposal docx, Presentation PPT, Pricing files, Compliance matrix                                                                                                                 |
| **Mechanism/Enabler** | Pre-sales engineers, Product/R&D SMEs, Proposal template library, Asset library (diagrams/cases/tables), Collaboration tools (Word/draw.io), Knowledge base                                 |

## 6-Phase Standard Workflow

```
Phase 1       Phase 2       Phase 3       Phase 4       Phase 4.5           Phase 5       Phase 6
Go/No-Go  --> Analysis  --> Design    --> Writing   --> Cost & Pricing --> Review    --> Deliver & AAR
(Decision)    (Recon)       (HQ)         (Main Force)  (Logistics)        (Red-Blue)    (After Action)
                                              ↕
                                         Bi-directional adjustment
```

### Phase 1: Go/No-Go Decision

| Item             | Content                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| **Input**        | Tender announcement/RFP, Client relationship assessment, Competitor info                                  |
| **Roles**        | Sales manager, Pre-sales director, Management                                                             |
| **Activities**   | Assess win probability, Analyze scoring criteria weights, Evaluate resource investment, Decide bid/no-bid |
| **Controls**     | Company bidding strategy, Resource availability, Historical win rate data                                 |
| **Output**       | Go/No-Go decision, Project charter, Bidding plan (reverse timeline)                                       |
| **Key Judgment** | Client relationship depth, Technical fit, Competitor strength, Profit margin                              |

### Phase 2: Requirements Analysis (Reconnaissance)

| Item              | Content                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**         | Full RFP text, Evaluation method, Client communication records, Industry background                                                                                        |
| **Roles**         | Pre-sales engineer (lead), Sales (client intel provider)                                                                                                                   |
| **Activities**    | Interpret RFP technical requirements, Extract scoring criteria, Identify explicit vs implicit requirements, Mark "fog areas" (uncertain requirements), Competitor analysis |
| **Controls**      | Submission deadline, Client communication channel availability                                                                                                             |
| **Output**        | Requirements analysis checklist, Scoring criteria model, Requirements coverage matrix draft, Proposal strategy (seed)                                                      |
| **Best Practice** | ~80% requirements from RFP, ~20% implicit from client communication — this 20% determines if proposal has "soul"                                                           |

### Phase 3: Solution Design (Command HQ)

| Item              | Content                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**         | Requirements analysis checklist, Scoring criteria model, Company product capabilities, Historical proposal library                           |
| **Roles**         | Pre-sales engineer (lead), Solution architect, Product manager                                                                               |
| **Activities**    | Determine overall architecture, Select technical route, Design chapter outline, Assign writing tasks, Hold proposal discussion meeting       |
| **Controls**      | Scoring weights drive resource allocation (higher-weight chapters get more effort)                                                           |
| **Output**        | Proposal outline (TOC structure), Architecture design draft, Chapter assignment table, Asset reference list                                  |
| **Best Practice** | "First present big picture for client understanding, then expand module details"; Mapping client needs to solution is the most critical step |

### Phase 4: Proposal Writing (Main Force)

| Item              | Content                                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**         | Proposal outline, Architecture design, Asset library materials, Product documentation, Historical proposal fragments                                                   |
| **Roles**         | Pre-sales engineer (lead author), Chapter SMEs (technical input), UI/diagram design                                                                                    |
| **Activities**    | Write proposal body by chapter, Draw/reuse architecture diagrams, Insert product screenshots/prototypes, Compile data tables, Ensure cross-chapter logical consistency |
| **Controls**      | Company Word template standards, Scoring criteria weights, Reverse timeline                                                                                            |
| **Output**        | Technical proposal draft (V1.0)                                                                                                                                        |
| **Best Practice** | Reuse standard materials ~80%, customize ~20%; Three-audience awareness (business dept/CIO/technical staff); Mark all documents with client name before sending        |

### Phase 4.5: Cost Estimation & Pricing (Logistics)

| Item                     | Content                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**                | Technical proposal draft (architecture/tech route/deployment), Implementation plan, **Base product capability matrix**, Historical project cost data                                                                                                                                                                                                                                                              |
| **Roles**                | **Commercial manager/Pricing specialist** (lead), Pre-sales engineer (technical input), Project manager (effort estimation), Product manager (license pricing), Finance (cost accounting), Management (profit approval)                                                                                                                                                                                           |
| **Activities**           | **GAP analysis: Proposal requirements vs Base product capabilities**, Identify customization work items, Estimate effort using **4号文 (scientific cost estimation standard)** based on function points/work hours, Calculate cost baseline and profit margin, Formulate pricing strategy (high/medium/low options), Bi-directional adjustment with technical proposal (if price exceeds budget, adjust proposal) |
| **Controls**             | Client budget range (if known), Company minimum profit rate, Competitor pricing reference, Price score weight and calculation rules in evaluation                                                                                                                                                                                                                                                                 |
| **Output**               | Bid pricing table, Cost breakdown (internal), Pricing strategy document, Proposal-pricing adjustment recommendations                                                                                                                                                                                                                                                                                              |
| **Key Logic**            | Base product → GAP with proposal requirements → Customization workload → Scientific cost estimation per 4号文 → Pricing                                                                                                                                                                                                                                                                                           |
| **Critical Pain Points** | Proposal-pricing disconnect, Effort estimation by gut feel, Price score game theory, Lack of quantified cost-vs-score tradeoff                                                                                                                                                                                                                                                                                    |

### Phase 5: Review & Polish (Red-Blue Confrontation)

| Item              | Content                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**         | Technical proposal draft, Scoring criteria, Requirements coverage matrix, Pricing alignment                                                                                                                           |
| **Roles**         | Pre-sales director (review), Technical experts (technical review), Commercial (compliance review), Quality (format review)                                                                                            |
| **Activities**    | Internal review meeting, Item-by-item RFP coverage check, Technical accuracy and consistency check, Format compliance check (headers/fonts/page numbers), Score estimation, Iterative revision (typically 2-3 rounds) |
| **Controls**      | Review checklist, Score simulation, Compliance requirements                                                                                                                                                           |
| **Output**        | Final technical proposal, Compliance check report, Review records, PPT presentation version                                                                                                                           |
| **Best Practice** | Reserve 2-3 days minimum for review iterations; Use "red team perspective" — if you were competitor/evaluator, how would you find flaws                                                                               |

### Phase 6: Delivery & Archive (After Action Review)

| Item              | Content                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**         | Final proposal, Bid result (win/loss), Evaluation feedback (if available)                                                                                                   |
| **Roles**         | Pre-sales engineer, Sales, Pre-sales director                                                                                                                               |
| **Activities**    | Print/bind/submit proposal, Track results post-submission, Retrospective analysis (win/loss reasons), Archive excellent fragments to asset library, Update competitor intel |
| **Controls**      | Company knowledge management policy                                                                                                                                         |
| **Output**        | Archived proposal, AAR retrospective report, Asset library updates, Lessons learned records                                                                                 |
| **Best Practice** | Do retrospective regardless of win/loss; Collect evaluation scoring details to feed back into scoring knowledge base                                                        |

## Mapping SOP to Product Features

| SOP Phase                | Current Pain Point                                               | Product Solution                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Go/No-Go              | Decision by gut feel, no data support                            | Win rate prediction + "bid/no-bid" recommendation (Vision)                                                                            |
| 2. Requirements Analysis | Manual RFP interpretation, time-consuming, easy to miss items    | RFP parsing + scoring criteria auto-extraction + fog map                                                                              |
| 3. Solution Design       | Outline depends on individual experience                         | Template-driven structure + intent-driven seed system                                                                                 |
| 4. Proposal Writing      | Most time-consuming phase (80% reuse + 20% manual customization) | Stems Agent generation + asset library retrieval + auto architecture/prototype diagrams                                               |
| 4.5. Cost & Pricing      | **Proposal-pricing disconnect; effort estimation by gut feel**   | **GAP analysis (proposal vs base product) + historical cost database + pricing strategy simulator + cost-vs-score tradeoff analysis** |
| 5. Review & Polish       | Manual review meetings, limited perspectives                     | Multi-dimensional adversarial matrix + annotation collaboration + real-time scoring dashboard                                         |
| 6. Deliver & AAR         | Rarely do retrospectives, experience not accumulated             | One-click docx export + automated AAR + asset library community contribution                                                          |

## Key User Insight (from domain expert)

**Cost estimation is NOT from-scratch calculation.** The company has a base product. Cost estimation = analyzing the GAP between proposal requirements and base product capabilities → calculating customization workload → applying 4号文 scientific estimation methodology → deriving cost and pricing. This means the system must maintain a **"base product capability baseline"** that auto-annotates which features are "product-built-in" vs "requires custom development" and auto-estimates GAP cost.
