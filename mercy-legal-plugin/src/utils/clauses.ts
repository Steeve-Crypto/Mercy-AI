import { Clause } from "../types";

export const dcClauseLibrary: Clause[] = [
  {
    id: "dc-governing-law",
    title: "DC Governing Law",
    category: "Core Terms",
    jurisdictionNote: "District of Columbia law and forum alignment",
    text: "This Agreement shall be governed by and construed in accordance with the laws of the District of Columbia, without regard to conflict-of-law principles. The parties consent to the exclusive jurisdiction and venue of the courts located in the District of Columbia for any action arising out of or relating to this Agreement."
  },
  {
    id: "notice",
    title: "Notice",
    category: "Operations",
    jurisdictionNote: "Clear delivery and receipt timing",
    text: "All notices under this Agreement must be in writing and delivered by hand, nationally recognized overnight courier, certified mail, or email with confirmation of transmission. Notices are deemed received upon delivery, refusal of delivery, or one business day after confirmed email transmission."
  },
  {
    id: "proportional-indemnity",
    title: "Proportional Indemnity",
    category: "Risk Allocation",
    jurisdictionNote: "Narrower, attorney-review-friendly risk shifting",
    text: "Each party shall indemnify, defend, and hold harmless the other party from third-party claims, damages, liabilities, and reasonable attorneys' fees to the extent arising from the indemnifying party's breach, negligence, or willful misconduct."
  },
  {
    id: "fees",
    title: "Attorneys' Fees",
    category: "Disputes",
    jurisdictionNote: "Designed for clear fee recovery language",
    text: "In any action to enforce this Agreement, the prevailing party may recover its reasonable attorneys' fees and costs, subject to the discretion of the court and applicable District of Columbia law."
  }
];
