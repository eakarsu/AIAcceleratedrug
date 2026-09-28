import http from 'node:http';

const port = Number(process.env.PORT || 8080);
const token = String(process.env.MODEL_RUNNER_TOKEN || '');
const aminoAcids = 'ACDEFGHIKLMNPQRSTVWY'.split('');

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Request exceeds 2 MB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function authenticate(request) {
  return !token || request.headers.authorization === `Bearer ${token}`;
}

function composition(sequence) {
  const normalized = String(sequence || '').toUpperCase();
  if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]{20,10000}$/.test(normalized)) throw new Error('A valid protein sequence is required.');
  const values = aminoAcids.map((symbol) => normalized.split(symbol).length - 1).map((count) => count / normalized.length);
  return {
    headline: 'Isolated transparent representation completed',
    summary: `Calculated amino-acid composition for ${normalized.length} residues.`,
    metrics: aminoAcids.map((symbol, index) => ({ label: `${symbol} fraction`, value: Number(values[index].toFixed(6)) })),
    limitation: 'Composition is not a learned protein embedding, alignment, structural prediction, or functional inference.',
    uncertainty: { type: 'coverage', standardResidueCoverage: normalized.split('').filter((symbol) => aminoAcids.includes(symbol)).length / normalized.length },
    applicability: { inDomain: true, domain: 'Protein sequence data-quality baseline only.' },
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return json(response, 200, {
      status: 'ready', isolation: 'container', contractVersion: '1.0',
      installedModels: [{ key: 'protein-composition', version: '1.0.0', execution: 'deterministic' }],
      optionalAdapters: ['esmc','chemprop','admet-ai','boltz-2','diffdock','vina','reinvent4','aizynthfinder'],
    });
    if (!authenticate(request)) return json(response, 401, { error: 'Invalid model-runner token.' });
    if (request.method !== 'POST' || request.url !== '/predict') return json(response, 404, { error: 'Route not found.' });
    const payload = await readBody(request); const key = payload.model?.key;
    if (key !== 'protein-composition') return json(response, 422, {
      error: 'Requested model is not installed in this reference runner.', code: 'model_not_installed', modelKey: key,
      requirement: 'Install pinned upstream weights and acceptance tests in a dedicated derived image; do not substitute a heuristic.',
    });
    const result = composition(payload.protein?.sequence);
    return json(response, 200, { ...result, provenance: { runnerContract: '1.0', modelKey: key, modelVersion: '1.0.0', generatedAt: new Date().toISOString() } });
  } catch (error) { return json(response, 422, { error: error.message }); }
});

server.listen(port, '0.0.0.0', () => console.log(`Scientific model runner listening on ${port}`));
