# Mercy Blueprint Alignment

## Product Identity

- Product: Mercy
- Core: Mercy Shared Intelligence Core
- Market: D.C. appellate and administrative lawyers, starting with solo and
  boutique firms.
- Positioning: affordable D.C.-native alternative to enterprise legal AI.

## One Brain, Two Windows

- Brain: FastAPI app in `main.py`.
- Heavy lifter: standalone platform at `/dashboard`.
- Drafting sidekick: Word add-in scaffold in `word_plugin/`.

## Implemented From Blueprint

- Bridge into existing `legal_discovery_ai` without replacing its source.
- D.C. Clerk OS prompt.
- Rule 28/32 guardrail middleware.
- Ethics Opinion 388 human-review and billing notes.
- Matter context shared between dashboard and Word taskpane.
- Premium billing report endpoint.
- Zero-retention local-development posture with in-memory matter state.

## Next Product Gaps

- True multi-document administrative record indexing.
- Bates and record-citation anchoring.
- Citation verification against official court PDFs and source links.
- Authentication, user identity, and Stripe.
- Production HTTPS Word add-in hosting.
- Encrypted persistence option for premium case projects.
