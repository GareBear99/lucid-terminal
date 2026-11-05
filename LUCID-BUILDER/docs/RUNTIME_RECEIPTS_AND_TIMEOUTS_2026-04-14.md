# Runtime Receipts and Timeout Doctrine

This repo now treats direct local runtime execution as a receipt-bearing operation. Every direct invocation may write a runtime receipt containing adapter, backend identity, prompt hash, finish reason, duration, output preview, and runtime metadata.

## Required timeout classes

- overall timeout
- first-output timeout (no-generation timeout)
- idle timeout after generation begins
- max-output-byte guard

## Required state classes

- BOOTING
- MODEL_LOADING
- TOKENIZING
- GENERATING
- STREAM_IDLE
- COMPLETED
- TIMED_OUT
- FAILED

## Product framing

The browser may host the interface. Authoritative inference remains local native execution through a direct runtime lane such as llamafile, llama-cli, or another CPU-capable GGUF binary.
