const fetch = require('node-fetch');

const USER_AGENT = 'AIAcceleratedrug/2.0 scientific-research-client';

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 12000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Scientific source returned ${response.status}: ${body.slice(0, 160)}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function cleanArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function parseUniProt(record) {
  const comments = record.comments || [];
  const functionText = comments.find((item) => item.commentType === 'FUNCTION')?.texts
    ?.map((item) => item.value).join(' ') || '';
  const diseaseComments = comments.filter((item) => item.commentType === 'DISEASE');
  const diseases = diseaseComments.map((item) => item.disease?.diseaseId || item.texts?.[0]?.value);
  const pathways = comments.filter((item) => item.commentType === 'PATHWAY')
    .flatMap((item) => item.texts?.map((text) => text.value) || []);
  const features = (record.features || [])
    .filter((feature) => ['Domain', 'Active site', 'Binding site', 'Mutagenesis', 'Natural variant'].includes(feature.type))
    .slice(0, 50)
    .map((feature) => ({
      type: feature.type,
      description: feature.description || null,
      begin: feature.location?.start?.value || null,
      end: feature.location?.end?.value || null,
    }));
  return {
    uniprotId: record.primaryAccession,
    entryName: record.uniProtkbId,
    proteinName: record.proteinDescription?.recommendedName?.fullName?.value
      || record.proteinDescription?.submissionNames?.[0]?.fullName?.value
      || record.primaryAccession,
    geneSymbol: record.genes?.[0]?.geneName?.value || null,
    organism: record.organism?.scientificName || null,
    sequence: record.sequence?.value || null,
    sequenceLength: record.sequence?.length || null,
    functionDescription: functionText,
    pathways: cleanArray(pathways),
    diseases: cleanArray(diseases),
    features,
    isoforms: comments.filter((item) => item.commentType === 'ALTERNATIVE PRODUCTS')
      .flatMap((item) => item.isoforms || []).map((isoform) => ({ name: isoform.name?.value, ids: isoform.isoformIds || [] })),
    sourcePayload: record,
    sourceUrl: `https://rest.uniprot.org/uniprotkb/${record.primaryAccession}`,
  };
}

async function resolveProtein(input, mode = 'auto') {
  const value = String(input || '').trim();
  if (!value) throw new Error('Protein name, UniProt accession, or FASTA is required.');
  if (mode === 'fasta' || value.startsWith('>')) {
    const lines = value.split(/\r?\n/);
    const sequence = lines.filter((line) => !line.startsWith('>')).join('').replace(/\s/g, '').toUpperCase();
    if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]{20,10000}$/.test(sequence)) {
      throw new Error('FASTA must contain 20–10,000 valid amino-acid symbols.');
    }
    return {
      uniprotId: `LOCAL-${require('crypto').createHash('sha256').update(sequence).digest('hex').slice(0, 12).toUpperCase()}`,
      proteinName: lines[0]?.replace(/^>/, '').trim() || 'Uploaded protein sequence',
      organism: 'Unspecified', sequence, sequenceLength: sequence.length,
      functionDescription: 'User-supplied sequence. Functional annotations require sequence-search or model analysis.',
      pathways: [], diseases: [], features: [], isoforms: [], sourcePayload: {}, sourceUrl: null,
      localSequence: true,
    };
  }

  const accessionPattern = /^[A-NR-Z0-9][A-Z0-9]{5,9}$/i;
  let url;
  if (mode === 'uniprot' || accessionPattern.test(value)) {
    url = `https://rest.uniprot.org/uniprotkb/${encodeURIComponent(value.toUpperCase())}.json`;
    try { return parseUniProt(await fetchJson(url)); } catch (error) {
      if (mode === 'uniprot') throw error;
    }
  }
  const query = encodeURIComponent(`(protein_name:"${value.replace(/["\\]/g, '')}") AND (organism_id:9606)`);
  const search = await fetchJson(`https://rest.uniprot.org/uniprotkb/search?query=${query}&format=json&size=1`);
  if (!search.results?.length) throw new Error(`No reviewed human protein match found for “${value}”.`);
  return parseUniProt(search.results[0]);
}

async function resolveStructures(uniprotId) {
  if (!uniprotId || uniprotId.startsWith('LOCAL-')) return { experimental: [], predicted: [] };
  const query = {
    query: { type: 'terminal', service: 'text', parameters: {
      attribute: 'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession',
      operator: 'exact_match', value: uniprotId,
    } },
    return_type: 'entry', request_options: { paginate: { start: 0, rows: 12 } },
  };
  const [rcsb, alphaFold] = await Promise.allSettled([
    fetchJson('https://search.rcsb.org/rcsbsearch/v2/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query),
    }),
    fetchJson(`https://alphafold.ebi.ac.uk/api/prediction/${encodeURIComponent(uniprotId)}`),
  ]);
  const pdbIds = rcsb.status === 'fulfilled'
    ? cleanArray(rcsb.value.result_set?.map((item) => String(item.identifier).split('_')[0])).slice(0, 8) : [];
  return {
    experimental: pdbIds.map((id) => ({
      kind: 'experimental', externalId: id, format: 'mmCIF', uri: `https://files.rcsb.org/download/${id}.cif`,
      sourceUrl: `https://www.rcsb.org/structure/${id}`,
      label: 'Experimental PDB entry — verify construct, ligands, resolution, and method.',
    })),
    predicted: alphaFold.status === 'fulfilled' ? (alphaFold.value || []).slice(0, 3).map((item) => ({
      kind: 'alphafold_prediction', externalId: item.entryId || item.uniprotAccession,
      format: 'mmCIF', uri: item.cifUrl, sourceUrl: item.entryUrl || item.cifUrl,
      confidence: { fractionPlddtVeryHigh: item.fractionPlddtVeryHigh, fractionPlddtLow: item.fractionPlddtLow },
      label: 'AlphaFold-predicted monomer — not experimental evidence or a protein–drug complex.',
    })) : [],
    warnings: [rcsb, alphaFold].filter((result) => result.status === 'rejected').map((result) => result.reason.message),
  };
}

function parsePubChemProperty(property, synonyms = [], description = '') {
  return {
    pubchemCid: property.CID,
    preferredName: synonyms[0] || property.Title || `PubChem CID ${property.CID}`,
    canonicalSmiles: property.ConnectivitySMILES || property.CanonicalSMILES || null,
    isomericSmiles: property.SMILES || property.IsomericSMILES || null,
    inchiKey: property.InChIKey || null,
    molecularFormula: property.MolecularFormula || null,
    molecularWeight: property.MolecularWeight == null ? null : Number(property.MolecularWeight),
    xlogp: property.XLogP == null ? null : Number(property.XLogP),
    tpsa: property.TPSA == null ? null : Number(property.TPSA),
    hbondDonors: property.HBondDonorCount == null ? null : Number(property.HBondDonorCount),
    hbondAcceptors: property.HBondAcceptorCount == null ? null : Number(property.HBondAcceptorCount),
    rotatableBonds: property.RotatableBondCount == null ? null : Number(property.RotatableBondCount),
    synonyms: synonyms.slice(0, 30), description,
    sourcePayload: property,
    sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${property.CID}`,
    conformerUrl: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/SDF?record_type=3d`,
    imageUrl: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/PNG?image_size=large`,
  };
}

async function resolveCompound(input, mode = 'auto') {
  const value = String(input || '').trim();
  if (!value) throw new Error('Drug name, PubChem CID, or SMILES is required.');
  let namespace = 'name';
  if (mode === 'cid' || /^\d+$/.test(value)) namespace = 'cid';
  else if (mode === 'smiles' || /[=#@()[\]\/\\]/.test(value)) namespace = 'smiles';
  const encoded = encodeURIComponent(value);
  const propertyNames = 'Title,MolecularFormula,MolecularWeight,ConnectivitySMILES,SMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount';
  const propertyData = await fetchJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${namespace}/${encoded}/property/${propertyNames}/JSON`);
  const property = propertyData.PropertyTable?.Properties?.[0];
  if (!property) throw new Error(`No PubChem compound match found for “${value}”.`);
  const [synonymsResult, descriptionResult] = await Promise.allSettled([
    fetchJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/synonyms/JSON`),
    fetchJson(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${property.CID}/description/JSON`),
  ]);
  const synonyms = synonymsResult.status === 'fulfilled'
    ? synonymsResult.value.InformationList?.Information?.[0]?.Synonym || [] : [];
  const description = descriptionResult.status === 'fulfilled'
    ? descriptionResult.value.InformationList?.Information?.map((item) => item.Description).filter(Boolean).join(' ') : '';
  return parsePubChemProperty(property, synonyms, description);
}

async function fetchChEMBLEvidence(protein, compound) {
  if (!protein?.uniprot_id || !compound?.inchi_key) return { target: null, molecule: null, activities: [], warning: 'UniProt accession and InChIKey are required.' };
  const base = 'https://www.ebi.ac.uk/chembl/api/data';
  const [targets, molecules] = await Promise.all([
    fetchJson(`${base}/target.json?target_components__accession=${encodeURIComponent(protein.uniprot_id)}&limit=3`),
    fetchJson(`${base}/molecule.json?molecule_structures__standard_inchi_key=${encodeURIComponent(compound.inchi_key)}&limit=3`),
  ]);
  const target = targets.targets?.[0] || null;
  const molecule = molecules.molecules?.[0] || null;
  if (!target || !molecule) return { target, molecule, activities: [], warning: 'No exact ChEMBL target/compound cross-reference was found.' };
  const data = await fetchJson(`${base}/activity.json?target_chembl_id=${encodeURIComponent(target.target_chembl_id)}&molecule_chembl_id=${encodeURIComponent(molecule.molecule_chembl_id)}&limit=50`);
  return {
    target: { id: target.target_chembl_id, name: target.pref_name, type: target.target_type, organism: target.organism },
    molecule: { id: molecule.molecule_chembl_id, name: molecule.pref_name, maxPhase: molecule.max_phase },
    activities: (data.activities || []).map((activity) => ({
      activityId: String(activity.activity_id), type: activity.standard_type || activity.type,
      relation: activity.standard_relation || activity.relation || '=',
      value: activity.standard_value == null ? null : Number(activity.standard_value),
      units: activity.standard_units || activity.units, pchemblValue: activity.pchembl_value == null ? null : Number(activity.pchembl_value),
      assayId: activity.assay_chembl_id, documentId: activity.document_chembl_id,
      assayDescription: activity.assay_description || null,
      sourceUrl: `https://www.ebi.ac.uk/chembl/explore/activity/${activity.activity_id}`,
      raw: activity,
    })),
    sourceUrl: `https://www.ebi.ac.uk/chembl/explore/compound/${molecule.molecule_chembl_id}`,
  };
}

async function fetchLiteratureEvidence(protein, compound) {
  const terms = [protein?.gene_symbol || protein?.protein_name, compound?.preferred_name].filter(Boolean);
  if (!terms.length) return [];
  const query = terms.map((term) => `TITLE_ABS:"${String(term).replace(/["\\]/g, '')}"`).join(' AND ');
  const data = await fetchJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&pageSize=15&format=json`);
  return (data.resultList?.result || []).map((record) => ({
    doi: record.doi || null, pmid: record.pmid || null, pmcid: record.pmcid || null,
    title: record.title || 'Untitled publication', abstract: record.abstractText || null,
    journal: record.journalTitle || null, publicationYear: record.pubYear ? Number(record.pubYear) : null,
    authors: record.authorString ? record.authorString.split(',').map((item) => item.trim()).filter(Boolean) : [],
    citationCount: record.citedByCount == null ? null : Number(record.citedByCount),
    sourceUrl: record.pmid ? `https://europepmc.org/article/MED/${record.pmid}` : record.pmcid ? `https://europepmc.org/article/PMC/${record.pmcid}` : 'https://europepmc.org/',
    raw: record,
  }));
}

async function fetchClinicalTrialEvidence(protein, compound) {
  const terms = [protein?.gene_symbol || protein?.protein_name, compound?.preferred_name].filter(Boolean);
  if (terms.length < 2) return [];
  const data = await fetchJson(`https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(terms.join(' AND '))}&pageSize=15&format=json`);
  return (data.studies || []).map((study) => {
    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const status = protocol.statusModule || {};
    const design = protocol.designModule || {};
    const conditions = protocol.conditionsModule || {};
    const arms = protocol.armsInterventionsModule || {};
    const sponsor = protocol.sponsorCollaboratorsModule || {};
    return {
      nctId: identification.nctId, briefTitle: identification.briefTitle || identification.officialTitle || identification.nctId,
      overallStatus: status.overallStatus || null, phases: design.phases || [], conditions: conditions.conditions || [],
      interventions: (arms.interventions || []).map((item) => ({ type: item.type, name: item.name, description: item.description })),
      sponsor: sponsor.leadSponsor?.name || null, enrollment: design.enrollmentInfo?.count || null,
      startDate: status.startDateStruct?.date || null, completionDate: status.completionDateStruct?.date || null,
      sourceUrl: `https://clinicaltrials.gov/study/${identification.nctId}`, raw: study,
    };
  });
}

module.exports = { fetchJson, resolveProtein, resolveStructures, resolveCompound, parseUniProt, parsePubChemProperty,
  fetchChEMBLEvidence, fetchLiteratureEvidence, fetchClinicalTrialEvidence };
