import React, { useEffect, useRef, useState } from 'react';

async function loadArtifact(url) {
  const token=localStorage.getItem('token');
  const response=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});
  if (!response.ok) throw new Error(`Artifact returned HTTP ${response.status}`);
  return response.text();
}

export default function DockingPoseViewer({ job }) {
  const host=useRef(null); const viewerRef=useRef(null); const [error,setError]=useState('');
  const artifacts=Array.isArray(job?.output?.artifacts)?job.output.artifacts:[];
  const receptor=artifacts.find((item)=>item.kind==='prepared_receptor'&&String(item.format).toUpperCase()==='PDB');
  const pose=artifacts.find((item)=>item.kind==='docking_poses'&&String(item.format).toUpperCase()==='SDF');
  useEffect(()=>{ let active=true;
    if (!host.current||!receptor||!pose) return undefined;
    Promise.all([import('3dmol'),loadArtifact(receptor.downloadUrl),loadArtifact(pose.downloadUrl)]).then(([library,pdb,sdf])=>{
      if (!active||!host.current) return; const mol3d=library.default||library;
      const viewer=mol3d.createViewer(host.current,{backgroundColor:'#071827'}); viewerRef.current=viewer;
      viewer.addModel(pdb,'pdb'); viewer.setStyle({model:0},{cartoon:{color:'spectrum',opacity:.8}});
      viewer.addModel(sdf,'sdf',{multimodel:true}); viewer.setStyle({model:1},{stick:{colorscheme:'greenCarbon',radius:.18},sphere:{scale:.25,colorscheme:'greenCarbon'}});
      const contacts=Array.isArray(job.output?.interactions?.contacts)?job.output.interactions.contacts:[];
      contacts.slice(0,12).forEach((contact)=>viewer.setStyle({model:0,chain:contact.chain==='—'?'':contact.chain,resi:Number(contact.residueNumber)},
        {cartoon:{color:'#f59e0b'},stick:{color:'#f59e0b',radius:.12}}));
      viewer.zoomTo({model:1}); viewer.render(); viewer.resize();
    }).catch((problem)=>active&&setError(problem.message));
    return()=>{active=false;try{viewerRef.current?.clear();}catch(_){/* best-effort WebGL cleanup */}viewerRef.current=null;};
  },[job?.id,receptor?.artifactId,pose?.artifactId]);
  if (!receptor||!pose) return null;
  return <div className="advanced-pose-viewer"><div><strong>Protein–ligand pose inspection</strong><span>Prepared receptor + Vina docking hypothesis</span></div>
    {error?<p>{error}</p>:<div ref={host}/>}<small>Interactive 3Dmol.js view. Orange residues are geometric contacts. The ligand pose and interactions are computational hypotheses, not experimental evidence.</small></div>;
}
