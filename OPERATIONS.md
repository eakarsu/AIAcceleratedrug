# Operations and clinical-use boundary

Startup is non-destructive and only launches prepared processes. Bootstrap, versioned migration, and confirmation-gated demo fixtures are separate operations.

Only authentication, health, and governed evidence workflows are supported by default. Historical generated/model routes return `410 prototype_route_quarantined`. They can be inspected with an explicit local `ENABLE_LEGACY_PROTOTYPE_ROUTES=true`; production runtime validation refuses that setting.

`/api/evidence-workflows` accepts pseudonymous subjects and curated, revisioned, checksum-backed sources. It rejects direct identifiers, records interaction-risk counts and uncertainty, and requires an independent professional reviewer, credential reference, rationale, and attestation. Its terminal state is `reviewed_for_research`, never “clinically approved.” The response states that it is research decision support and cannot diagnose, prescribe, or trigger autonomous clinical action.

Biomedical source credentials, governed clinical-system access, expert-reviewed evaluation cases, subgroup validation, consent governance, and reviewer credential verification remain external institutional responsibilities. Model output is not accepted as evidence provenance.
