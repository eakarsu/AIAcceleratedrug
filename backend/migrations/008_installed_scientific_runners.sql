BEGIN;

INSERT INTO scientific_model_versions
  (key,version,display_name,task,provider,execution_mode,readiness,dataset_version,applicability_domain,validation_metrics,uncertainty_method,license_note,documentation_url)
VALUES
  ('reinvent4','4.8.24','REINVENT4','Constrained molecule generation','MolecularAI','local','ready',
   'Public PubChem prior published 2026-06-15; SHA-256 fe8cd1678452ad292a8f93e97cb19a85959b729e17113e157180d5e69ae89ef3',
   'Chemical space represented by the pinned public REINVENT prior',
   '{"executableAcceptance":{"seed":20260801,"requested":32,"uniqueValidMolecules":15,"withinMwLogPConstraints":11,"passed":true,"date":"2026-08-01"},"scientificBoundary":"Executable validity and reproducibility acceptance only; no activity, novelty, safety, IP, or synthesis claim."}'::jsonb,
   'Recorded sampling seed and molecular diversity; no biological uncertainty is claimed',
   'Apache-2.0; public prior metadata and source terms retained','https://github.com/MolecularAI/REINVENT4'),
  ('aizynthfinder','4.4.1','AiZynthFinder','Retrosynthesis planning','MolecularAI','local','ready',
   'Pinned public USPTO ONNX expansion/filter policies and templates; ZINC stock SHA-256 99d39a6f807c3e815487500bafc2b4a9dc66a31af189e3b1776874fb0d4a188d',
   'Organic small molecules covered by the pinned USPTO template policy and configured ZINC reference stock',
   '{"executableAcceptance":{"compound":"aspirin","displayedRoutes":12,"solvedRoutes":12,"topRouteSteps":1,"topRouteScore":0.9976287063411217,"passed":true,"date":"2026-08-01"},"scientificBoundary":"Executable route completion acceptance only; route accuracy, yield, safety, cost, availability, and scale-up are not established."}'::jsonb,
   'Route ranking and template/stock coverage; experimental feasibility uncertainty is not calibrated',
   'MIT; upstream USPTO model/template and ZINC stock terms apply','https://github.com/MolecularAI/aizynthfinder'),
  ('chemprop','2.3.0','Chemprop v2','Target-specific activity / QSAR','Chemprop','external_runner','adapter_ready',
   'Runtime package installed; target-specific labeled training and benchmark datasets are not supplied',
   'Only molecules inside the future target-specific training-set chemical and assay domain',
   '{"packageAcceptance":{"imported":true,"version":"2.3.0","date":"2026-08-01"},"scientificBoundary":"No target-specific model has been trained; this entry must not generate a QSAR prediction."}'::jsonb,
   'Future ensemble variance or conformal interval after calibration',
   'MIT; training dataset terms will also apply','https://chemprop.readthedocs.io/en/main/'),
  ('boltz-2','2.2.1','Boltz-2','Complex structure and affinity prediction','Boltz','external_runner','adapter_ready',
   'Runtime package installed; weights, accelerator inference, and benchmark acceptance are pending',
   'Biomolecular complexes supported by the pinned Boltz-2 runner after hardware and weight acceptance',
   '{"packageAcceptance":{"installed":true,"version":"2.2.1","date":"2026-08-01"},"hardware":{"host":"Apple M2 Pro","cuda":false},"scientificBoundary":"Package installation is not model acceptance; no prediction may be generated locally yet."}'::jsonb,
   'Predicted confidence and affinity probability after validated execution',
   'MIT; model weight and dataset terms apply','https://github.com/jwohlwend/boltz'),
  ('esmc','3.2.3','ESM C','Protein embeddings','EvolutionaryScale','external_runner','adapter_ready',
   'Runtime package installed; authenticated weights and inference acceptance are pending',
   'Protein amino-acid sequences supported by the accepted ESM C checkpoint',
   '{"packageAcceptance":{"installed":true,"version":"3.2.3","date":"2026-08-01"},"hardware":{"host":"Apple M2 Pro","cuda":false},"scientificBoundary":"Package installation is not checkpoint acceptance; no learned embedding may be generated locally yet."}'::jsonb,
   'Checkpoint-specific representation confidence and downstream validation after deployment',
   'Upstream code and model licenses apply','https://github.com/evolutionaryscale/esm')
ON CONFLICT(key,version) DO UPDATE SET
  display_name=EXCLUDED.display_name, task=EXCLUDED.task, provider=EXCLUDED.provider,
  execution_mode=EXCLUDED.execution_mode, readiness=EXCLUDED.readiness,
  dataset_version=EXCLUDED.dataset_version, applicability_domain=EXCLUDED.applicability_domain,
  validation_metrics=EXCLUDED.validation_metrics, uncertainty_method=EXCLUDED.uncertainty_method,
  license_note=EXCLUDED.license_note, documentation_url=EXCLUDED.documentation_url;

COMMIT;
