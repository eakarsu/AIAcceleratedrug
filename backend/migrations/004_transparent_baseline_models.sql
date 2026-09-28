BEGIN;

INSERT INTO scientific_model_versions(key,version,display_name,task,provider,execution_mode,readiness,dataset_version,applicability_domain,validation_metrics,uncertainty_method,license_note,documentation_url) VALUES
 ('bioactivity-consensus','1.0.0','Measured Bioactivity Consensus','Summarize replicated measured activity','Local transparent model','local','ready','Stored source records at job creation','Protein–compound pairs with at least three comparable pChEMBL measurements','{"method":"median and interquartile range","minimumRecommendedRecords":3}','Interquartile range, record count, and source heterogeneity','Internal transparent implementation','https://www.ebi.ac.uk/chembl/api/data/docs'),
 ('protein-composition','1.0.0','Protein Composition Baseline','Transparent protein representation','Local transparent model','local','ready','No training dataset; deterministic amino-acid composition','Standard amino-acid sequences of 20–10,000 residues','{"method":"20 amino-acid fractions plus normalized length","notSequenceIdentity":true}','Coverage and representation limitations; not a learned embedding','Internal transparent implementation','https://www.uniprot.org/help/find_your_protein')
ON CONFLICT(key,version) DO UPDATE SET display_name=EXCLUDED.display_name,task=EXCLUDED.task,readiness=EXCLUDED.readiness,
 dataset_version=EXCLUDED.dataset_version,applicability_domain=EXCLUDED.applicability_domain,validation_metrics=EXCLUDED.validation_metrics,
 uncertainty_method=EXCLUDED.uncertainty_method,documentation_url=EXCLUDED.documentation_url;

COMMIT;
