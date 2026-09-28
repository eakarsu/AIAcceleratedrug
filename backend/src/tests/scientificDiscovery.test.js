const test = require('node:test');
const assert = require('node:assert/strict');
const { parseUniProt, parsePubChemProperty } = require('../services/scientificSources');
const { physchemAssessment, proteinComposition, parseProviderJson } = require('../routes/discovery');
const { groupProteinFeatures, sourceBackedProteinReport, normalizeProteinReport } = require('../services/proteinAnalyst');
const { descriptorReadiness, paretoFrontier, WORKFLOW_MODELS } = require('../routes/advancedDiscovery');

test('maps UniProt evidence without dropping functional features', () => {
  const parsed = parseUniProt({
    primaryAccession: 'P00533', uniProtkbId: 'EGFR_HUMAN',
    proteinDescription: { recommendedName: { fullName: { value: 'Epidermal growth factor receptor' } } },
    genes: [{ geneName: { value: 'EGFR' } }], organism: { scientificName: 'Homo sapiens' },
    sequence: { value: 'M'.repeat(100), length: 100 },
    comments: [{ commentType: 'FUNCTION', texts: [{ value: 'Receptor tyrosine kinase.' }] }],
    features: [{ type: 'Active site', description: 'Proton acceptor', location: { start: { value: 42 }, end: { value: 42 } } }],
  });
  assert.equal(parsed.uniprotId, 'P00533');
  assert.equal(parsed.geneSymbol, 'EGFR');
  assert.equal(parsed.features[0].begin, 42);
});

test('maps PubChem descriptors and presentation identifiers', () => {
  const parsed = parsePubChemProperty({ CID: 123631, Title: 'Gefitinib', MolecularFormula: 'C22H24ClFN4O3', MolecularWeight: '446.9', XLogP: 3.2, TPSA: 68.7, HBondDonorCount: 1, HBondAcceptorCount: 7 }, ['Gefitinib']);
  assert.equal(parsed.pubchemCid, 123631);
  assert.equal(parsed.molecularWeight, 446.9);
  assert.match(parsed.conformerUrl, /123631\/SDF/);
});

test('physicochemical assessment is explicit about scope and missing data', () => {
  const complete = physchemAssessment({ molecular_weight: 446.9, xlogp: 3.2, hbond_donors: 1, hbond_acceptors: 7, tpsa: 68.7, rotatable_bonds: 8 });
  assert.equal(complete.classification, 'rule-compatible');
  assert.equal(complete.uncertainty.completeness, 100);
  assert.match(complete.summary, /does not predict efficacy/);
  const missing = physchemAssessment({ molecular_weight: 446.9 });
  assert.equal(missing.classification, 'incomplete-data');
});

test('protein composition baseline is deterministic and normalized', () => {
  const representation = proteinComposition('ACDEFGHIKLMNPQRSTVWY'.repeat(5));
  assert.equal(representation.vector.length, 21);
  assert.equal(representation.sequenceLength, 100);
  assert.equal(representation.standardResidueCoverage, 1);
  assert.ok(Math.abs(representation.vector.slice(0,20).reduce((sum,value) => sum+value,0)-1) < 1e-10);
});

test('protein analyst preserves domains, residue positions, and source identifiers', () => {
  const annotations = groupProteinFeatures([
    { type: 'Domain', description: 'Kinase domain', begin: 712, end: 979 },
    { type: 'Active site', description: 'Proton acceptor', begin: 837, end: 837 },
    { type: 'Natural variant', description: 'Disease-associated variant', begin: 858, end: 858 },
  ]);
  assert.equal(annotations.domains[0].position, '712–979');
  assert.equal(annotations.activeSites[0].position, '837');
  assert.equal(annotations.variants[0].sourceId, 'S1');

  const protein = { protein_name: 'Epidermal growth factor receptor', gene_symbol: 'EGFR', uniprot_id: 'P00533',
    organism: 'Homo sapiens', sequence_length: 1210, function_description: 'Receptor tyrosine kinase.' };
  const structures = [{ structure_kind: 'experimental', source_id: 'S2' }];
  const fallback = sourceBackedProteinReport({ protein, annotations, structures, knownLigands: [], publications: [], question: 'Describe EGFR' });
  const normalized = normalizeProteinReport({ headline: 'Grounded report', executiveSummary: 'Summary', answer: 'Answer',
    keyFacts: [{ label: 'Role', value: 'Kinase', interpretation: 'Source grounded', citations: ['[S1]', 'S999'] }],
    sections: [{ title: 'Structure', detail: 'Experimental model available.', citations: ['S2'] }],
    evidenceGaps: ['Validate'], nextSteps: ['Experiment'], limitations: ['Research only'] }, fallback,
  [{ id: 'S1' }, { id: 'S2' }]);
  assert.deepEqual(normalized.keyFacts[0].citations, ['S1']);
  assert.deepEqual(normalized.sections[0].citations, ['S2']);
});

test('provider JSON parser accepts fenced or safely trailed JSON without accepting truncation', () => {
  assert.deepEqual(parseProviderJson('```json\n{"headline":"Complete"}\n```'), { headline: 'Complete' });
  assert.deepEqual(parseProviderJson('{"headline":"Complete"}\nHuman review required.'), { headline: 'Complete' });
  assert.throws(() => parseProviderJson('{"headline":"Incomplete"'), /truncated/);
});

test('evidence-readiness score is deterministic and exposes its non-predictive components', () => {
  const complete = descriptorReadiness({ molecular_weight: 420, xlogp: 3.1, tpsa: 70,
    hbond_donors: 1, hbond_acceptors: 7, rotatable_bonds: 5 }, 5);
  assert.equal(complete.score, 100);
  assert.equal(complete.descriptorCompleteness, 1);
  assert.equal(complete.lipinskiViolations, 0);
  const sparse = descriptorReadiness({ molecular_weight: 720 }, 0);
  assert.ok(sparse.score < complete.score);
  assert.equal(sparse.lipinskiViolations, 1);
});

test('Pareto triage retains non-dominated evidence and descriptor alternatives', () => {
  const entries = [
    { id: 1, evidenceCount: 5, readiness: { descriptorCompleteness: 1, lipinskiViolations: 0 } },
    { id: 2, evidenceCount: 2, readiness: { descriptorCompleteness: .8, lipinskiViolations: 1 } },
    { id: 3, evidenceCount: 8, readiness: { descriptorCompleteness: .7, lipinskiViolations: 0 } },
  ];
  assert.deepEqual(paretoFrontier(entries).map((item) => item.id).sort(), [1,3]);
});

test('every advanced workflow maps to a versioned model contract', () => {
  assert.deepEqual(Object.keys(WORKFLOW_MODELS).sort(), ['admet','complex_prediction','docking','molecule_generation',
    'protein_embedding','qsar','synthesis_planning']);
});
