export const AI_EXAMPLE_SCENARIOS = [
  { key: 'standard', label: 'Fill Standard Example', tone: 'standard' },
  { key: 'highRisk', label: 'Fill High-Risk Example', tone: 'risk' },
  { key: 'exception', label: 'Fill Exception Example', tone: 'exception' },
];

const FIELD_EXAMPLES = {
  target: ['EGFR kinase domain', 'KRAS G12C with acquired resistance', 'Undisclosed orphan-disease target pending confirmation'],
  properties: [
    'Kd below 10 nM, high selectivity, thermal stability above 55°C, and low predicted immunogenicity',
    'Sub-nanomolar potency with blood-brain barrier exposure; avoid hERG, CYP3A4, and wild-type EGFR activity',
    'Preserve function across an uncertain binding epitope while documenting sequence and assay limitations',
  ],
  desired_profile: [
    'Oral reversible inhibitor with nanomolar biochemical potency, high kinase selectivity, and no requirement for CNS exposure',
    'Brain-penetrant covalent inhibitor active against an acquired resistance mutation while minimizing wild-type target activity',
    'First-in-class chemical probe for an orphan target with explicit uncertainty and an experimentally testable mechanism hypothesis',
  ],
  chemistry_constraints: [
    'Molecular weight below 500, cLogP between 1 and 4, no PAINS motifs, and practical two-to-five-step synthesis',
    'Avoid hERG, CYP3A4, reactive metabolites, genotoxic alerts, and irreversible off-target engagement',
    'Retain uncertain properties explicitly; prioritize structural novelty, tractable synthesis, and discriminating assays',
  ],
  reference_smiles: [
    'CC(=O)OC1=CC=CC=C1C(=O)O',
    'COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)F)Cl)OCCCN4CCOCC4',
    'CC1=NN(C=C1)C2=NC=CC=N2',
  ],
  constraints: [
    'Length 110–160 residues; no unpaired cysteines; avoid N-linked glycosylation motifs; human-compatible expression',
    'Length under 120 residues; net charge between -2 and +2; no aggregation-prone stretch longer than five residues',
    'Sequence identity below 70% to reference scaffold; flag every constraint that cannot be evaluated',
  ],
  sequence_length: ['140', '950', '10'],
  target_organism: ['Homo sapiens', 'Homo sapiens with tumor-specific mutation context', 'Organism not confirmed; compare human and pathogen assumptions'],
  protein: ['NEO-P1 anti-EGFR nanobody', 'KRAS G12C inhibitor-resistant complex', 'Novel uploaded protein with no validated assay'],
  protein_id: ['P00533', 'P01116', 'INTERNAL-PROT-EXC-004'],
  conditions: ['pH 7.4, 37°C, 150 mM NaCl', 'pH 6.5, 40°C, 10% serum, competing ATP at 1 mM', 'Assay temperature and ionic strength not yet confirmed'],
  compound: ['Erlotinib reference compound', 'Covalent kinase inhibitor lead NX-7821', 'New chemical entity with incomplete characterization'],
  compound_name: ['Erlotinib reference compound', 'NX-7821 high-exposure lead', 'Unregistered screening hit EXC-004'],
  smiles: [
    'CC(=O)OC1=CC=CC=C1C(=O)O',
    'COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)F)Cl)OCCCN4CCOCC4',
    'CC1=NN(C(=C1)C2=CC=CC=C2)C3=NC=CC=N3',
  ],
  dose: ['25–100 mg once daily by mouth', 'Escalation from 50 mg to 400 mg daily with hepatic monitoring', 'Dose and route not finalized; compare oral and IV assumptions'],
  dose_mg_per_kg: ['10', '75', '0.1'],
  name: ['EGFR-selective therapeutic nanobody', 'Brain-penetrant KRAS resistance binder', 'Exploratory orphan-target miniprotein'],
  sequence: [
    'EVQLVESGGGLVQPGGSLRLSCAASGFTFSSYAMSWVRQAPGKGLEWVSAISGSGGSTYYADSVKGRFTISRDNSKNTLYLQMNSLRAEDTAVYYCAKVGWGQGTQVTVSS',
    'MTEYKLVVVGACGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDLPSRTVDTKQAQDLARSYGIPYIETSAKTRQGVEDAFYTLVREIRKHKEKMSKDGKKKKKKSKTKCVIM',
    'MKWVTFISLLLLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAKTCVADESHAGCEKSLHTLFGDELCKVASLRETYGEMADCCAKQEPERNECFLSHKDDSPDLPKLKPDPNTLCDEFKADEKKFWGKYLYEIARRHPYFYAPELLFFAKRYKAAFTECCQAADK',
  ],
  drugA: ['Osimertinib 80 mg daily', 'Venetoclax dose-escalation regimen', 'Investigational lead NX-7821'],
  drugB: ['Metformin 500 mg twice daily', 'Strong CYP3A4 inhibitor ketoconazole', 'Herbal supplement with unknown composition'],
  mechanism1: ['Irreversible mutant-selective EGFR kinase inhibition', 'BCL-2 inhibition with tumor-lysis exposure risk', 'Mechanism is provisional and has not been experimentally confirmed'],
  mechanism2: ['Renal glucose-lowering agent without major CYP inhibition', 'Strong CYP3A4 inhibition that can raise substrate exposure', 'Composition and pharmacologic mechanism are unknown'],
  patientProfile: [
    '58-year-old adult; eGFR 82 mL/min; normal hepatic tests; no prior QT prolongation',
    '74-year-old adult; stage 3 CKD, hepatic impairment, QTc 485 ms, and five concomitant medicines',
    'Pregnancy status, renal function, hepatic function, genotype, and medication list are unavailable',
  ],
  route: ['Oral immediate-release tablet', 'Intravenous infusion followed by oral maintenance', 'Route undecided; evaluate oral, IV, and subcutaneous constraints'],
  topic: ['EGFR exon 20 insertion inhibitors in NSCLC', 'Resistance and safety liabilities of KRAS G12C combination therapy', 'Emerging orphan target with sparse and contradictory evidence'],
  keywords: ['potency, selectivity, resistance, biomarker, randomized trial', 'hepatotoxicity, QT prolongation, CYP interaction, treatment resistance', 'negative results, retractions, preprints, conflicting evidence'],
  focus: ['Mechanism, translational evidence, clinical outcomes, and unresolved questions', 'Safety signals, resistance mechanisms, competitive failures, and regulatory risk', 'Evidence gaps, source quality, contradictory findings, and next validation steps'],
  candidate_ids: ['1,2,3,4,5', '6,7,8,9,10', '11,12,13,14,15'],
  protein_name: ['EGFR kinase domain', 'KRAS G12C resistance complex', 'Uploaded orphan-target structure'],
  pdb_id: ['1M17', '6OIM', '8XYZ — verify availability before execution'],
  ligand_smiles: [
    'COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)F)Cl)OCCCN4CCOCC4',
    'CC(C)(C1=NN(C(=C1)C2=CC=C(C=C2)F)C3=CC=CC=N3)C(=O)NCC4=CC=C(C=C4)Cl',
    'CC1=CC(=NN1)NC2=NC=CC(=N2)N3CCOCC3',
  ],
  intended_target: ['EGFR', 'KRAS G12C while sparing wild-type RAS', 'Provisional target; identity confirmation pending'],
  target_dose: ['50 mg once daily', '250 mg twice daily at maximum anticipated exposure', 'Dose range unknown; model 5–500 mg/day'],
  stability_concerns: [
    'Hydrolysis above pH 7, light sensitivity, and low aqueous solubility',
    'Rapid oxidation, precipitation during dilution, and temperature excursion risk',
    'Solid form, pKa, hygroscopicity, and degradation pathways are not yet measured',
  ],
  jurisdiction: ['US, EU, and Japan', 'Global with US/EU priority and China bridging requirements', 'Jurisdiction undecided; compare US, EU, Japan, and China'],
  library_size: ['100000', '2500000', '250'],
  criteria: [
    'Drug-like compounds; predicted IC50 below 1 µM; no PAINS alerts; diverse scaffolds',
    'Potency below 50 nM; CNS exposure; strict hERG and CYP filters; novelty required',
    'Sparse fragment library; retain uncertain hits and explain missing descriptors',
  ],
  property: ['Potency, selectivity, and aqueous solubility', 'Potency while reducing hERG and CYP3A4 liabilities', 'Balance uncertain potency data against novelty and synthetic accessibility'],
  compound_series: [
    '[{"name":"EGFR-01","smiles":"CC(=O)OC1=CC=CC=C1C(=O)O","ic50_nM":42},{"name":"EGFR-02","smiles":"CCOC1=CC=CC=C1C(=O)O","ic50_nM":18},{"name":"EGFR-03","smiles":"COC1=CC=CC=C1C(=O)O","ic50_nM":73}]',
    '[{"name":"RISK-01","smiles":"ClC1=CC=CC=C1C(=O)N","ic50_nM":2,"herg_percent":78},{"name":"RISK-02","smiles":"FC1=CC=CC=C1C(=O)N","ic50_nM":4,"herg_percent":65},{"name":"RISK-03","smiles":"BrC1=CC=CC=C1C(=O)N","ic50_nM":1,"herg_percent":91}]',
    '[{"name":"EXC-01","smiles":"CC1=NN(C=C1)C","ic50_nM":null},{"name":"EXC-02","smiles":"CC1=NC=CN1","ic50_nM":8500},{"name":"EXC-03","smiles":"C1=CC=CN=C1","ic50_nM":120}]',
  ],
  drug_candidate: ['DRC-001 Nexatinib', 'NX-7821 with unresolved hepatic signal', 'First-in-class candidate with incomplete CMC package'],
  indication: ['EGFR-mutant metastatic non-small-cell lung cancer', 'Relapsed AML after two prior therapies', 'Ultra-rare biomarker-defined solid tumor'],
  safety_data: [
    'No dose-limiting toxicities through 100 mg; grade 1 nausea in 18%; no meaningful QT signal',
    'Two grade 3 ALT elevations, one QTc above 500 ms, and exposure accumulation at the proposed dose',
    'Only single-dose animal data are available; reproductive, cardiac, and chronic toxicity studies are pending',
  ],
  target_or_disease: ['EGFR-mutant NSCLC', 'KRAS G12C inhibitor-resistant NSCLC', 'Ultra-rare kinase fusion with no approved therapy'],
  max_hits: ['50', '250', '10'],
  compounds: [
    '[{"name":"Aspirin","smiles":"CC(=O)OC1=CC=CC=C1C(=O)O"},{"name":"Metformin","smiles":"CN(C)C(=N)N=C(N)N"},{"name":"Fragment-01","smiles":"COC1=CC=CC=C1"}]',
    '[{"name":"Risk-01","smiles":"ClC1=CC=CC=C1C(=O)N"},{"name":"Risk-02","smiles":"BrC1=CC=CC=C1C(=O)N"},{"name":"Risk-03","smiles":"FC1=CC=CC=C1C(=O)N"}]',
    '[{"name":"Unknown-01","smiles":"CC1=NN(C=C1)C"},{"name":"Incomplete-02","smiles":"C1=CC=CN=C1"},{"name":"Outlier-03","smiles":"CCCCCCCCCCCCCCCC"}]',
  ],
  query: ['aspirin', 'venetoclax', 'CC1=NN(C(=C1)C2=CC=CC=C2)C3=NC=CC=N3'],
  biomarkers: ['["EGFR exon 19 deletion","ctDNA clearance","baseline brain metastases"]', '["TP53 co-mutation","ALT/AST","QTcF","CYP3A4 genotype"]', '["Exploratory RNA signature","unvalidated protein marker","missing central-lab assay"]'],
  prior_data: ['{"orr_pct":42,"median_pfs_months":8.5,"grade3_ae_pct":18}', '{"orr_pct":21,"median_pfs_months":3.2,"grade3_ae_pct":47,"treatment_deaths":1}', '{"orr_pct":null,"median_pfs_months":null,"patients":7,"data_cut":"interim"}'],
  experiment: ['Eight-point dose-response IC50 assay with vehicle and reference controls', 'Combination cytotoxicity and cardiac ion-channel liability panel', 'Low-volume assay with an unstable reagent and incomplete calibration history'],
  replicates: ['3', '6', '2'],
  candidates: [
    '[{"name":"Lead-A","ic50_nM":8,"solubility_uM":85,"selectivity":42},{"name":"Lead-B","ic50_nM":14,"solubility_uM":140,"selectivity":65},{"name":"Lead-C","ic50_nM":5,"solubility_uM":24,"selectivity":18}]',
    '[{"name":"Risk-A","ic50_nM":1,"solubility_uM":4,"selectivity":2,"herg":82},{"name":"Risk-B","ic50_nM":3,"solubility_uM":8,"selectivity":4,"herg":71},{"name":"Risk-C","ic50_nM":2,"solubility_uM":2,"selectivity":1,"herg":94}]',
    '[{"name":"Sparse-A","ic50_nM":null,"solubility_uM":12},{"name":"Sparse-B","ic50_nM":9000,"selectivity":null},{"name":"Outlier-C","ic50_nM":7,"solubility_uM":0.1,"selectivity":0.5}]',
  ],
  objectives: ['["potency","solubility","selectivity"]', '["potency","cardiac_safety","metabolic_stability","brain_exposure"]', '["evidence_completeness","novelty","synthetic_accessibility"]'],
  weights: ['{"potency":0.45,"solubility":0.30,"selectivity":0.25}', '{"potency":0.25,"cardiac_safety":0.35,"metabolic_stability":0.20,"brain_exposure":0.20}', '{"evidence_completeness":0.50,"novelty":0.20,"synthetic_accessibility":0.30}'],
};

function placeholderExample(field) {
  const placeholder = String(field.placeholder || '').replace(/^e\.g\.,?\s*/i, '').trim();
  return placeholder && !placeholder.startsWith('[') && !placeholder.startsWith('{')
    ? placeholder
    : `${field.label} — complete example`;
}

export function buildAiExample(config, scenarioKey = 'standard') {
  const scenarioIndex = Math.max(0, AI_EXAMPLE_SCENARIOS.findIndex((scenario) => scenario.key === scenarioKey));
  return Object.fromEntries((config.fields || []).map((field) => {
    if (field.type === 'select' && field.options?.length) {
      const optionIndex = Math.min(scenarioIndex, field.options.length - 1);
      return [field.key, field.options[optionIndex]];
    }
    const examples = FIELD_EXAMPLES[field.key];
    if (examples) return [field.key, examples[scenarioIndex] ?? examples[0]];
    if (field.type === 'number') return [field.key, ['100', '1000', '1'][scenarioIndex]];
    if (field.type === 'csv-array') return [field.key, ['1,2,3,4,5', '6,7,8,9,10', '11,12,13,14,15'][scenarioIndex]];
    if (field.type === 'json-array') return [field.key, ['["reference"]', '["high-risk"]', '["exception"]'][scenarioIndex]];
    return [field.key, placeholderExample(field)];
  }));
}

export function missingAiExampleFields(config, scenarioKey) {
  const example = buildAiExample(config, scenarioKey);
  return (config.fields || []).filter((field) => {
    const value = example[field.key];
    return value === undefined || value === null || String(value).trim() === '';
  }).map((field) => field.key);
}
