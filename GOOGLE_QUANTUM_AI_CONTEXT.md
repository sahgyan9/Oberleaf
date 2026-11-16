# Google Quantum AI — Student Researcher Application Context

**Last Updated:** September 25, 2026  
**Primary Contact / PI:** Dr. Sergey Novikov (Experimental Quantum Physicist | Senior Research Scientist @ Google Quantum AI)  
**Applicant:** Gyan Kumar Sah (B.Sc. Physics Hons. with Research, SRM University-AP)  
**Job Listing:** [Google Careers — Student Researcher, BS/MS, Fall 2026 (Job ID 132362676918461126)](https://www.google.com/about/careers/applications/jobs/results/132362676918461126?e=72477625)  
**Active Working CV:** `C:\Users\sahgy\OneDrive\Documents\Oberleaf Projects\cv-google\main.tex`

---

## 1. Role & Mission Breakdown

### Sergey Novikov's Team Mission
> "My team is looking for a Student Researcher to build agentic workflows for superconducting digital and quantum electronics design.  
> The role focuses on integrating AI agents with specialized EDA pipelines (SPICE simulation, EM extraction, layout, verification) to automate and accelerate the co-design of superconducting digital logic and quantum circuits.  
> We are seeking currently enrolled graduate or undergraduate students in Electrical Engineering, Computer Science, or Physics with an understanding of circuit design and an interest in applying LLM agents to hardware engineering."

### Key Technical Pillars Required by the Team
1. **Superconducting Digital & Quantum Electronics Design**: Understanding of Josephson junctions, transmons, SFQ (Single Flux Quantum) / superconducting digital logic, coplanar waveguide (CPW) resonators, microwave feedlines, and circuit Hamiltonians.
2. **Specialized EDA Pipelines**:
   - **SPICE / Circuit Simulation**: Non-linear circuit dynamics, junction modeling, S-parameter simulation.
   - **EM Extraction**: Electromagnetic finite element / eigenmode analysis, capacitance matrix extraction, coupling rates ($g$), qubit anharmonicity ($\alpha$), cross-Kerr shifts ($\chi$).
   - **Layout & Verification**: Parametric geometric generation, ground plane meshing, DRC/LVS equivalents for superconducting planar circuits.
3. **Agentic AI & LLM Workflows for Hardware**:
   - Building multi-step agentic loops (orchestration, tool calling, execution harnesses, self-correction upon simulation failure).
   - Bridging probabilistic LLM planning with deterministic EDA solvers (Python APIs, netlist generation, parameter optimization loops).
   - Implementing anti-hallucination guardrails and ground-truth verification.

---

## 2. Applicant Profile & Unique Competitive Edge

Gyan Kumar Sah occupies the rare intersection of **hands-on cryogenic / microwave hardware**, **superconducting qubit EDA modeling**, and **disciplined production agentic AI orchestration**.

### A. Cryogenic Hardware & Laboratory Instrumentation
- **Low-Temperature Physics Lab (SRM-AP)**:
  - CryoCon 22C temperature controller setup with custom PID parameter tuning.
  - High-vacuum electrical feedthrough design down to $10^{-2}\text{ mbar}$.
  - Active cooling optimization with liquid nitrogen ($\text{LN}_2$) for 80 K – 300 K operation.
  - Python-based GUI instrument driver for automated temperature sweeps, ramp-rate control, and data acquisition over serial/GPIB.
- **Automated Instrument Multiplexing (Device Physics Lab)**:
  - Engineered an Arduino-controlled 4-channel shielded relay multiplexer to dynamically route signals between a Wayne Kerr Impedance Analyzer, Keithley 2636B SMU, and Zurich MFLI Lock-in Amplifier.
  - Eliminates manual cable swapping, prevents ground loops, and eliminates transient switching spikes.
- **Materials & Fabrication**:
  - RF sputtering (cobalt thin films on masked Hall-bar geometries), CVD of $\text{MoS}_2$ monolayer/thin films, XRD and XPS analysis, cleanroom additive manufacturing, and Fusion 360 parametric CAD.

### B. Superconducting Qubit & Quantum EDA Experience
- **Keysight ADS & QuantumPro Modeling (`c:\Users\sahgy\Downloads\SRM_Qubit_Design_wrk`)**:
  - Designed and analyzed single transmon qubit coupled to a CPW readout meander resonator on high-resistivity silicon substrate ($750\,\mu\text{m}$, $\varepsilon_r = 11.5$, $\tan\delta = 10^{-5}$).
  - Configured airbridge layers ($8\,\mu\text{m}$ standoff) and thin-film superconducting metallization ($200\text{ nm}$).
  - Executed QuantumPro EM eigenmode simulation and electromagnetic flow: extracted resonant frequencies, transmon anharmonicity ($\alpha$), qubit-resonator coupling strength ($g$), and cross-Kerr coefficients.
  - Familiarity with circuit parameter extraction, layout generation from schematics, and automated simulation scripting.

### C. Agentic AI & Systems Engineering (WAT Architecture)
- **18+ Months Directing Autonomous AI Coding Agents**:
  - Over 1,300 commits directing AI agents (Claude Code, Antigravity/Gemini 3.8 Flash, Lovable) across production codebases (`friendly-learning-srmap`, `Oberleaf`).
  - Pioneer of the **WAT (Workflows, Agents, Tools)** paradigm: separating probabilistic LLM reasoning (Agents) from deterministic SOPs (`workflows/`) and validated execution scripts (`tools/`).
- **RAG & Vector Architecture (CampusBrain)**:
  - Engineered production semantic search using Google Gemini embeddings (`gemini-embedding-001`, 768-dim) and Supabase Postgres `pgvector` with cosine similarity.
  - Enforced deterministic pre-LLM resolvers (date arithmetic, timetable queries) before LLM summarization to eliminate hallucination.
- **Local-First Developer Tooling (Oberleaf)**:
  - Directed architecture of an open-source, local-first LaTeX IDE with sub-second compilation, KaTeX real-time preview, SyncTeX jump-to-source, and automated diagnostic resolution.

### D. Quantum Technical Leadership & Community
- **Head of Technical & Innovation Track — IBM Qiskit Fall Fest 2026 (SRM-AP)**:
  - Status: Official IBM Quantum Partner Plus Host.
  - Architected a 59-event technical portfolio:
    - **Online Virtual Phase (Oct 5–13, 2026)**: 10-session masterclass series covering Low-Level Control & Pulse Engineering (Qiskit Pulse microwave drive scheduling, DRAG correction, qubit frequency tuning), Hardware Calibration & Transpilation Pipelines (QISKIT 102), and Quantum Error Mitigation.
    - **Campus Phase (Oct 26–30, 2026)**: Flagship 24-hour hackathon, Hardware Quantum Tech Expo, and Hardware Circuit Optimization Challenge.
- **Amaravati Quantum Valley Hackathon**:
  - Designed two-layer quantum key distribution protocol (BB84 + QRNG adaptive authentication) simulated in Qiskit with QBER eavesdropper detection.

---

## 3. CV Tweaking Strategy for Sergey Novikov & Google Quantum AI

### Primary Alignment Goal
Reframe the "Personal Projects" / "Web Development" section of `cv-google/main.tex` into an **Agentic AI & Systems Engineering** section, while tightening the connection between agentic software pipelines and hardware/EDA automation.

### Section-by-Section CV Refinements

1. **Section Title**:
   - Change `\section{Web Development -- Personal Project}`  
     $\rightarrow$ `\section{Agentic AI Systems \& Automation}` (or `\section{Agentic AI \& Software Engineering}`)
2. **Project Entries**:
   - **Friendly Learning SRMAP**:
     - *Focus*: Orchestrated multi-agent autonomous coding pipelines (1,300+ commits), deterministic tool harnesses, and RAG architectures. Emphasize how deterministic scripts wrap database/API tools so agents plan while tools execute—the exact pattern needed to wrap SPICE/EM EDA tools.
   - **Oberleaf**:
     - *Focus*: Local-first compiler tooling, real-time diagnostic AST parsers, error-recovery loops, and automated toolchains.
   - **Automated Instrument & Cryo DAQ Workflows**:
     - Highlight the Python automation of the CryoCon 22C and the 4-channel Arduino routing switch as an end-to-end autonomous test and measurement pipeline.
3. **Quantum Experience Update**:
   - Update the **IBM Qiskit Fall Fest 2026** entry with exact dates and technical tracks:
     - Online Masterclass Phase (Oct 5–13, 2026): Low-level microwave pulse engineering, DRAG correction, hardware calibration pipelines.
     - Campus Phase (Oct 26–30, 2026): Flagship hackathon & hardware optimization.
4. **Google Careers Formal Requirement**:
   - Verify anticipated graduation date is clearly formatted: `Expected: 05/2027` (May 2027) per Google Job ID 132362676918461126 specifications.
   - List programming proficiencies prominently: Python, C/C++, TypeScript, LabVIEW.

---

## 4. Local Project Directory Reference Index

| Project Name | Path | Key Relevance to Google Quantum AI |
| :--- | :--- | :--- |
| `cv-google` | `C:\Users\sahgy\OneDrive\Documents\Oberleaf Projects\cv-google` | Active LaTeX source and compiled PDF for Google Quantum AI application. |
| `SRM_Qubit_Design_wrk` | `c:\Users\sahgy\Downloads\SRM_Qubit_Design_wrk` | Keysight ADS & QuantumPro transmon + CPW resonator simulation, EM flow, Hamiltonian extraction. |
| `QisKit-Fall-Fest-2026` | `c:\Users\sahgy\Downloads\QisKit-Fall-Fest-2026` | Technical documentation and codebase for IBM Qiskit Fall Fest 2026 (59 events, pulse engineering, hackathons). |
| `Cryocon_22C_Temperature_Controller` | `c:\Users\sahgy\Downloads\Cryocon_22C_Temperature_Controller_Python-File` | Cryogenic temperature automation, PID tuning, Python GUI, LN2 cooling control. |
| `friendly-learning-srmap` | `c:\Users\sahgy\Downloads\friendly-learning-srmap` | 1,300+ commits directing AI agents; WAT framework; Gemini RAG vector search; anti-slop guidelines. |
| `overleaf-copy` (Oberleaf) | `c:\Users\sahgy\Downloads\overleaf-copy` | Local-first LaTeX engine, agent-directed development, real-time KaTeX/SyncTeX integration. |
| `Shakti Photon Solutions` | `c:\Users\sahgy\Downloads\shakti-photon-solutions` | Hardware CAD/CAM (Fusion 360, CNC milling, 3D printing), Arduino sensor integration, IIT Delhi installation. |
