# Offline mortgage-document extraction

This project runs a local vLLM endpoint for `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` (a Qwen-based 14B model) and a one-document-at-a-time mortgage extraction CLI. The vLLM and pipeline containers share only a Docker network marked `internal`; no service port is published. The pipeline reads PDFs from a read-only inbox and writes a JSON result to the local outbox.

The pipeline follows the supplied flowchart: page classification and filtering of blank, detected cover, and disclosure pages; native PDF text extraction with local Tesseract OCR for scanned pages; local Presidio PII tokenization; local vLLM extraction; and Python income/DTI/LTV recomputation. Model-provided source quotes are resolved locally to page numbers and PDF-point bounding boxes for side-by-side review; quote text is not stored. PII hits also include page and bounding-box locations. Filtered pages are listed in the result for manual completeness review because heuristic classification can omit relevant information.

## Offline deployment

This setup requires a Linux Docker host with an NVIDIA GPU and compatible NVIDIA Container Toolkit. Docker Desktop on Windows requires its Linux/WSL2 GPU configuration. For a truly offline target:

1. On a separate, approved staging system, download the approved model checkpoint and obtain the versioned vLLM image `vllm/vllm-openai:v0.10.2`. For example, with the Hugging Face CLI already installed and authorized on that staging system:

   ```powershell
   hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B --local-dir models\DeepSeek-R1-Distill-Qwen-14B
   docker pull vllm/vllm-openai:v0.10.2
   docker compose build pipeline
   ```

   Review and scan these artifacts under your organization's process.
2. Transfer the model directory, container images, and this project to the isolated host using approved media. The model directory must contain the model configuration, tokenizer, and weight shards. Do not mount credentials or use Hugging Face credentials on the isolated host.
3. Load the images on the target host with `docker load -i offline-images.tar`, create the local inbox/outbox directories, and place the model files under `models/DeepSeek-R1-Distill-Qwen-14B`.
4. Run the services and a document. The output filename is based on a prefix of the input's SHA-256 digest rather than its potentially identifying source filename:

   ```powershell
   New-Item -ItemType Directory -Force data\inbox,data\outbox | Out-Null
   docker compose up -d vllm
   Copy-Item 'C:\approved\loan-package.pdf' 'data\inbox\loan-package.pdf'
   docker compose run --rm pipeline /data/inbox/loan-package.pdf
   Get-ChildItem data\outbox\*.verified.json
   docker compose down
   ```

Build/package on staging (not the isolated host):

```powershell
docker save vllm/vllm-openai:v0.10.2 mortgage-pipeline:offline-v1 -o offline-images.tar
```

The pipeline image build installs pinned Python dependencies and the spaCy English model, and therefore requires staging-time package access. Runtime is configured for Hugging Face offline mode; it does not download model files. Do not run `docker compose pull` or build on the isolated host.

## Run locally on Windows

These steps are for a connected development machine. They download the model and container dependencies, so do not use them on a machine that must remain disconnected or under a policy that forbids those downloads. The mortgage PDFs are mounted only into the local pipeline container; do not use real PII for an unapproved development environment.

Prerequisites:

- Docker Desktop configured for **Linux containers**, with NVIDIA GPU support enabled in its WSL2 backend.
- A supported NVIDIA GPU and driver. Run `nvidia-smi` in PowerShell to check that the host sees the GPU.
- Python and any required model access approved. Do not put access tokens in this project.

From PowerShell:

```powershell
Set-Location C:\AI

# Install Hugging Face CLI in an isolated Python environment. This avoids
# changing packages or Scripts executables in the shared Python installation.
py -3.12 -m venv "$env:USERPROFILE\.venvs\hf-cli"
& "$env:USERPROFILE\.venvs\hf-cli\Scripts\python.exe" -m pip install --upgrade pip huggingface_hub

# Download the model into the directory expected by compose.yaml.
& "$env:USERPROFILE\.venvs\hf-cli\Scripts\hf.exe" download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B --local-dir models\DeepSeek-R1-Distill-Qwen-14B

# Pull vLLM and build the local PDF/OCR/PII processing image.
docker compose pull vllm
docker compose build pipeline

# Create local input and output folders, then start vLLM.
New-Item -ItemType Directory -Force data\inbox,data\outbox | Out-Null
docker compose up -d vllm
docker compose logs -f vllm
```

Wait for vLLM to report healthy in the logs. Ctrl+C exits log-following but leaves the service running; check its state with `docker compose ps`. Copy a test PDF into `data\inbox`, then run:

```powershell
Copy-Item 'C:\path\to\test-loan-package.pdf' 'C:\AI\data\inbox\test-loan-package.pdf'
docker compose run --rm pipeline /data/inbox/test-loan-package.pdf
Get-ChildItem C:\AI\data\outbox\*.verified.json
Get-Content (Get-ChildItem C:\AI\data\outbox\*.verified.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

The result filename uses the input PDF's SHA-256 prefix, not its original filename. Review the JSON and the original PDF together; filtered pages, missing evidence, or discrepancies require human review. When finished, stop vLLM:

```powershell
docker compose down
```

To process more PDFs, copy them into the inbox and repeat the `docker compose run` command while vLLM is running. Keep the inbox and outbox on local encrypted storage with access restricted to approved users.

## Network and data controls

- There are no published host ports. The pipeline can call vLLM over the Docker `internal` network, which has no default route to external networks. Compose is not a substitute for physical isolation or host firewall policy; enforce those controls too, and treat access to the Docker daemon as privileged.
- Input PDFs are mounted read-only. Do not bind the inbox or outbox to network shares if the air-gap requirement prohibits those paths.
- PII is tokenized in memory before inference. Raw documents, sanitized prompt text, and model reasoning are not written to the output. The JSON report contains the source hash, extracted loan values, tokenized-PII locations, and validation status; treat it as sensitive and protect the outbox accordingly.
- Tesseract and Presidio run locally. PII detection is not guaranteed to catch every identifier; review source PDFs alongside the result.
- `PASS_MATH_ONLY` means only that the source income sum and reported DTI/LTV could be recomputed consistently and source evidence was mapped. Missing values, conflicts, unresolved evidence, and mismatches require underwriter review. This is not an underwriting recommendation or approval.

## Operational notes

The model needs substantial GPU memory; the 14B checkpoint may require quantized weights or additional GPUs depending on available VRAM. This deployment uses the supplied checkpoint as-is and does not enable a quantization mode. Verify GPU compatibility and memory in staging before transfer. Keep the offline model directory read-only and restrict access to the Docker daemon, input PDFs, and result files.
