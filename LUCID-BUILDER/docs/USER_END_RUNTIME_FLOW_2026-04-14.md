# User-End Runtime Flow

## What the user installs
The user installs Cognition Core locally or runs it from a local unpacked bundle.

The UI can be browser-hosted, but model execution remains local and native.
There is no always-on model server requirement.

## What the user needs locally
One of these two paths:

1. Bundled baseline path
- use the included exemplar artifact
- runs entirely in-process

2. Real local model path
- a local GGUF file
- a direct binary such as `llama-cli`, a compiled native runtime, or a final `.llamafile`

## What happens when the user sends a prompt
1. The UI or local shell passes the prompt to Cognition Core.
2. Cognition Core writes temporary prompt files locally to avoid shell quoting failures.
3. Cognition Core invokes the local runtime directly.
4. The runtime is monitored for:
   - model loading
   - tokenization
   - first output / generation start
   - idle stalls
   - completion or failure
5. If no generation begins in time, the run fails loudly.
6. A runtime receipt is written locally.
7. The user sees the result in the UI or shell.

## What the receipt contains
- adapter and backend identity
- prompt hash and system prompt hash
- runtime timings
- finish reason
- output preview
- metadata trace

## Fast user commands
### Ask the bundled baseline a question
```bash
scripts/operator/run_local_prompt.sh "Audit this repo and preserve constraints."
```

### Ask a local GGUF model a question
```bash
export COGNITION_RUNTIME_ADAPTER=command
export COGNITION_MODEL_PATH=/absolute/path/to/model.gguf
export COGNITION_COMMAND_TEMPLATE='/absolute/path/to/llama-cli -m {model} -f {combined_prompt_file}'
scripts/operator/run_local_prompt.sh "Summarize the system state and next actions."
```

### Benchmark the local GGUF model
```bash
export COGNITION_RUNTIME_ADAPTER=command
export COGNITION_MODEL_PATH=/absolute/path/to/model.gguf
export COGNITION_COMMAND_TEMPLATE='/absolute/path/to/llama-cli -m {model} -f {combined_prompt_file}'
scripts/operator/benchmark_local_model.sh
```


## Local runtime env file
After `scripts/operator/setup_local_user_runtime.sh`, edit `.env.direct-runtime` once and the operator scripts will auto-load it on each run. That keeps the user path local and simple without requiring a daemon or repeated shell exports.


## Quick GGUF / llamafile switchover

When you are ready to move from the bundled baseline to your own local model, use:

```bash
scripts/operator/register_gguf_runtime.sh --gguf /absolute/path/to/model.gguf --binary /absolute/path/to/llama-cli
```

Or for a final self-contained executable:

```bash
scripts/operator/register_gguf_runtime.sh --llamafile /absolute/path/to/model.llamafile
```

Then verify with:

```bash
scripts/operator/runtime_status.sh
scripts/operator/run_local_prompt.sh "hello"
```
