# Varia pilot: transaction alert investigations

## Pilot customer and decision

Target a small or mid-sized payments company with an existing transaction-monitoring alert queue, 2–3 investigators, and a compliance manager who can review cases. Test one workflow: investigating transaction alerts from intake through a documented analyst disposition. Use historical, de-identified cases in a separate pilot environment. The institution's existing process remains the system of record during the pilot.

The decision at the end is whether Varia improves investigation efficiency **without reducing decision or evidence quality** enough to justify a paid, limited production rollout. This is a proposed pilot design; no customer, real data, or pilot results have been obtained yet.

## Before the pilot

1. Confirm the customer's jurisdiction, permitted data use, retention period, security review, and whether AI processing is allowed. Keep `OPENAI_DATA_SHARING_ENABLED=false` until the customer explicitly approves the exact data flow. Do not import live customer data into the synthetic demo workspace.
2. Select 40–60 closed historical alerts from the target workflow. Include routine closures, escalations, information requests, and difficult or ambiguous cases. Exclude cases whose use is restricted. De-identify and map them to Varia's customer and transaction ingestion schema. Record missing fields and import failures.
3. Have a compliance reviewer create a reference assessment for each case from the complete original record. The reviewer should be independent of the pilot analyst and should not see Varia's recommendation before writing the assessment. Record the expected disposition, required evidence, and any critical issue that must be detected. These are review references, not automatic ground truth.
4. Assign comparable cases to the existing workflow and Varia, balancing by case type, severity, and complexity. Rotate analysts between workflows. Do not have the same analyst review the same case twice. Record the assignment before work begins.
5. Train analysts on both workflows and run a few practice cases that are excluded from measurement. Start the timed set only after basic usage issues are resolved.

## Capture one row per case

Copy `case-results.csv` and fill it in for every assigned case. Use a pseudonymous `case_id`; keep the ID mapping with the customer. The pilot lead records `workflow`, `case_type`, `complexity`, and `reference_disposition` before the analyst begins. The analyst records active minutes spent reviewing and writing the decision, excluding breaks and waiting for another person. The independent reviewer fills in `decision_quality`, `evidence_quality`, `critical_miss`, and `unsupported_ai_claim` after seeing the completed case. Use `notes` for unexpected issues, including unavailable data or failed imports. Do not put customer names, account details, or free-text case evidence in this file.

Rubric for `decision_quality` and `evidence_quality`: `0` = unsafe or absent, `1` = materially incomplete, `2` = acceptable with minor gaps, `3` = complete and well supported. A `critical_miss` is failure to notice or escalate a material concern identified in the reference assessment. An `unsupported_ai_claim` is a material factual claim in AI output that cannot be traced to supplied evidence. Record `ai_used=false` for the synthetic fallback; it is not an evaluation of a real model.

Varia's current Analytics page reports elapsed time for **generation of an investigation**, not analyst handling time. Do not use that number as the pilot's time-saved measure. Existing audit events can help reconcile case opens and decisions, but the active-time field in this worksheet is the pilot measure.

## Weekly scorecard

Calculate the following separately for each workflow and by case type. Compare like cases and report the sample size; do not present a small pilot's results as a validated detection rate.

| Measure | Calculation | Proposed success gate |
| --- | --- | --- |
| Analyst time | Median `active_minutes` from case review through written disposition | Varia median at least 20% lower on comparable cases |
| Decision quality | Share of cases with `decision_quality >= 2` | No lower than the existing workflow |
| Evidence quality | Share of cases with `evidence_quality >= 2` | No lower than the existing workflow |
| Critical misses | Count of `critical_miss=true`, reviewed case by case | No new material misses attributable to Varia |
| Unsupported AI claims | Count of `unsupported_ai_claim=true` among real-AI cases | Every occurrence reviewed and addressed before expansion |
| Import completeness | Imported cases with required fields / attempted cases | At least 95%; investigate every failure |
| Analyst adoption | Completed Varia assignments / assigned Varia cases | At least 90%, with reasons for skipped cases |

These thresholds are **pilot hypotheses**, not regulatory standards. If decision or evidence quality drops, stop expansion even if time improves. Record analyst feedback on missing context and duplicate work; interview the compliance manager about whether Varia's export and audit trail are useful in their review process.

## Pilot sequence

- **Week 0:** Recruit one design partner; agree on data use and success criteria; obtain sample records; map fields and complete security review.
- **Week 1:** Import and reconcile sample cases; create independent reference assessments; train analysts; freeze assignment and rubric.
- **Weeks 2–3:** Run the timed, randomized comparison. Review data quality and safety issues at least twice weekly.
- **Week 4:** Review the scorecard with analysts and the compliance manager. Record defects, needed integrations, and a decision to stop, repeat with fixes, or negotiate a limited paid rollout.

## Current Varia gaps to resolve for a production pilot

The current ingestion endpoints are create-only for customers, accept transactions one at a time, and create alerts from Varia's own risk signals. A customer-supplied historical alert queue may need an import adapter and reconciliation before this comparison is possible. The app has no SSO, verified KYC or sanctions integration, external audit archive, or customer profile update flow. The synthetic fallback is for demos only. These gaps must be reviewed with the pilot customer rather than treated as completed controls.

## What is needed to start

A named pilot organization and decision maker, permission to use historical cases, an approved data-handling arrangement, an analyst group, and a de-identified sample. Until those exist, this document is a ready-to-run pilot protocol rather than a completed pilot.
