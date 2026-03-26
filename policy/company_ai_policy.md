# Acme Corp — Artificial Intelligence Usage Policy

**Version 1.0 | Effective Date: January 1, 2026**
**Enforced by: Sentinel AI Security Supervisor**

---

## 1. Purpose

This policy governs the use of artificial intelligence tools by all Acme Corp employees. It exists to protect company data, ensure regulatory compliance (SOC2, GDPR, CCPA), and maximize the safe, productive use of AI.

## 2. Scope

This policy applies to:
- All employees, contractors, and temporary staff
- All AI tools including but not limited to: ChatGPT, Claude, Gemini, Copilot, Midjourney, and any other generative AI service
- All company data regardless of classification level

## 3. Approved AI Tools

| Tool | Approved For | Restrictions |
|------|-------------|--------------|
| Claude (Anthropic) | All departments | Enterprise plan only |
| GitHub Copilot | Engineering | Code only, no secrets |
| ChatGPT (OpenAI) | Marketing, Sales | No customer data |
| Midjourney | Design | No confidential materials |

**All other AI tools are unauthorized.** Using unauthorized tools constitutes "Shadow AI" and will be flagged by Sentinel.

## 4. Data Classification and AI Usage

### 4.1 Prohibited Data (NEVER share with AI tools)
- Social Security Numbers (SSN)
- Credit card numbers or financial account details
- Passwords, API keys, tokens, or authentication credentials
- Protected Health Information (PHI)
- Customer personally identifiable information (PII) without anonymization
- Trade secrets or confidential intellectual property
- Internal security configurations or network architecture details
- Board meeting minutes or M&A information
- Employee performance reviews or salary data

### 4.2 Restricted Data (Approved tools only, with redaction)
- Customer names and contact information (must be anonymized)
- Internal project codenames
- Revenue figures or financial projections
- Source code from proprietary repositories
- Vendor contracts or partnership details

### 4.3 Permitted Data
- Publicly available information
- Generic business writing and communication
- Open source code
- Marketing copy for public consumption
- General research questions

## 5. Role-Based Rules

### 5.1 Engineering
- MAY use AI for code generation, debugging, documentation
- MUST NOT paste production credentials, database connection strings, or internal API endpoints
- MUST NOT share proprietary algorithms or patented code
- MAY use GitHub Copilot within approved IDE configurations

### 5.2 Sales and Marketing
- MAY use AI for email drafting, content creation, market research
- MUST NOT include customer names, deal sizes, or pipeline data
- MUST NOT share competitive analysis documents
- MAY use ChatGPT for general content with approval

### 5.3 Human Resources
- MUST NOT use AI for any employee data processing
- MAY use AI for general policy drafting and template creation
- MUST NOT share interview notes, performance data, or salary information

### 5.4 Finance
- MUST NOT use AI for any financial data processing
- MAY use AI for general research and template creation
- MUST NOT share revenue figures, projections, or audit findings

### 5.5 Executive Leadership
- Subject to all restrictions above
- Additional restrictions on M&A, board, and strategic planning data
- All AI usage logged and reviewed quarterly

## 6. Enforcement Actions

Sentinel automatically enforces this policy with the following actions:

| Severity | Action | Example |
|----------|--------|---------|
| **Low** | Allow + Log | Using AI for general research |
| **Medium** | Allow + Warn + Coach | Borderline content, minor policy gap |
| **High** | Auto-Redact + Notify Manager | PII detected, automatically redacted |
| **Critical** | Block + Alert Security Team | Secrets, credentials, or mass data exposure |

## 7. Shadow AI Policy

- Use of unauthorized AI tools is prohibited
- Sentinel monitors for connections to known AI services not on the approved list
- First offense: coaching and education
- Repeat offense: manager notification
- Pattern of violations: security team review

## 8. Employee Responsibilities

1. Review this policy annually (training provided by Sentinel)
2. When in doubt, ask before sharing data with AI
3. Report any AI security concerns to security@acmecorp.com
4. Accept and act on coaching provided by Sentinel
5. Use the approved tools list — do not seek workarounds

## 9. Compliance Mapping

| Requirement | Sentinel Coverage |
|------------|-------------------|
| SOC2 — Access Controls | Role-based policy enforcement |
| SOC2 — Monitoring | Full prompt logging and analysis |
| GDPR — Data Minimization | Auto-redaction of personal data |
| GDPR — Right to Erasure | Prompt data retention controls |
| CCPA — Consumer Rights | PII detection and blocking |
| HIPAA — PHI Protection | Healthcare data pattern detection |

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-01 | Initial policy |
