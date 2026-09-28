function list(value) {
  return Array.isArray(value) ? value : [];
}

function groupProteinFeatures(features) {
  const grouped = { domains: [], activeSites: [], bindingSites: [], variants: [], mutagenesis: [], other: [] };
  for (const feature of list(features)) {
    const normalized = {
      type: feature.type || 'Annotation',
      description: feature.description || 'No source description provided',
      begin: feature.begin ?? null,
      end: feature.end ?? feature.begin ?? null,
      position: feature.begin == null ? 'Position unavailable'
        : feature.end && feature.end !== feature.begin ? `${feature.begin}–${feature.end}` : String(feature.begin),
      sourceId: 'S1',
    };
    if (feature.type === 'Domain') grouped.domains.push(normalized);
    else if (feature.type === 'Active site') grouped.activeSites.push(normalized);
    else if (feature.type === 'Binding site') grouped.bindingSites.push(normalized);
    else if (feature.type === 'Natural variant') grouped.variants.push(normalized);
    else if (feature.type === 'Mutagenesis') grouped.mutagenesis.push(normalized);
    else grouped.other.push(normalized);
  }
  return grouped;
}

function sourceBackedProteinReport({ protein, annotations, structures, knownLigands, publications, question }) {
  const experimental = structures.filter((item) => item.structure_kind === 'experimental');
  const predicted = structures.filter((item) => item.structure_kind === 'alphafold_prediction');
  const featureCount = Object.values(annotations).reduce((total, records) => total + records.length, 0);
  return {
    headline: `${protein.gene_symbol || protein.protein_name} scientific protein brief`,
    executiveSummary: protein.function_description || 'A source-backed functional description is not available for this record.',
    answer: `This report organizes the available source evidence for “${question}”. It does not infer biological or clinical conclusions beyond those records.`,
    keyFacts: [
      { label: 'Protein', value: protein.protein_name, interpretation: `${protein.gene_symbol || 'Gene unavailable'} · ${protein.uniprot_id}`, citations: ['S1'] },
      { label: 'Organism', value: protein.organism, interpretation: `${protein.sequence_length || 'Unknown'} amino acids`, citations: ['S1'] },
      { label: 'Functional annotations', value: featureCount, interpretation: `${annotations.domains.length} domains, ${annotations.activeSites.length} active sites, ${annotations.bindingSites.length} binding sites`, citations: ['S1'] },
      { label: 'Structural evidence', value: structures.length, interpretation: `${experimental.length} experimental and ${predicted.length} AlphaFold-predicted structures`, citations: structures.length ? [structures[0].source_id] : ['S1'] },
      { label: 'Linked compounds', value: knownLigands.length, interpretation: 'Stored measured or curated evidence links; inspect assay context before comparison.', citations: knownLigands[0]?.source_id ? [knownLigands[0].source_id] : ['S1'] },
      { label: 'Literature results', value: publications.length, interpretation: 'Term-matched Europe PMC records requiring relevance review.', citations: publications[0]?.source_id ? [publications[0].source_id] : ['S1'] },
    ],
    sections: [
      { title: 'Biological role', detail: protein.function_description || 'No reviewed functional narrative was returned by the selected source.', citations: ['S1'] },
      { title: 'Structural interpretation', detail: experimental.length
        ? `${experimental.length} experimental PDB entries are available. Verify construct, method, resolution, ligands, and missing regions in each entry.`
        : predicted.length ? 'No experimental entry is indexed here; AlphaFold models are predictions and should be interpreted using confidence metadata.'
          : 'No experimental or predicted structure was retrieved for this record.', citations: structures.slice(0, 3).map((item) => item.source_id) },
      { title: 'Therapeutic evidence', detail: knownLigands.length
        ? `${knownLigands.length} compounds have stored evidence links to this protein. These records do not by themselves establish efficacy, selectivity, or clinical benefit.`
        : 'No linked compound evidence is stored for this protein.', citations: knownLigands.slice(0, 3).map((item) => item.source_id).filter(Boolean) },
    ],
    evidenceGaps: [
      ...(experimental.length ? [] : ['No experimental structure is currently indexed.']),
      ...(knownLigands.length ? [] : ['No measured protein–compound evidence is currently linked.']),
      'Functional claims, binding hypotheses, and therapeutic relevance require expert review of primary evidence.',
    ],
    nextSteps: ['Inspect the most relevant experimental structure', 'Review active-site and binding-site annotations', 'Select a compound and enrich measured bioactivity evidence', 'Define an experimentally testable hypothesis'],
    limitations: ['Source records may be incomplete or change over time.', 'Term-matched publications are not automatically evidence of relevance.', 'No docking, affinity, efficacy, toxicity, or clinical outcome is inferred by this source summary.'],
  };
}

function normalizeCitationList(values, validIds) {
  return [...new Set(list(values).map((value) => String(value).replace(/[\[\]]/g, '')).filter((value) => validIds.has(value)))];
}

function normalizeProteinReport(candidate, fallback, sources) {
  if (!candidate || typeof candidate !== 'object') return fallback;
  const validIds = new Set(sources.map((source) => source.id));
  const text = (value, fallbackValue = '') => typeof value === 'string' && value.trim() ? value.trim() : fallbackValue;
  const normalizeItems = (items, fallbackItems) => {
    const normalized = list(items).slice(0, 12).map((item) => ({
      label: text(item?.label, 'Finding'), value: item?.value ?? '—', interpretation: text(item?.interpretation),
      citations: normalizeCitationList(item?.citations, validIds),
    })).filter((item) => item.interpretation || item.value !== '—');
    return normalized.length ? normalized : fallbackItems;
  };
  const sections = list(candidate.sections).slice(0, 8).map((section) => ({
    title: text(section?.title, 'Analysis'), detail: text(section?.detail), citations: normalizeCitationList(section?.citations, validIds),
  })).filter((section) => section.detail);
  return {
    headline: text(candidate.headline, fallback.headline),
    executiveSummary: text(candidate.executiveSummary, fallback.executiveSummary),
    answer: text(candidate.answer, fallback.answer),
    keyFacts: normalizeItems(candidate.keyFacts, fallback.keyFacts),
    sections: sections.length ? sections : fallback.sections,
    evidenceGaps: list(candidate.evidenceGaps).map((item) => text(item)).filter(Boolean).slice(0, 10),
    nextSteps: list(candidate.nextSteps).map((item) => text(item)).filter(Boolean).slice(0, 10),
    limitations: list(candidate.limitations).map((item) => text(item)).filter(Boolean).slice(0, 10),
  };
}

module.exports = { groupProteinFeatures, sourceBackedProteinReport, normalizeProteinReport };
