# GPU runner deployment profile

This directory is the production boundary for ESM C, Boltz-2, and DiffDock. The host application never invokes those research CLIs directly. Each accepted image must implement `runner-contract.openapi.yaml`, pin its image by digest, mount immutable checksummed weights read-only, write outputs only to its artifact volume, and report its actual accelerator and checkpoint from `/health`.

The compose file deliberately fails until every required image, checkpoint version, token, model-cache root, and artifact root is supplied. That prevents an empty or heuristic container from being mistaken for a scientific model.

Example application routing after accepted runners are healthy:

```dotenv
MODEL_RUNNER_ESMC_URL=http://127.0.0.1:35601
MODEL_RUNNER_ESMC_TOKEN=replace-with-a-secret
MODEL_RUNNER_BOLTZ_2_URL=http://127.0.0.1:35602
MODEL_RUNNER_BOLTZ_2_TOKEN=replace-with-a-secret
MODEL_RUNNER_DIFFDOCK_URL=http://127.0.0.1:35603
MODEL_RUNNER_DIFFDOCK_TOKEN=replace-with-a-secret
```

The current Apple M2 Pro host has no NVIDIA CUDA device, so these services are configured but not launched or marked ready here. Run them on a compatible GPU host, register their exact benchmark datasets and acceptance thresholds in PostgreSQL, and only then promote the model version to `ready`.
