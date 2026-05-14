# Mercy AI SOC 2 Type 1 Readiness Statement for Beta Users

Mercy AI is preparing for SOC 2 Type 1 readiness. Mercy AI is not currently SOC 2 certified and has not completed an independent SOC 2 examination.

For the limited beta, Mercy AI has implemented practical controls intended to protect D.C. attorney workflows:

- Tenant-scoped matter, RAG, checkpoint, quota, and audit records.
- Audit logging for matter access, document generation, RAG retrieval, LLM calls, and data deletion requests.
- Security headers, explicit CORS allow-listing, rate limiting, and HTTPS enforcement support.
- PII redaction and sanitization hooks before LLM and RAG processing.
- PostgreSQL/pgvector persistent storage as the primary backend, with local memory fallback only for local development.
- A “Delete all my data” flow that soft-deletes matter records and purges or deactivates tenant-scoped transient records.

Mercy AI is an AI-assisted legal drafting and research tool. Outputs require attorney review and verification before use. Attorneys remain responsible for confidentiality, competence, supervision, citation accuracy, and compliance with the D.C. Rules of Professional Conduct.

Before production use beyond beta, Mercy AI will complete legal review of customer documents, formalize security policies, validate backup and recovery controls, review vendors, and collect audit evidence for an independent SOC 2 Type 1 assessment.
