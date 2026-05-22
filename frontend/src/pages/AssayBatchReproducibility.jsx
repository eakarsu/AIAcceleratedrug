import React, { useEffect, useState } from 'react';

export default function AssayBatchReproducibility() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/assay-batch-reproducibility')
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  return (
    <div className="container">
      <h1>Assay Batch Reproducibility</h1>
      <p>Review assay coefficient variance, Z-prime controls, and rerun recommendations.</p>
      <div className="grid">
        {data && Object.entries(data.summary).map(([key, value]) => (
          <div className="card" key={key}>
            <h3>{key.replaceAll('_', ' ')}</h3>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="card">
        {(data?.batches || []).map((batch) => (
          <div key={batch.batch} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
            <strong>{batch.batch}</strong>
            <div>{batch.target} - CV {batch.cv_percent}% - Z-prime {batch.z_prime} - {batch.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
