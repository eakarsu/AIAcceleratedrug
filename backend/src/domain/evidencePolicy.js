'use strict';
const SOURCE_TYPES=new Set(['trial_registry','peer_reviewed_publication','validated_terminology','governed_clinical_system','assay_result']);
function assembleEvidenceWorkflow(input){
 const violations=[];const evidence=Array.isArray(input.evidence)?input.evidence:[];
 if(!input.researchQuestion||input.researchQuestion.length<10)violations.push('research_question_required');
 if(!input.protocolRevision||!input.consentReference)violations.push('protocol_and_consent_required');
 if(!input.subjectReference||!/^[A-Za-z0-9_-]{6,64}$/.test(input.subjectReference))violations.push('pseudonymous_subject_reference_required');
 if(input.patientName||input.email||input.dateOfBirth)violations.push('direct_identifiers_prohibited');
 if(evidence.length===0)violations.push('evidence_required');
 for(const [index,item] of evidence.entries()){
  if(!SOURCE_TYPES.has(item.sourceType))violations.push(`evidence_${index}_source_not_governed`);
  if(!item.sourceId||!item.revision||!item.retrievedAt||!item.checksum||!/^[a-f0-9]{64}$/i.test(item.checksum))violations.push(`evidence_${index}_provenance_incomplete`);
  if(!item.claim||!item.uncertainty)violations.push(`evidence_${index}_claim_uncertainty_required`);
 }
 const interactionRules=Array.isArray(input.interactionRules)?input.interactionRules:[];
 const highRisks=interactionRules.filter(rule=>rule.severity==='high'||rule.severity==='contraindicated');
 return {valid:violations.length===0,violations,summary:{evidenceCount:evidence.length,highRiskInteractionCount:highRisks.length,sourceTypes:[...new Set(evidence.map(item=>item.sourceType))],professionalReviewRequired:true,clinicalUsePermitted:false,boundary:'Research decision support only; not a diagnosis, prescription, or autonomous clinical action.'}};
}
module.exports={SOURCE_TYPES,assembleEvidenceWorkflow};
