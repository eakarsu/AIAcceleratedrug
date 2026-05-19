import React from 'react';
import DrugPipeline from '../components/DrugPipeline.js';
import MoleculeViewer from '../components/MoleculeViewer.js';
import ProtocolExporter from '../components/ProtocolExporter.js';
import LipinskiCalculator from '../components/LipinskiCalculator.js';

// Bespoke page hosting the custom features:
//   1) DrugPipeline       — Kanban-style pipeline by phase (visualisation)
//   2) MoleculeViewer     — SVG render of simulated chemical structures (visualisation)
//   3) ProtocolExporter   — Trial Protocol PDF exporter (non-visualisation)
//   4) LipinskiCalculator — Rule-of-Five calculator (non-visualisation)
//
// Intentionally kept slim — all interactive logic lives in the components.
export default function CustomViewsPage() {
  return (
    <div data-testid="custom-views-page">
      <div className="page-header">
        <h1 className="page-title">Pipeline Views</h1>
        <p className="page-subtitle">
          Bespoke drug-discovery widgets · pipeline Kanban, molecule inspector, trial
          protocol exporter, and Lipinski Ro5 calculator
        </p>
      </div>

      <div className="page-body" style={{ padding: '0 24px 32px' }}>
        <DrugPipeline />
        <MoleculeViewer />
        <ProtocolExporter />
        <LipinskiCalculator />
      </div>
    </div>
  );
}
