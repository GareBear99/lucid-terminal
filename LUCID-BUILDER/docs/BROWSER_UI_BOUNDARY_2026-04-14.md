# Browser UI Boundary

Cognition Core does not claim that large local models execute purely inside a browser tab.

The intended product shape is:
- browser UI optional
- local native model execution authoritative
- no cloud required
- no always-on local daemon required

## Correct product wording
Use this framing:

> Browser-based interface, local native GGUF execution.

Do not use this framing:
- pure browser-native execution for arbitrary large models
- install-free universal CPU execution in tab
- serverless in the sense of remote-web-only inference

## Why
The browser is the interface layer.
The local binary or final `.llamafile` is the execution layer.
