require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'drug_discovery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop and recreate tables
    await client.query(`
      DROP TABLE IF EXISTS ai_logs CASCADE;
      DROP TABLE IF EXISTS literature CASCADE;
      DROP TABLE IF EXISTS admet_properties CASCADE;
      DROP TABLE IF EXISTS drug_interactions CASCADE;
      DROP TABLE IF EXISTS experiments CASCADE;
      DROP TABLE IF EXISTS research_projects CASCADE;
      DROP TABLE IF EXISTS compounds CASCADE;
      DROP TABLE IF EXISTS clinical_trials CASCADE;
      DROP TABLE IF EXISTS protein_structures CASCADE;
      DROP TABLE IF EXISTS toxicity_predictions CASCADE;
      DROP TABLE IF EXISTS binding_affinities CASCADE;
      DROP TABLE IF EXISTS molecular_screenings CASCADE;
      DROP TABLE IF EXISTS drug_candidates CASCADE;
      DROP TABLE IF EXISTS targets CASCADE;
      DROP TABLE IF EXISTS proteins CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Create tables
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'researcher',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE proteins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sequence TEXT,
        target VARCHAR(255),
        properties TEXT,
        status VARCHAR(50) DEFAULT 'designed',
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE targets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        disease_area VARCHAR(255),
        description TEXT,
        validation_status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE drug_candidates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        molecule_type VARCHAR(100),
        target_name VARCHAR(255),
        phase VARCHAR(50) DEFAULT 'Discovery',
        efficacy_score DECIMAL(5,2),
        status VARCHAR(50) DEFAULT 'active',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE molecular_screenings (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        target_name VARCHAR(255),
        method VARCHAR(100),
        hits_count INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE binding_affinities (
        id SERIAL PRIMARY KEY,
        protein_name VARCHAR(255),
        target_name VARCHAR(255),
        affinity_score VARCHAR(100),
        method VARCHAR(100),
        conditions TEXT,
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE toxicity_predictions (
        id SERIAL PRIMARY KEY,
        compound_name VARCHAR(255) NOT NULL,
        smiles TEXT,
        risk_level VARCHAR(50) DEFAULT 'pending',
        prediction_result TEXT,
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE protein_structures (
        id SERIAL PRIMARY KEY,
        protein_name VARCHAR(255) NOT NULL,
        sequence TEXT,
        fold_family VARCHAR(255),
        confidence_score DECIMAL(5,2),
        domains TEXT,
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE clinical_trials (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        drug_candidate_name VARCHAR(255),
        phase VARCHAR(50),
        status VARCHAR(50) DEFAULT 'planned',
        start_date DATE,
        end_date DATE,
        participants INTEGER,
        site VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE compounds (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        formula VARCHAR(255),
        molecular_weight DECIMAL(10,2),
        smiles TEXT,
        source VARCHAR(255),
        status VARCHAR(50) DEFAULT 'available',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE research_projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        lead_scientist VARCHAR(255),
        objective TEXT,
        status VARCHAR(50) DEFAULT 'active',
        budget DECIMAL(15,2),
        start_date DATE,
        end_date DATE,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE experiments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        project_name VARCHAR(255),
        type VARCHAR(100),
        hypothesis TEXT,
        result TEXT,
        status VARCHAR(50) DEFAULT 'planned',
        protocol TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE drug_interactions (
        id SERIAL PRIMARY KEY,
        drug_a VARCHAR(255) NOT NULL,
        drug_b VARCHAR(255) NOT NULL,
        interaction_type VARCHAR(100),
        severity VARCHAR(50) DEFAULT 'unknown',
        mechanism TEXT,
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE admet_properties (
        id SERIAL PRIMARY KEY,
        compound_name VARCHAR(255) NOT NULL,
        absorption VARCHAR(255),
        distribution VARCHAR(255),
        metabolism VARCHAR(255),
        excretion VARCHAR(255),
        toxicity_score DECIMAL(5,2),
        overall_score DECIMAL(5,2),
        ai_output TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE literature (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        authors TEXT,
        journal VARCHAR(255),
        year INTEGER,
        relevance_score DECIMAL(5,2),
        ai_summary TEXT,
        doi VARCHAR(255),
        abstract TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE ai_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        feature VARCHAR(100),
        prompt TEXT,
        response TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed Users
    const hashedPassword = await bcrypt.hash('password123', 10);
    await client.query(`
      INSERT INTO users (email, password, name, role) VALUES
      ('admin@drugdiscovery.com', '${hashedPassword}', 'Dr. Sarah Chen', 'admin'),
      ('researcher@drugdiscovery.com', '${hashedPassword}', 'Dr. James Wilson', 'researcher'),
      ('scientist@drugdiscovery.com', '${hashedPassword}', 'Dr. Maria Garcia', 'scientist');
    `);

    // Seed Proteins (15 items)
    await client.query(`
      INSERT INTO proteins (name, sequence, target, properties, status) VALUES
      ('NEO-P1 Anti-EGFR', 'MKVLWAALLVTFLAGCQAKVEQAVETEPEPELRQQTEWQSGQRWELALGRFWDYLRWVQTLSEQVQEELLSSQVTQELRALMDETMKELKAYKSELEEQLTPVAEETRARLSKL', 'EGFR', 'High binding affinity, Kd=2.3nM, Stable at pH 7.4', 'validated'),
      ('SYN-P2 PD-L1 Blocker', 'DIVMTQSPLSLPVTPGEPASISCRSSQSLLHSNGYNYLDWYLQKPGQSPQLLIYLGSNRASGVPDRFSGSGSGTDFTLKISRVEAEDVGVYYCMQALQTPYTFGQGTKLEIK', 'PD-L1', 'Checkpoint inhibitor, IC50=5.1nM', 'synthesized'),
      ('BIO-P3 TNF-alpha Inhibitor', 'EVQLVESGGGLVQPGGSLRLSCAASGFTFSSYAMSWVRQAPGKGLEWVSAISGSGGSTYYADSVKGRFTISRDNSKNTLYLQMNSLRAEDTAVYYCAKVG', 'TNF-alpha', 'Anti-inflammatory, Kd=0.8nM', 'designed'),
      ('PROT-P4 HER2 Binder', 'DIQMTQSPSSLSASVGDRVTITCRASQDVNTAVAWYQQKPGKAPKLLIYSASFLYSGVPSRFSGSRSGTDFTLTISSLQPEDFATYYCQQHYTTPPTFGQGTKVEIK', 'HER2', 'Breast cancer target, Kd=1.5nM', 'testing'),
      ('NOVA-P5 VEGF Trap', 'SDTGRPFVEMYSEIPEIIHMTEGRELVIPCRVTSPNITVTLKKFPLDTLIPDGKRIIWDSRKGFIISNATYKEIGLLTCEATVNGHLYKTNYLTHRQTNTIIDVVLSPSHGIELSVGEKL', 'VEGF', 'Anti-angiogenic, Kd=0.5nM', 'validated'),
      ('GEN-P6 IL-6 Blocker', 'QVQLQESGPGLVKPSETLSLTCTVSGGSVSSGDYYWTWIRQSPGKGLEWIGHIYYSGNINYNPSLKSRLTISIDTSKTQFSLKLSSVTAADTAVYYCARDR', 'IL-6', 'Autoimmune therapy, Kd=3.2nM', 'designed'),
      ('FLEX-P7 BRAF Inhibitor', 'MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHHQRQE', 'BRAF V600E', 'Melanoma target, IC50=12nM', 'synthesized'),
      ('CORE-P8 CDK4/6 Binder', 'MENSSSRQAILKDLSFQHWEIPDSWIEDSTEVLTYIHDILAGFTLDSRTLLDTGMNLYRSDSGDEEDKFVTPDFEVFD', 'CDK4/6', 'Cell cycle inhibitor, IC50=8.7nM', 'testing'),
      ('APEX-P9 JAK2 Inhibitor', 'MGKRVLHPLMSFNFKHIDAQNHENQREAWKAALERQMEAASRDNYREETFKGIRAELQEAQAPNLHTHFIERFLNQLIAMDMTPDDQRAKLIAMKAHQVDRERDRHIDEY', 'JAK2', 'Myeloproliferative therapy, IC50=4.3nM', 'designed'),
      ('ALPHA-P10 BCL-2 Disruptor', 'MAHAGRTGYDNREIVMKYIHYKLSQRGYEWDAGDVGAAPPGAAPAPGIFSSQPGHTPHPAASRDPVARTSPLQTPAAPGAAAGP', 'BCL-2', 'Apoptosis inducer, Kd=6.1nM', 'validated'),
      ('BETA-P11 KRAS Binder', 'MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPTIEDYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGE', 'KRAS G12C', 'Oncology, IC50=15nM', 'synthesized'),
      ('DELTA-P12 mTOR Inhibitor', 'MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAH', 'mTOR', 'Cell growth regulator, IC50=22nM', 'designed'),
      ('SIGMA-P13 PD-1 Agonist', 'PGWFLDSPDRPWNPPTFSPALLVVTEGDNATFTCSFSNTSESFVLNWYRMSPSNQTDKLAAFPEDRSQPGQDCRFR', 'PD-1', 'Immunomodulator, Kd=4.8nM', 'testing'),
      ('OMEGA-P14 ALK Inhibitor', 'MKKFLLVTLLCVAAAHAQDSVCNLYPVATSSICQFPDCEYRFMYQVLWEIYRQKWRSADQHLWDPKTRCQQHL', 'ALK', 'Lung cancer, IC50=7.2nM', 'validated'),
      ('ZETA-P15 RAS Effector', 'MKWVTFISLLLLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAK', 'RAS', 'Pan-RAS inhibitor, IC50=18nM', 'designed')
    `);

    // Seed Targets (15 items)
    await client.query(`
      INSERT INTO targets (name, type, disease_area, description, validation_status) VALUES
      ('EGFR (Epidermal Growth Factor Receptor)', 'Receptor Tyrosine Kinase', 'Non-Small Cell Lung Cancer', 'Overexpressed in 60% of NSCLC cases. Key driver of tumor proliferation and survival signaling.', 'validated'),
      ('PD-L1 (Programmed Death-Ligand 1)', 'Immune Checkpoint', 'Multiple Cancers', 'Immune evasion mechanism in tumors. Blocking PD-L1 restores T-cell anti-tumor activity.', 'validated'),
      ('TNF-alpha', 'Cytokine', 'Rheumatoid Arthritis', 'Pro-inflammatory cytokine central to autoimmune pathology. Proven therapeutic target.', 'validated'),
      ('HER2 (Human Epidermal Growth Factor 2)', 'Receptor Tyrosine Kinase', 'Breast Cancer', 'Amplified in 20-30% of breast cancers. Drives aggressive tumor growth.', 'validated'),
      ('VEGF (Vascular Endothelial Growth Factor)', 'Growth Factor', 'Solid Tumors', 'Key mediator of tumor angiogenesis. Anti-VEGF therapy starves tumors of blood supply.', 'validated'),
      ('IL-6 (Interleukin-6)', 'Cytokine', 'Autoimmune Diseases', 'Pleiotropic cytokine involved in inflammation, immune response, and hematopoiesis.', 'validated'),
      ('BRAF V600E', 'Serine/Threonine Kinase', 'Melanoma', 'Mutant kinase found in 50% of melanomas. Constitutively activates MAPK pathway.', 'validated'),
      ('CDK4/6 (Cyclin-Dependent Kinase 4/6)', 'Kinase', 'HR+ Breast Cancer', 'Cell cycle regulators. Inhibition causes G1 arrest in cancer cells.', 'clinical'),
      ('JAK2 (Janus Kinase 2)', 'Tyrosine Kinase', 'Myeloproliferative Neoplasms', 'V617F mutation drives constitutive signaling in myeloproliferative disorders.', 'clinical'),
      ('BCL-2 (B-cell Lymphoma 2)', 'Anti-apoptotic Protein', 'Chronic Lymphocytic Leukemia', 'Overexpressed in CLL. Prevents apoptosis of malignant B cells.', 'validated'),
      ('KRAS G12C', 'GTPase', 'Lung Adenocarcinoma', 'Oncogenic mutation in 13% of NSCLC. Previously considered undruggable.', 'clinical'),
      ('mTOR (Mammalian Target of Rapamycin)', 'Serine/Threonine Kinase', 'Renal Cell Carcinoma', 'Central regulator of cell growth, proliferation, and survival.', 'validated'),
      ('PD-1 (Programmed Cell Death 1)', 'Immune Checkpoint Receptor', 'Multiple Cancers', 'T-cell inhibitory receptor. Checkpoint blockade unleashes anti-tumor immunity.', 'validated'),
      ('ALK (Anaplastic Lymphoma Kinase)', 'Receptor Tyrosine Kinase', 'Non-Small Cell Lung Cancer', 'ALK rearrangements in 5% of NSCLC. Highly responsive to ALK inhibitors.', 'validated'),
      ('GLP-1R (Glucagon-Like Peptide 1 Receptor)', 'GPCR', 'Type 2 Diabetes', 'Incretin receptor regulating insulin secretion and appetite. Major diabetes/obesity target.', 'validated')
    `);

    // Seed Drug Candidates (15 items)
    await client.query(`
      INSERT INTO drug_candidates (name, molecule_type, target_name, phase, efficacy_score, status, description) VALUES
      ('DRC-001 Nexatinib', 'Small Molecule', 'EGFR', 'Phase II', 87.5, 'active', 'Third-generation EGFR inhibitor with CNS penetration. Shows activity against T790M and C797S mutations.'),
      ('DRC-002 Immublock', 'Monoclonal Antibody', 'PD-L1', 'Phase III', 92.1, 'active', 'Fully human IgG1 anti-PD-L1 antibody with enhanced ADCC activity.'),
      ('DRC-003 Inflazero', 'Bispecific Antibody', 'TNF-alpha', 'Phase I', 78.3, 'active', 'Novel bispecific targeting TNF-alpha and IL-17A simultaneously.'),
      ('DRC-004 Herceptix', 'Antibody-Drug Conjugate', 'HER2', 'Phase II', 91.7, 'active', 'ADC with novel topoisomerase I payload. Active in HER2-low tumors.'),
      ('DRC-005 Angioblock', 'Fusion Protein', 'VEGF', 'Phase III', 85.2, 'active', 'VEGF trap with extended half-life. Requires less frequent dosing.'),
      ('DRC-006 Rheumazil', 'Nanobody', 'IL-6', 'Phase I', 73.8, 'active', 'Tri-valent nanobody construct with improved tissue penetration.'),
      ('DRC-007 Melanostop', 'Small Molecule', 'BRAF V600E', 'Phase II', 88.9, 'active', 'Brain-penetrant BRAF inhibitor with minimal paradoxical pathway activation.'),
      ('DRC-008 Cyclobreak', 'Small Molecule', 'CDK4/6', 'Phase I', 81.4, 'active', 'Selective CDK4 inhibitor with reduced neutropenia risk.'),
      ('DRC-009 Jakinase', 'Small Molecule', 'JAK2', 'Preclinical', 76.2, 'active', 'Selective JAK2 V617F inhibitor sparing wild-type JAK2.'),
      ('DRC-010 Apoptinol', 'Small Molecule', 'BCL-2', 'Phase II', 89.3, 'active', 'Selective BCL-2 inhibitor with reduced tumor lysis risk.'),
      ('DRC-011 KRASblock', 'Covalent Inhibitor', 'KRAS G12C', 'Phase I', 82.7, 'active', 'Irreversible KRAS G12C inhibitor with tri-complex formation.'),
      ('DRC-012 Raptorcept', 'Small Molecule', 'mTOR', 'Preclinical', 74.5, 'active', 'Dual mTORC1/mTORC2 inhibitor with improved therapeutic window.'),
      ('DRC-013 Immunorev', 'Bispecific Antibody', 'PD-1', 'Phase I', 86.1, 'active', 'PD-1 x LAG-3 bispecific for checkpoint-refractory patients.'),
      ('DRC-014 ALKinator', 'Small Molecule', 'ALK', 'Phase II', 90.8, 'active', 'Fourth-generation ALK inhibitor active against all known resistance mutations.'),
      ('DRC-015 Glucomod', 'Peptide', 'GLP-1R', 'Phase III', 93.2, 'active', 'Long-acting GLP-1R agonist with oral bioavailability.')
    `);

    // Seed Molecular Screenings (15 items)
    await client.query(`
      INSERT INTO molecular_screenings (name, target_name, method, hits_count, status, description) VALUES
      ('SCR-001 EGFR HTS Campaign', 'EGFR', 'High-Throughput Screening', 342, 'completed', 'Screened 500K compound library against EGFR kinase domain. 342 primary hits identified.'),
      ('SCR-002 PD-L1 Fragment Screen', 'PD-L1', 'Fragment-Based Screening', 89, 'completed', 'NMR-based fragment screen of 2000 fragments. 89 binders identified.'),
      ('SCR-003 TNF-alpha Virtual Screen', 'TNF-alpha', 'Virtual Screening', 1250, 'completed', 'Molecular docking of 2M virtual compounds. 1250 predicted binders.'),
      ('SCR-004 HER2 Phage Display', 'HER2', 'Phage Display', 156, 'in_progress', 'Antibody phage display against HER2 ECD. Multiple rounds of panning.'),
      ('SCR-005 VEGF DEL Screen', 'VEGF', 'DNA-Encoded Library', 478, 'completed', 'DEL screen of 10B member library. 478 enriched compounds.'),
      ('SCR-006 IL-6 SPR Campaign', 'IL-6', 'Surface Plasmon Resonance', 67, 'in_progress', 'SPR-based binding screen of clinical compound collection.'),
      ('SCR-007 BRAF Cellular Assay', 'BRAF V600E', 'Cell-Based Assay', 203, 'completed', 'Proliferation assay in A375 melanoma cells. 203 active compounds.'),
      ('SCR-008 CDK4/6 Kinome Panel', 'CDK4/6', 'Kinase Panel Screen', 45, 'completed', 'Screened hit compounds against 468 kinase panel for selectivity.'),
      ('SCR-009 JAK2 AlphaScreen', 'JAK2', 'AlphaScreen', 312, 'in_progress', 'Proximity-based assay for JAK2-STAT5 interaction inhibitors.'),
      ('SCR-010 BCL-2 FP Assay', 'BCL-2', 'Fluorescence Polarization', 128, 'completed', 'FP-based screen for BCL-2/BH3 interaction disruptors.'),
      ('SCR-011 KRAS Thermal Shift', 'KRAS G12C', 'Differential Scanning Fluorimetry', 92, 'completed', 'Thermal shift assay to identify KRAS G12C stabilizers/binders.'),
      ('SCR-012 mTOR Biochemical Screen', 'mTOR', 'Biochemical Assay', 187, 'in_progress', 'ADP-Glo kinase assay against mTOR kinase domain.'),
      ('SCR-013 PD-1 ELISA Screen', 'PD-1', 'ELISA', 234, 'completed', 'Competition ELISA for PD-1/PD-L1 interaction blockers.'),
      ('SCR-014 ALK Cellular Screen', 'ALK', 'Cell-Based Assay', 156, 'completed', 'Ba/F3 ALK-dependent cell line viability screen.'),
      ('SCR-015 GLP-1R cAMP Assay', 'GLP-1R', 'Functional Assay', 289, 'in_progress', 'cAMP accumulation assay in GLP-1R expressing CHO cells.')
    `);

    // Seed Binding Affinities (15 items)
    await client.query(`
      INSERT INTO binding_affinities (protein_name, target_name, affinity_score, method, conditions) VALUES
      ('NEO-P1 Anti-EGFR', 'EGFR', 'Kd = 2.3 nM', 'Surface Plasmon Resonance', 'PBS pH 7.4, 25°C'),
      ('SYN-P2 PD-L1 Blocker', 'PD-L1', 'IC50 = 5.1 nM', 'Competition ELISA', 'PBS pH 7.4, 37°C'),
      ('BIO-P3 TNF-alpha Inhibitor', 'TNF-alpha', 'Kd = 0.8 nM', 'Bio-Layer Interferometry', 'HBS-EP pH 7.4, 25°C'),
      ('PROT-P4 HER2 Binder', 'HER2', 'Kd = 1.5 nM', 'Isothermal Calorimetry', 'HEPES pH 7.5, 25°C'),
      ('NOVA-P5 VEGF Trap', 'VEGF-A165', 'Kd = 0.5 nM', 'Surface Plasmon Resonance', 'HBS-EP pH 7.4, 37°C'),
      ('GEN-P6 IL-6 Blocker', 'IL-6', 'Kd = 3.2 nM', 'Bio-Layer Interferometry', 'PBS pH 7.4, 25°C'),
      ('FLEX-P7 BRAF Inhibitor', 'BRAF V600E', 'IC50 = 12 nM', 'Kinase Activity Assay', 'Tris pH 7.5, 30°C, 1mM ATP'),
      ('CORE-P8 CDK4/6 Binder', 'CDK4/Cyclin D1', 'IC50 = 8.7 nM', 'ADP-Glo Assay', 'Kinase buffer, 30°C'),
      ('APEX-P9 JAK2 Inhibitor', 'JAK2 V617F', 'IC50 = 4.3 nM', 'HTRF Assay', 'Standard kinase buffer, 25°C'),
      ('ALPHA-P10 BCL-2 Disruptor', 'BCL-2', 'Kd = 6.1 nM', 'Fluorescence Polarization', 'PBS pH 7.4, 25°C'),
      ('BETA-P11 KRAS Binder', 'KRAS G12C', 'IC50 = 15 nM', 'SOS1 Catalysis Assay', 'HEPES pH 7.5, 25°C'),
      ('DRC-001 Nexatinib', 'EGFR L858R', 'IC50 = 3.8 nM', 'Z-LYTE Assay', 'Standard kinase buffer, 25°C'),
      ('DRC-007 Melanostop', 'BRAF V600E', 'IC50 = 6.2 nM', 'Radiometric Assay', 'Kinase buffer, 30°C'),
      ('DRC-014 ALKinator', 'ALK', 'IC50 = 1.2 nM', 'LanthaScreen', 'TR-FRET buffer, 25°C'),
      ('DRC-015 Glucomod', 'GLP-1R', 'EC50 = 0.3 nM', 'cAMP Accumulation', 'Physiological buffer, 37°C')
    `);

    // Seed Toxicity Predictions (15 items)
    await client.query(`
      INSERT INTO toxicity_predictions (compound_name, smiles, risk_level, prediction_result) VALUES
      ('DRC-001 Nexatinib', 'CC1=CC(=CC=C1NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5', 'Low', 'No significant hepatotoxicity or cardiotoxicity signals. hERG IC50 > 30 μM.'),
      ('DRC-007 Melanostop', 'CS(=O)(=O)C1=CC=C(C=C1)C(=O)NC2=CC(=C(C=C2)F)NC3=NC=C(C=N3)C4CC4', 'Low', 'Clean safety profile. No CYP inhibition at therapeutic doses.'),
      ('DRC-008 Cyclobreak', 'CC1=C(C=CC=C1)NC(=O)C2=CC=C(C=C2)NC3=NC=CC(=N3)C4=CC=CC=C4', 'Medium', 'Moderate neutropenia risk based on CDK4/6 mechanism. Monitor blood counts.'),
      ('DRC-009 Jakinase', 'CC1=CC=C(C=C1)C(=O)NC2=CC=CC(=C2)C3=CN=C4C=CC=CN34', 'Medium', 'Immunosuppression risk at high doses. Infection monitoring required.'),
      ('DRC-010 Apoptinol', 'CC1(CCC(=C(C1)C2=CC=C(C=C2)Cl)C3=CC=C(C=C3)C(=O)NS(=O)(=O)C4=CC=CC=C4)CCC(=O)O', 'Medium', 'Tumor lysis syndrome risk in high tumor burden patients. Ramp-up dosing recommended.'),
      ('DRC-011 KRASblock', 'C=CC(=O)NC1=CC=C(C=C1)NC2=NC3C=CC=CN3N=C2CF', 'Low', 'Covalent modifier with good selectivity. No off-target reactivity detected.'),
      ('DRC-012 Raptorcept', 'COC1=CC=C(C=C1)C2=NC3=CC=CC=C3N2CC(=O)NC4=CC=CC(=C4)C(F)(F)F', 'Medium', 'Hyperglycemia and hyperlipidemia expected. Stomatitis possible.'),
      ('Aspirin', 'CC(=O)OC1=CC=CC=C1C(=O)O', 'Low', 'Well-known safety profile. GI bleeding risk at high doses.'),
      ('Acetaminophen', 'CC(=O)NC1=CC=C(C=C1)O', 'Medium', 'Hepatotoxicity at supratherapeutic doses. NAPQI metabolite concern.'),
      ('Metformin', 'CN(C)C(=N)NC(=N)N', 'Low', 'Lactic acidosis risk in renal impairment. Generally well tolerated.'),
      ('Ibuprofen', 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O', 'Low', 'GI and cardiovascular risks with chronic use. COX-2 selectivity moderate.'),
      ('Doxorubicin', 'COC1=CC2=C(C(=C1OC3CC(CC(O3)N)O)O)C(=O)C4=C(C2=O)C=CC=C4O', 'High', 'Significant cardiotoxicity risk. Cumulative dose-dependent cardiomyopathy.'),
      ('Cisplatin', '[NH3][Pt]([NH3])(Cl)Cl', 'High', 'Nephrotoxicity, ototoxicity, neurotoxicity. Requires hydration and monitoring.'),
      ('DRC-013 Immunorev', 'Biologic - N/A', 'Medium', 'Immune-related adverse events expected. Colitis, hepatitis, endocrinopathy monitoring needed.'),
      ('DRC-015 Glucomod', 'Peptide - proprietary', 'Low', 'GI side effects (nausea) expected. No pancreatitis signal in preclinical studies.')
    `);

    // Seed Protein Structures (15 items)
    await client.query(`
      INSERT INTO protein_structures (protein_name, sequence, fold_family, confidence_score, domains) VALUES
      ('NEO-P1 Anti-EGFR', 'MKVLWAALLVTFLAGCQAKVEQAVETEPEPELRQQT...', 'Immunoglobulin fold', 95.2, 'VH domain, VL domain, Fc region'),
      ('SYN-P2 PD-L1 Blocker', 'DIVMTQSPLSLPVTPGEPASISCRSSQSLLHSNGY...', 'Immunoglobulin fold', 93.8, 'scFv, Linker region, Framework regions'),
      ('Human EGFR Kinase Domain', 'FKKIKVLGSGAFGTVYKGLWIPEGEKVKIPVAIKEL...', 'Protein Kinase fold', 97.1, 'N-lobe, C-lobe, Activation loop, ATP binding site'),
      ('PD-L1 Extracellular Domain', 'FTVTVPKDLYVVEYGSNMTIECKFPVEKQLDLAAL...', 'Immunoglobulin V-set', 96.5, 'IgV domain, IgC domain, PD-1 binding interface'),
      ('TNF-alpha Trimer', 'VRSSSRTPSDKPVAHVVANPQAEGQLQWLNRRANA...', 'TNF fold (jelly roll)', 98.2, 'Monomer A, B, C; Receptor binding loops'),
      ('HER2 Extracellular Domain', 'TQVCTGTDMKLRLPASPETHLDMLRHLYQGCQVVQ...', 'Leucine-rich repeat', 94.7, 'Domain I-IV, Dimerization arm, Trastuzumab epitope'),
      ('VEGF-A Homodimer', 'APMAEGGGQNHHEVVKFMDVYQRSYCHPIETLVDI...', 'Cystine knot', 97.8, 'Receptor binding domain, Heparin binding domain'),
      ('BRAF V600E Kinase', 'QIINNTEGDWWLAHSLSTFQVQRDIDHECQDIALA...', 'Protein Kinase fold', 96.3, 'N-lobe, C-lobe, P-loop, DFG motif (DFG-in)'),
      ('CDK4-Cyclin D1 Complex', 'MATSRYEPVAEIGVGAYGTVYKAKNRETGQMVALK...', 'Protein Kinase fold', 95.9, 'CDK4 kinase domain, Cyclin D1 fold, T-loop'),
      ('JAK2 JH1 Domain', 'MLELIRQIQKGSFQRFHPHFQMPPHSQSEQIPQEL...', 'Protein Kinase fold', 94.1, 'JH1 kinase, JH2 pseudokinase, FERM domain'),
      ('BCL-2 Anti-apoptotic', 'MAHAGRTGYDNREIVMKYIHYKLSQRGYEWDAGDV...', 'BCL-2 family fold', 97.4, 'BH1-BH4 domains, Hydrophobic groove, TM domain'),
      ('KRAS G12C GDP-bound', 'MTEYKLVVVGAVGVGKSALTIQLIQNHFVDEYDPT...', 'P-loop NTPase', 98.5, 'GTPase domain, Switch I, Switch II, P-loop'),
      ('mTOR Kinase Domain', 'RPRGQDLVPELLETIPGDDTEMKDALWQLAEHAAK...', 'PI3K-related kinase', 93.2, 'FAT domain, Kinase domain, FATC domain, FRB domain'),
      ('ALK Kinase Domain', 'KFPNPIRPNKEQINREKLFTSIGIKPDNAIGLHSN...', 'Protein Kinase fold', 95.6, 'N-lobe, C-lobe, Activation loop, gatekeeper residue'),
      ('GLP-1R Extracellular Domain', 'RPQGATVSLWETVQKWREYRHQCQRFLTE...', 'Class B GPCR ECD', 92.8, 'N-terminal ECD, 7TM domain, ICL3 signaling domain')
    `);

    // Seed Clinical Trials (15 items)
    await client.query(`
      INSERT INTO clinical_trials (name, drug_candidate_name, phase, status, start_date, end_date, participants, site, description) VALUES
      ('NEXUS-001', 'DRC-001 Nexatinib', 'Phase I', 'active', '2024-03-15', '2025-09-30', 45, 'MD Anderson Cancer Center', 'First-in-human dose escalation study in EGFR-mutant NSCLC patients.'),
      ('IMMUNE-SHIELD', 'DRC-002 Immublock', 'Phase III', 'active', '2023-06-01', '2026-12-31', 850, 'Multi-center Global', 'Randomized phase III vs pembrolizumab in first-line NSCLC.'),
      ('INFLAM-ZERO', 'DRC-003 Inflazero', 'Phase I', 'recruiting', '2024-09-01', '2026-03-31', 60, 'Johns Hopkins Medicine', 'Dose finding study in moderate-to-severe rheumatoid arthritis.'),
      ('HER2-ADVANCE', 'DRC-004 Herceptix', 'Phase II', 'active', '2024-01-15', '2026-06-30', 220, 'Memorial Sloan Kettering', 'Single arm study in HER2-low metastatic breast cancer.'),
      ('ANGIO-CLEAR', 'DRC-005 Angioblock', 'Phase III', 'active', '2023-09-01', '2027-03-31', 720, 'Multi-center US/EU', 'Superiority trial vs bevacizumab in metastatic colorectal cancer.'),
      ('RHEUM-FREE', 'DRC-006 Rheumazil', 'Phase I/II', 'recruiting', '2024-11-01', '2026-11-30', 90, 'Cleveland Clinic', 'Adaptive design study in IL-6 refractory RA patients.'),
      ('MELA-STOP', 'DRC-007 Melanostop', 'Phase II', 'active', '2024-04-01', '2026-04-30', 180, 'Dana-Farber Cancer Institute', 'Expansion cohort study in BRAF V600E metastatic melanoma.'),
      ('CYCLE-BREAK', 'DRC-008 Cyclobreak', 'Phase I', 'active', '2024-07-15', '2025-12-31', 36, 'University of Texas SW', 'Dose escalation with food effect sub-study.'),
      ('JAK-FREE', 'DRC-009 Jakinase', 'Preclinical', 'planned', '2025-06-01', '2026-12-31', 0, 'TBD', 'IND-enabling studies ongoing. Phase I planned for Q2 2025.'),
      ('APO-CLEAR', 'DRC-010 Apoptinol', 'Phase II', 'active', '2024-02-01', '2026-02-28', 200, 'Multi-center US', 'Combination study with rituximab in relapsed CLL.'),
      ('KRAS-TARGET', 'DRC-011 KRASblock', 'Phase I/II', 'active', '2024-06-01', '2026-08-31', 120, 'Massachusetts General Hospital', 'Basket trial in KRAS G12C mutant solid tumors.'),
      ('mTOR-INSIGHT', 'DRC-012 Raptorcept', 'Preclinical', 'planned', '2025-09-01', '2027-03-31', 0, 'TBD', 'Preclinical toxicology studies in progress.'),
      ('IMMUNO-DUAL', 'DRC-013 Immunorev', 'Phase I', 'recruiting', '2024-10-01', '2026-10-31', 75, 'City of Hope', 'First-in-human study in checkpoint-refractory solid tumors.'),
      ('ALK-MASTER', 'DRC-014 ALKinator', 'Phase II', 'active', '2024-03-01', '2026-09-30', 160, 'Multi-center Asia-Pacific', 'Registration-directed study in ALK+ NSCLC after crizotinib.'),
      ('GLUCO-SLIM', 'DRC-015 Glucomod', 'Phase III', 'active', '2023-12-01', '2027-06-30', 1200, 'Multi-center Global', 'Pivotal trial for oral GLP-1R agonist in T2DM with obesity.')
    `);

    // Seed Compounds (15 items)
    await client.query(`
      INSERT INTO compounds (name, formula, molecular_weight, smiles, source, status, description) VALUES
      ('Erlotinib', 'C22H23N3O4', 393.44, 'COCCOC1=CC2=C(C=C1OCCOC)C(=NC=N2)NC3=CC=CC(=C3)C#C', 'Commercial', 'reference', 'First-generation EGFR TKI. FDA approved for NSCLC and pancreatic cancer.'),
      ('Gefitinib', 'C22H24ClFN4O3', 446.90, 'COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)F)Cl)OCCCN4CCOCC4', 'Commercial', 'reference', 'First-generation EGFR TKI. First targeted therapy for NSCLC.'),
      ('Osimertinib', 'C28H33N7O2', 499.62, 'COC1=C(C=C2C(=C1)N=CN=C2NC3=CC(=C(C=C3)NC(=O)C=C)N(C)CCN(C)C)NC(=O)C=C', 'Commercial', 'reference', 'Third-generation EGFR TKI targeting T790M mutation.'),
      ('Vemurafenib', 'C23H18ClF2N3O3S', 489.92, 'CCCS(=O)(=O)NC1=CC=C(C=C1F)C(=O)C2=CNC3=NC=C(C=C23)C4=CC=C(C=C4)Cl', 'Commercial', 'reference', 'BRAF V600E inhibitor approved for melanoma.'),
      ('Venetoclax', 'C46H50ClN7O7S', 868.44, 'Complex structure', 'Commercial', 'reference', 'Selective BCL-2 inhibitor approved for CLL.'),
      ('Sotorasib', 'C29H25ClF2N6O3', 560.17, 'Complex structure', 'Commercial', 'reference', 'First-in-class KRAS G12C covalent inhibitor.'),
      ('Compound NX-7821', 'C24H26N4O3', 418.49, 'CC1=CC(=CC=C1NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5CCCC5', 'In-house synthesis', 'screening', 'Novel EGFR inhibitor lead from HTS campaign SCR-001.'),
      ('Compound PL-3392', 'C18H22N4O2', 326.39, 'COC1=CC=C(C=C1)C2=NC(=NC=C2)NC3=CC=C(C=C3)OCCN', 'In-house synthesis', 'lead', 'PD-L1 small molecule inhibitor lead compound.'),
      ('Fragment FR-0156', 'C8H9NO2', 151.16, 'COC1=CC=C(C=C1)C(=O)N', 'Fragment library', 'hit', 'Fragment hit from NMR-based screen against PD-L1.'),
      ('Natural Product NP-2841', 'C30H42O8', 534.65, 'Complex terpenoid structure', 'Marine organism extract', 'hit', 'Cytotoxic natural product from deep-sea sponge.'),
      ('Peptide PEP-0094', 'Cyclic peptide', 1247.50, 'Cyclo[Arg-Gly-Asp-Phe-Val]', 'Solid-phase synthesis', 'lead', 'Cyclic RGD peptide with enhanced integrin binding.'),
      ('DEL Hit DEL-5523', 'C22H28N6O4S', 472.56, 'DNA-encoded library encoded', 'DEL screen', 'hit', 'VEGF binding hit from 10B member DEL library.'),
      ('Macrocycle MAC-1107', 'C36H44N4O6', 632.76, 'Macrocyclic structure', 'Macrocycle library', 'lead', 'Cell-permeable macrocyclic PPI inhibitor for RAS-RAF.'),
      ('Degrader DGR-2201', 'C48H52N8O7', 852.98, 'PROTAC bifunctional', 'In-house design', 'screening', 'PROTAC degrader targeting BRD4 with VHL E3 ligase.'),
      ('Nanoparticle NP-F801', 'Lipid nanoparticle', 0.00, 'N/A - formulation', 'Formulation lab', 'development', 'LNP formulation for mRNA delivery targeting hepatocytes.')
    `);

    // Seed Research Projects (15 items)
    await client.query(`
      INSERT INTO research_projects (name, lead_scientist, objective, status, budget, start_date, end_date, description) VALUES
      ('Project NEXUS', 'Dr. Sarah Chen', 'Develop next-gen EGFR inhibitors for resistant NSCLC', 'active', 12500000.00, '2024-01-01', '2026-12-31', 'Comprehensive program targeting EGFR C797S and other emerging resistance mutations.'),
      ('Project SHIELD', 'Dr. James Wilson', 'Novel checkpoint immunotherapy combinations', 'active', 18000000.00, '2023-06-01', '2027-06-30', 'Developing bispecific antibodies targeting multiple immune checkpoints.'),
      ('Project ZERO', 'Dr. Maria Garcia', 'Bi-specific anti-inflammatory biologics', 'active', 8500000.00, '2024-03-01', '2026-09-30', 'Engineering bi-specific nanobodies for autoimmune diseases.'),
      ('Project ADVANCE', 'Dr. Robert Kim', 'ADC platform for HER2-low tumors', 'active', 22000000.00, '2023-09-01', '2027-03-31', 'Novel ADC technology with improved therapeutic index.'),
      ('Project CASCADE', 'Dr. Emily Brown', 'RAS pathway inhibitor program', 'active', 15000000.00, '2024-02-01', '2027-02-28', 'Targeting KRAS, NRAS, and HRAS with covalent and non-covalent approaches.'),
      ('Project AURORA', 'Dr. David Lee', 'AI-driven protein design platform', 'active', 9500000.00, '2024-06-01', '2026-06-30', 'Building ML models for de novo protein design and optimization.'),
      ('Project QUANTUM', 'Dr. Lisa Zhang', 'Quantum computing for drug discovery', 'planning', 5000000.00, '2025-01-01', '2027-12-31', 'Exploring quantum algorithms for molecular simulation.'),
      ('Project GENOME', 'Dr. Michael Park', 'Genomics-driven target identification', 'active', 11000000.00, '2024-01-15', '2026-07-31', 'Using CRISPR screens and multi-omics for novel target discovery.'),
      ('Project ORBIT', 'Dr. Jennifer Adams', 'Oral biologic delivery platform', 'active', 7500000.00, '2024-04-01', '2026-10-31', 'Developing oral delivery systems for peptide and protein therapeutics.'),
      ('Project STEALTH', 'Dr. Thomas Wright', 'Immune evasion-resistant antibodies', 'active', 13000000.00, '2023-12-01', '2026-12-31', 'Engineering antibodies resistant to tumor immune evasion mechanisms.'),
      ('Project SYNAPSE', 'Dr. Anna Petrov', 'CNS-penetrant small molecules', 'active', 16000000.00, '2024-05-01', '2027-05-31', 'Designing brain-penetrant drugs for neurodegenerative diseases.'),
      ('Project FORGE', 'Dr. Kevin Patel', 'Fragment-to-lead optimization', 'active', 6000000.00, '2024-07-01', '2026-03-31', 'Systematic fragment growing and merging for PPI targets.'),
      ('Project ATLAS', 'Dr. Sarah Martinez', 'Structural biology pipeline', 'active', 8000000.00, '2024-02-15', '2026-08-31', 'Cryo-EM and X-ray crystallography for structure-guided design.'),
      ('Project BEACON', 'Dr. Chris Taylor', 'Biomarker discovery program', 'active', 4500000.00, '2024-08-01', '2026-08-31', 'Identifying predictive biomarkers for immunotherapy response.'),
      ('Project HARBOR', 'Dr. Rachel Wong', 'Safety pharmacology innovation', 'active', 3500000.00, '2024-09-01', '2026-09-30', 'Developing in vitro models to replace animal safety studies.')
    `);

    // Seed Experiments (15 items)
    await client.query(`
      INSERT INTO experiments (name, project_name, type, hypothesis, result, status, protocol, description) VALUES
      ('EXP-001 EGFR Kinase Assay', 'Project NEXUS', 'Biochemical', 'NX-7821 inhibits EGFR C797S with IC50 < 50nM', 'IC50 = 32nM against EGFR C797S', 'completed', 'ADP-Glo kinase assay, 1-hour incubation', 'Key selectivity experiment for lead compound.'),
      ('EXP-002 PD-L1 Cell Binding', 'Project SHIELD', 'Cell-based', 'Immublock binds PD-L1+ tumor cells with EC50 < 1nM', 'EC50 = 0.7nM on PD-L1+ MDA-MB-231', 'completed', 'Flow cytometry binding assay', 'Confirmed target engagement on tumor cells.'),
      ('EXP-003 TNF Neutralization', 'Project ZERO', 'Functional', 'Inflazero neutralizes TNF-alpha and IL-17A simultaneously', 'Dual neutralization confirmed at 10nM', 'completed', 'L929 cytotoxicity + IL-17 reporter assay', 'Proof of concept for bispecific mechanism.'),
      ('EXP-004 HER2 ADC Internalization', 'Project ADVANCE', 'Cell-based', 'Herceptix ADC is internalized within 2 hours', 'Internalization t1/2 = 45 minutes', 'completed', 'Confocal microscopy with pH-sensitive dye', 'Rapid internalization supports payload delivery.'),
      ('EXP-005 KRAS Co-crystal', 'Project CASCADE', 'Structural', 'KRASblock forms covalent bond with C12', 'Crystal structure at 1.8Å confirms covalent binding', 'completed', 'X-ray crystallography, hanging drop vapor diffusion', 'Structure confirms mechanism of action.'),
      ('EXP-006 Protein Stability', 'Project AURORA', 'Biophysical', 'AI-designed protein has Tm > 65°C', NULL, 'in_progress', 'Differential scanning calorimetry', 'Testing thermal stability of 10 AI-designed variants.'),
      ('EXP-007 Quantum Simulation', 'Project QUANTUM', 'Computational', 'Quantum algorithm improves binding energy calculation accuracy', NULL, 'planned', 'VQE on 50-qubit simulator', 'Benchmarking quantum vs classical molecular simulation.'),
      ('EXP-008 CRISPR Screen', 'Project GENOME', 'Genomic', 'Genome-wide CRISPR identifies novel synthetic lethal targets', 'Identified 23 novel synthetic lethal pairs', 'completed', 'GeCKO v2 library in isogenic cell lines', 'Major screen identifying new therapeutic targets.'),
      ('EXP-009 Oral Peptide PK', 'Project ORBIT', 'In vivo', 'Oral peptide formulation achieves >5% bioavailability', 'Oral bioavailability = 8.3% in rats', 'completed', 'Rat PK study, oral vs IV dosing', 'Breakthrough oral bioavailability for cyclic peptide.'),
      ('EXP-010 Antibody Engineering', 'Project STEALTH', 'Protein Engineering', 'Fc-engineered antibody resists tumor-shed PD-L1', NULL, 'in_progress', 'Directed evolution with FACS sorting', 'Evolving antibodies resistant to decoy mechanisms.'),
      ('EXP-011 BBB Penetration', 'Project SYNAPSE', 'In vitro', 'CNS compounds achieve >5% brain penetration', 'Papp = 18.5 x 10^-6 cm/s in MDR1-MDCK', 'completed', 'Transwell BBB model, MDCK-MDR1 cells', 'Confirmed brain penetration for lead compounds.'),
      ('EXP-012 Fragment Growing', 'Project FORGE', 'Medicinal Chemistry', 'Fragment elaboration improves affinity 100-fold', NULL, 'in_progress', 'Structure-guided fragment growing, 3 vectors', 'Iterating on fragment FR-0156 for PD-L1.'),
      ('EXP-013 Cryo-EM Structure', 'Project ATLAS', 'Structural', 'Determine mTOR complex structure at <3Å resolution', 'Structure solved at 2.8Å resolution', 'completed', 'Cryo-EM, Titan Krios, 10K micrographs', 'Highest resolution mTOR structure to date.'),
      ('EXP-014 Biomarker Panel', 'Project BEACON', 'Translational', 'ctDNA panel predicts immunotherapy response with >80% accuracy', NULL, 'in_progress', 'NGS panel, 500-gene ctDNA assay', 'Developing liquid biopsy companion diagnostic.'),
      ('EXP-015 Organ-on-Chip Safety', 'Project HARBOR', 'Safety', 'Liver-on-chip detects hepatotoxicity with >90% sensitivity', 'Sensitivity = 93%, Specificity = 87%', 'completed', 'Emulate liver chip, 14-day exposure', 'Validated organ-on-chip for preclinical safety testing.')
    `);

    // Seed Drug Interactions (15 items)
    await client.query(`
      INSERT INTO drug_interactions (drug_a, drug_b, interaction_type, severity, mechanism) VALUES
      ('DRC-001 Nexatinib', 'Ketoconazole', 'Pharmacokinetic', 'Moderate', 'CYP3A4 inhibition increases Nexatinib exposure 2.5-fold.'),
      ('DRC-001 Nexatinib', 'Rifampicin', 'Pharmacokinetic', 'Severe', 'CYP3A4 induction reduces Nexatinib exposure by 80%.'),
      ('DRC-002 Immublock', 'Corticosteroids', 'Pharmacodynamic', 'Moderate', 'Immunosuppressive corticosteroids may reduce Immublock efficacy.'),
      ('DRC-007 Melanostop', 'Warfarin', 'Pharmacokinetic', 'Moderate', 'CYP2C9 inhibition may increase warfarin levels.'),
      ('DRC-008 Cyclobreak', 'Midazolam', 'Pharmacokinetic', 'Mild', 'Weak CYP3A4 inhibition slightly increases midazolam exposure.'),
      ('DRC-010 Apoptinol', 'Azithromycin', 'Pharmacokinetic', 'Mild', 'P-gp competition may slightly increase Apoptinol absorption.'),
      ('DRC-015 Glucomod', 'Metformin', 'Pharmacodynamic', 'Mild', 'Additive glucose-lowering effect. Hypoglycemia risk low.'),
      ('Erlotinib', 'Omeprazole', 'Pharmacokinetic', 'Moderate', 'Gastric pH elevation reduces erlotinib absorption by 46%.'),
      ('Osimertinib', 'Itraconazole', 'Pharmacokinetic', 'Moderate', 'CYP3A4 inhibition increases osimertinib AUC by 24%.'),
      ('Venetoclax', 'Posaconazole', 'Pharmacokinetic', 'Severe', 'Strong CYP3A4 inhibition increases venetoclax exposure 7-fold.'),
      ('Sotorasib', 'Pantoprazole', 'Pharmacokinetic', 'Moderate', 'Acid-reducing agents decrease sotorasib exposure by 57%.'),
      ('DRC-009 Jakinase', 'Methotrexate', 'Pharmacodynamic', 'Moderate', 'Additive immunosuppression risk. Monitor for infections.'),
      ('DRC-012 Raptorcept', 'Simvastatin', 'Pharmacokinetic', 'Mild', 'Minor CYP3A4 inhibition may increase statin levels.'),
      ('DRC-014 ALKinator', 'Carbamazepine', 'Pharmacokinetic', 'Severe', 'Strong CYP3A4 induction may reduce ALKinator efficacy.'),
      ('DRC-003 Inflazero', 'Live Vaccines', 'Pharmacodynamic', 'Severe', 'Immunosuppression contraindicates live vaccine administration.')
    `);

    // Seed ADMET Properties (15 items)
    await client.query(`
      INSERT INTO admet_properties (compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score) VALUES
      ('DRC-001 Nexatinib', 'Oral bioavailability: 72%, Caco-2 Papp: 22x10^-6', 'Vd: 3.2 L/kg, PPB: 96%, BBB: Low', 'CYP3A4 (major), CYP1A2 (minor), t1/2 metabolic: 8.2h', 'Renal: 15%, Hepatic: 85%, t1/2: 14h', 18.50, 82.30),
      ('DRC-007 Melanostop', 'Oral bioavailability: 85%, Caco-2 Papp: 28x10^-6', 'Vd: 1.8 L/kg, PPB: 89%, BBB: Moderate', 'CYP3A4 (major), CYP2C9 (minor), t1/2 metabolic: 12h', 'Renal: 22%, Hepatic: 78%, t1/2: 18h', 12.00, 88.50),
      ('DRC-008 Cyclobreak', 'Oral bioavailability: 67%, Caco-2 Papp: 18x10^-6', 'Vd: 2.5 L/kg, PPB: 92%, BBB: Low', 'CYP3A4 (major), UGT1A4 (minor), t1/2 metabolic: 24h', 'Renal: 30%, Hepatic: 70%, t1/2: 36h', 25.00, 75.00),
      ('DRC-010 Apoptinol', 'Oral bioavailability: 26%, Caco-2 Papp: 8x10^-6', 'Vd: 0.8 L/kg, PPB: 99.7%, BBB: None', 'CYP3A4 (major), P-gp substrate, t1/2 metabolic: 16h', 'Renal: 5%, Hepatic: 95%, t1/2: 26h', 30.00, 68.50),
      ('DRC-011 KRASblock', 'Oral bioavailability: 58%, Caco-2 Papp: 15x10^-6', 'Vd: 4.1 L/kg, PPB: 88%, BBB: Low', 'CYP3A4 (60%), CYP2C8 (40%), t1/2 metabolic: 6h', 'Renal: 18%, Hepatic: 82%, t1/2: 8h', 15.00, 79.00),
      ('DRC-012 Raptorcept', 'Oral bioavailability: 45%, Caco-2 Papp: 12x10^-6', 'Vd: 2.1 L/kg, PPB: 94%, BBB: Low', 'CYP3A4/5 (major), FMO3 (minor), t1/2 metabolic: 10h', 'Renal: 25%, Hepatic: 75%, t1/2: 15h', 22.00, 73.00),
      ('Erlotinib', 'Oral bioavailability: 59%, Caco-2 Papp: 20x10^-6', 'Vd: 3.8 L/kg, PPB: 93%, BBB: Low', 'CYP3A4 (major), CYP1A2 (major), t1/2 metabolic: 24h', 'Renal: 9%, Hepatic: 91%, t1/2: 36h', 20.00, 76.00),
      ('Osimertinib', 'Oral bioavailability: 70%, Caco-2 Papp: 25x10^-6', 'Vd: 15.8 L/kg, PPB: 95%, BBB: Yes', 'CYP3A4 (major), t1/2 metabolic: 44h', 'Renal: 14%, Hepatic: 86%, t1/2: 48h', 16.00, 85.00),
      ('Compound NX-7821', 'Oral bioavailability: 42%, Caco-2 Papp: 14x10^-6', 'Vd: 2.8 L/kg, PPB: 91%, BBB: Low', 'CYP3A4 (major), CYP2D6 (minor), t1/2 metabolic: 5h', 'Renal: 20%, Hepatic: 80%, t1/2: 7h', 19.00, 71.00),
      ('Compound PL-3392', 'Oral bioavailability: 35%, Caco-2 Papp: 10x10^-6', 'Vd: 1.5 L/kg, PPB: 87%, BBB: None', 'CYP2C19 (major), CYP3A4 (minor), t1/2 metabolic: 4h', 'Renal: 35%, Hepatic: 65%, t1/2: 6h', 14.00, 65.00),
      ('Vemurafenib', 'Oral bioavailability: ~100%, Caco-2 Papp: 30x10^-6', 'Vd: 0.5 L/kg, PPB: 99.5%, BBB: Low', 'CYP3A4 (major), t1/2 metabolic: 50h', 'Renal: 1%, Hepatic: 99%, t1/2: 57h', 28.00, 72.00),
      ('Venetoclax', 'Oral bioavailability: 25% (fasted), Caco-2 Papp: 6x10^-6', 'Vd: 1.1 L/kg, PPB: 99.9%, BBB: None', 'CYP3A4 (major), P-gp substrate, t1/2 metabolic: 24h', 'Renal: <1%, Hepatic: >99%, t1/2: 26h', 35.00, 62.00),
      ('Sotorasib', 'Oral bioavailability: 74%, Caco-2 Papp: 22x10^-6', 'Vd: 3.1 L/kg, PPB: 89%, BBB: Low', 'CYP3A4 (major), CYP2C8 (minor), t1/2 metabolic: 4h', 'Renal: 3%, Hepatic: 97%, t1/2: 5h', 17.00, 78.00),
      ('DRC-015 Glucomod', 'Oral bioavailability: 8%, Enhanced with SNAC', 'Vd: 0.3 L/kg, PPB: 98%, BBB: None', 'DPP-4 proteolysis, minimal CYP, t1/2 metabolic: N/A', 'Renal: 85%, Hepatic: 15%, t1/2: 168h', 8.00, 70.00),
      ('Macrocycle MAC-1107', 'Oral bioavailability: 22%, Caco-2 Papp: 5x10^-6', 'Vd: 1.2 L/kg, PPB: 95%, BBB: None', 'CYP3A4 (major), oxidative metabolism, t1/2 metabolic: 8h', 'Renal: 10%, Hepatic: 90%, t1/2: 12h', 21.00, 60.00)
    `);

    // Seed Literature (15 items)
    await client.query(`
      INSERT INTO literature (title, authors, journal, year, relevance_score, doi, abstract) VALUES
      ('De novo protein design by deep network hallucination', 'Anishchenko I, Pellock SJ, et al.', 'Nature', 2021, 98.5, '10.1038/s41586-021-04184-w', 'We describe an approach to protein design based on network hallucination, generating novel proteins by optimizing sequences to produce confident structure predictions.'),
      ('Highly accurate protein structure prediction with AlphaFold', 'Jumper J, Evans R, et al.', 'Nature', 2021, 99.0, '10.1038/s41586-021-03819-2', 'We developed AlphaFold, a neural network-based model that predicts protein structures with atomic accuracy even where no similar structure is known.'),
      ('KRAS G12C inhibition with sotorasib in advanced solid tumors', 'Hong DS, Fakih MG, et al.', 'NEJM', 2020, 95.0, '10.1056/NEJMoa1917239', 'Sotorasib showed promising anti-tumor activity in patients with KRAS G12C-mutated cancers.'),
      ('Bispecific antibodies: a mechanistic review of the pipeline', 'Labrijn AF, Janmaat ML, et al.', 'Nature Reviews Drug Discovery', 2019, 92.0, '10.1038/s41573-019-0028-1', 'Comprehensive review of bispecific antibody technologies and their therapeutic potential.'),
      ('Machine learning for molecular and materials science', 'Butler KT, Davies DW, et al.', 'Nature', 2018, 88.5, '10.1038/s41586-018-0337-2', 'Review of ML applications in molecular science including drug discovery and materials design.'),
      ('Antibody-drug conjugates: recent advances in linker-payload technologies', 'Drago JZ, Modi S, Chandarlapaty S', 'Annals of Oncology', 2021, 91.0, '10.1016/j.annonc.2021.01.048', 'Overview of next-generation ADC technologies with novel payloads and linkers.'),
      ('The druggable genome and support for target identification and validation', 'Finan C, Gaulton A, et al.', 'Science Translational Medicine', 2017, 87.0, '10.1126/scitranslmed.aag1166', 'Systematic classification of the druggable proteome with genetic support for therapeutic targets.'),
      ('Advances and challenges in PROTAC-mediated targeted protein degradation', 'Békés M, Langley DR, Crews CM', 'Nature Reviews Drug Discovery', 2022, 93.5, '10.1038/s41573-021-00371-6', 'Comprehensive review of PROTAC technology and its therapeutic applications.'),
      ('Organ-on-a-chip models of the human gastrointestinal tract', 'Bein A, Shin W, et al.', 'Nature Reviews Gastroenterology', 2018, 82.0, '10.1038/s41575-018-0065-0', 'Review of microfluidic organ-chip models for drug absorption and safety testing.'),
      ('Deep learning approaches for de novo drug design', 'Tong X, Liu X, et al.', 'Nature Machine Intelligence', 2021, 90.0, '10.1038/s42256-021-00418-8', 'Survey of deep generative models for molecular design in drug discovery.'),
      ('The CRISPR tool kit for genome editing and beyond', 'Pickar-Oliver A, Gersbach CA', 'Nature Reviews Molecular Cell Biology', 2019, 85.0, '10.1038/s41580-019-0159-6', 'Review of CRISPR technologies and applications in functional genomics.'),
      ('Fragment-based drug discovery: lessons and outlook', 'Erlanson DA, Fesik SW, et al.', 'Nature Reviews Drug Discovery', 2016, 86.5, '10.1038/nrd.2016.109', 'Retrospective analysis of fragment-based approaches that yielded approved drugs.'),
      ('Cryo-EM revolution in structural biology', 'Nogales E, Scheres SHW', 'Nature Methods', 2020, 84.0, '10.1038/s41592-019-0672-7', 'How cryo-EM has transformed structural biology and drug discovery.'),
      ('Artificial intelligence in drug discovery: recent advances and future perspectives', 'Vamathevan J, Clark D, et al.', 'Nature Reviews Drug Discovery', 2019, 94.0, '10.1038/s41573-019-0024-5', 'Comprehensive overview of AI/ML applications across the drug discovery pipeline.'),
      ('GLP-1 receptor agonists for the treatment of obesity', 'Wilding JPH, Batterham RL, et al.', 'NEJM', 2021, 89.0, '10.1056/NEJMoa2032183', 'Landmark trial of semaglutide for weight management in non-diabetic obesity.')
    `);

    await client.query('COMMIT');
    console.log('Database seeded successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
