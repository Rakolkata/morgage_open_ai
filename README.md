# Offline mortgage-document extraction

This project runs a local vLLM endpoint for `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` (a Qwen-based 14B model) and a one-document-at-a-time mortgage extraction CLI. The vLLM and pipeline containers share only a Docker network marked `internal`; no service port is published. The pipeline reads PDFs from a read-only inbox and writes a JSON result to the local outbox.

The pipeline extracts native PDF text locally and uses local Tesseract OCR for scanned pages, then sends the resulting **unredacted text** to the local vLLM model for extraction or auditing. The configured Qwen model is text-only; the PDF itself is not attached to the model request. This means names, account numbers, and other PII in extracted text are visible to the model. OCR rendering excludes PDF annotations so unsupported watermark appearances do not prevent scanned-page processing; annotation-only text is not included in OCR. Model-provided source quotes are resolved locally to page numbers and PDF-point bounding boxes for side-by-side review. The JSON report records that PII sanitization was not applied; protect it and the model service as sensitive.

## Offline deployment

This procedure targets **Ubuntu Server** on a Linux host with an NVIDIA GPU. Prepare the isolated machine before disconnecting it: Ubuntu, Docker Engine with the Compose plugin, the NVIDIA driver, and NVIDIA Container Toolkit must already be installed and working. An offline host cannot fetch missing drivers, container images, Python packages, or model files. Commands below assume your account can run Docker; if you add your account to the `docker` group, note that group grants root-equivalent control of the host.

### 1. Prepare artifacts on a connected Ubuntu staging machine

Use an approved staging machine and model access. Install Docker Engine/Compose and the NVIDIA driver/toolkit following the approved Ubuntu instructions for that system; the Hugging Face CLI and Docker need network access at this stage:

```bash
cd /path/to/AI
sudo apt-get update
sudo apt-get install -y python3 python3-venv
python3 -m venv .venv-hf
. .venv-hf/bin/activate
  python -m pip install --upgrade pip huggingface_hub

# Authenticate only if the approved model repository requires it.
hf download deepseek-ai/DeepSeek-R1-Distill-Qwen-14B \
  --local-dir models/DeepSeek-R1-Distill-Qwen-14B

docker pull vllm/vllm-openai:v0.10.2
docker compose build pipeline
docker save \
  vllm/vllm-openai:v0.10.2 \
  mortgage-pipeline:offline-v1 \
  --output offline-images.tar
deactivate
```

Review and scan the downloaded checkpoint and images according to your organization's process. Confirm the model directory contains its configuration, tokenizer, and all weight shards. Transfer `offline-images.tar`, the complete project directory (including `compose.yaml` and `.dockerignore`), and the model directory to the Ubuntu target using approved media. Never transfer Hugging Face credentials. Avoid placing actual loan PDFs in the transfer bundle.

### 2. Verify prerequisites on the Ubuntu target

After transferring the files, run these checks on the target. `nvidia-smi` should show the GPU, and Docker must be able to access it:

```bash
nvidia-smi
docker --version
docker compose version
docker run --rm --gpus all \
  --entrypoint python3 \
  vllm/vllm-openai:v0.10.2 \
  -c 'import torch; assert torch.cuda.is_available(); print(torch.cuda.get_device_name(0))'
```

If these commands fail, resolve the driver, Docker Compose, or NVIDIA Container Toolkit setup before proceeding. Check the image/model files are present, then load the container images:

```bash
cd /path/to/AI
test -f offline-images.tar
test -f models/DeepSeek-R1-Distill-Qwen-14B/config.json
docker load --input offline-images.tar
```

The target needs no Hugging Face login, external model cache, or Internet connection at runtime. Do not run `docker pull`, `docker compose pull`, or `docker compose build` on it.

#### Troubleshooting NVIDIA cgroup/device-rule errors

If `docker compose up -d vllm` fails before the container starts with an error such as `nvidia-container-cli: mount error: failed to add device rules` or `BPF_CGROUP_DEVICE ... operation not permitted`, this is the NVIDIA Container Toolkit / Docker GPU runtime setup, not a model-loading problem. First check whether the GPU works on the Ubuntu host and capture Docker's cgroup configuration:

```bash
nvidia-smi
docker info --format 'Cgroup driver: {{.CgroupDriver}}; cgroup version: {{.CgroupVersion}}; runtimes: {{json .Runtimes}}'
```

If `nvidia-smi` works on the host but the GPU-container check fails, verify that NVIDIA Container Toolkit is installed and configured for Docker. On a connected, approved system, or using packages already staged for this offline host, an administrator can configure the runtime and restart Docker:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Repeat the GPU-container check above. If the same `BPF_CGROUP_DEVICE` permission error remains, the VM or its parent hypervisor/container is not permitting the device-cgroup operation required by this runtime configuration. Ask the cloud/platform administrator to enable supported NVIDIA GPU passthrough and cgroup device access for the VM, or use a GPU VM configuration that supports Docker with NVIDIA Container Toolkit. Do not disable device-cgroup protections or change NVIDIA `no-cgroups` settings as a workaround for a mortgage-PII deployment.

If the vLLM logs show `Application startup complete` but Docker reports the container unhealthy with `exec: "python": executable file not found`, the API is up and the health check is using the wrong executable name. The vLLM image provides `python3`; update to this Compose configuration and recreate the container so Docker adopts the corrected check:

```bash
docker compose up -d --force-recreate vllm
docker compose ps
docker inspect --format '{{range .State.Health.Log}}{{println "exit:" .ExitCode "output:" .Output}}{{end}}' "$(docker compose ps -q vllm)"
```

Wait for the health status to become `healthy` before starting the pipeline.

### 3. Start the model and process a PDF

Create local data directories, start vLLM, and wait until Docker reports it healthy:

```bash
cd /path/to/AI
mkdir -p data/inbox data/outbox
docker compose up -d vllm
docker compose ps
docker compose logs -f vllm
```

Press `Ctrl+C` to stop following logs; this does not stop the container. In another terminal, confirm vLLM is healthy with `docker compose ps`, copy one approved PDF into the inbox, and process it:

```bash
cp /path/to/approved/loan-package.pdf data/inbox/loan-package.pdf
docker compose run --rm pipeline /data/inbox/Maxson_PostClose_Test_Dummy_Identifiers.pdf
ls -lt data/outbox/*.verified.json
```

To apply a custom audit instruction, place a UTF-8 text file in the same approved inbox and pass its container path as the second argument. The JSON result will contain an `audit_table` with these columns: `Audit Area`, `Document Checked`, `Issue Found`, `Guideline Referenced`, and `Exact Quote/Data Point`.

```bash
cp /path/to/approved/audit-instructions.txt data/inbox/audit-instructions.txt
docker compose run --rm pipeline \
  /data/inbox/Maxson_PostClose_Test_Dummy_Identifiers.pdf \
  /data/inbox/audit-instructions.txt
```

To run every prompt in the supplied CSV against one loan PDF, put both files in the
inbox and pass the CSV as the second argument. The pipeline extracts the PDF text
once and sends it unredacted to the local model for each prompt. The outbox receives one JSON report
per prompt key, plus a combined summary report. Each per-prompt file is written as soon
as that prompt finishes; an in-progress summary is updated after each prompt and remains
available if the run is interrupted. Filenames include the PDF hash, prompt index, and
a filesystem-safe version of the prompt key. A
terminal progress bar shows completed prompts and the prompt currently being processed.
When output is redirected, progress is written as separate lines to standard error.
Failed prompts are recorded in the report, and the command exits with a non-zero
status.

```bash
docker compose run --rm pipeline \
  /data/inbox/loan-package.pdf \
  "/data/inbox/Post Closing Prompts.csv"
ls -lt data/outbox/*.prompt-*.json data/outbox/*.post-closing-audits.json
```

The CSV must have `Prompt Key (DO NOT EDIT)` and `Prompt Text` columns. UTF-8 and
Windows-1252 CSV files are supported. On Windows, run the same container command
from PowerShell after starting Docker Desktop and the vLLM service:

```powershell
docker compose up -d vllm
docker compose run --rm pipeline /data/inbox/loan-package.pdf "/data/inbox/Post Closing Prompts.csv"
Get-ChildItem C:\AI\data\outbox\*.prompt-*.json
```

The result filename uses a prefix of the PDF's SHA-256 digest rather than its original filename. Review the JSON alongside the source PDF; filtered pages, missing evidence, and discrepancies require human review. Keep both directories on approved, encrypted local storage with restricted permissions.

### 4. Stop the service

```bash
docker compose down
```

For additional documents, leave vLLM running and repeat the copy and `docker compose run` commands. The pipeline image is built on staging because installing its pinned Python dependencies requires package access. Runtime uses Hugging Face offline mode and does not download model files.

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

# Pull vLLM and build the local PDF/OCR processing image.
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
- Extracted text, including PII, is sent unredacted to the local vLLM model. The PDF itself is not sent; PDF text extraction and OCR happen inside the pipeline container. Model-generated audit quotes or extraction evidence may include sensitive information, so protect the model service and output directory accordingly.
- Tesseract runs locally. OCR and model extraction can miss or misread information; review source PDFs alongside the result.
- `PASS_MATH_ONLY` means only that the source income sum and reported DTI/LTV could be recomputed consistently and source evidence was mapped. Missing values, conflicts, unresolved evidence, and mismatches require underwriter review. This is not an underwriting recommendation or approval.

## Operational notes

The 14B checkpoint uses substantial GPU memory. The supplied Compose configuration limits its context to 16K tokens and reserves vLLM at up to 90% of available VRAM; reducing `--max-model-len` further may be necessary if startup exhausts memory. Quantized weights or additional GPUs may still be needed for longer contexts on smaller GPUs. Verify GPU compatibility and memory in staging before transfer. Keep the offline model directory read-only and restrict access to the Docker daemon, input PDFs, and result files.
