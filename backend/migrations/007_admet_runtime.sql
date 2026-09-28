BEGIN;

INSERT INTO scientific_model_versions(key,version,display_name,task,provider,execution_mode,readiness,dataset_version,applicability_domain,validation_metrics,uncertainty_method,license_note,documentation_url)
VALUES('admet-ai','2.0.1','ADMET-AI','ADMET and toxicity endpoint prediction','ADMET-AI / Chemprop','local','ready',
  'Upstream ADMET-AI 2.0.1 release models; Chemprop 2.3.0 runtime',
  'Drug-like small molecules accepted by the pinned ADMET-AI endpoint models',
  '{"executableAcceptance":{"compound":"gefitinib","endpointCount":104,"passed":true,"date":"2026-08-01"},"scientificBoundary":"Executable acceptance only. Benchmark replication and calibrated uncertainty are not yet recorded."}'::jsonb,
  'Point estimates only in this deployment; no calibrated interval is claimed',
  'Upstream licenses and underlying dataset terms apply','https://github.com/swansonk14/admet_ai')
ON CONFLICT(key,version) DO UPDATE SET readiness=EXCLUDED.readiness,dataset_version=EXCLUDED.dataset_version,
  applicability_domain=EXCLUDED.applicability_domain,validation_metrics=EXCLUDED.validation_metrics,
  uncertainty_method=EXCLUDED.uncertainty_method,execution_mode=EXCLUDED.execution_mode;

COMMIT;
