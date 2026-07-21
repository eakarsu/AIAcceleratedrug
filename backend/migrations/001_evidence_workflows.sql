BEGIN;
CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'researcher',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE users SET tenant_id = 'legacy-' || id::text WHERE tenant_id IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'researcher';
CREATE TABLE IF NOT EXISTS evidence_workflows(
 id BIGSERIAL PRIMARY KEY,tenant_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('assembled','pending_professional_review','reviewed_for_research','rejected','failed')),
 input JSONB NOT NULL,assessment JSONB NOT NULL,failure_code TEXT,created_by TEXT NOT NULL,
 reviewed_by TEXT,review_rationale TEXT,credential_reference TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_evidence_workflow_tenant_status ON evidence_workflows(tenant_id,status);
CREATE TABLE IF NOT EXISTS evidence_workflow_audit(id BIGSERIAL PRIMARY KEY,workflow_id BIGINT NOT NULL REFERENCES evidence_workflows(id),tenant_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
COMMIT;
