/** Policy / employee `role` keys aligned with org segments (see `components/org-risk-map.tsx`). */
export const ORG_CHART_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "employee", label: "Individual contributor (default)" },
  { value: "leadership", label: "Leadership / executive" },
  { value: "product_eng", label: "Product & engineering" },
  { value: "gtm", label: "Go-to-market (sales / marketing)" },
  { value: "customer", label: "Customer success / support" },
  { value: "corporate", label: "Corporate (HR / finance / legal / ops)" },
  { value: "other", label: "Other / unassigned segment" },
];
