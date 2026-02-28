# Custom Models Directory

Place your custom GGUF model files here.

## How to Use Custom Models:

1. **Download a GGUF Model**
   - Get models from HuggingFace: https://huggingface.co/models?library=gguf
   - Or convert your own using llama.cpp tools

2. **Place the Model File**
   - Copy your .gguf file to this directory:
     `models/custom_models/your-model.gguf`

3. **Enable the Model**
   - Run: `llm enable your-model`
   - LuciferAI will auto-detect it

4. **Start Using It**
   - The model will be available alongside core models
   - Check status with: `llm list`

## Example:
```bash
# Download a model
wget https://huggingface.co/model-repo/resolve/main/model.gguf

# Move it to custom directory
mv model.gguf models/custom_models/

# Enable it
llm enable model

# Verify it's active
llm list
```

## Supported Model Types:
- Any GGUF format model
- Quantized models (Q4_K_M, Q5_K_M, Q8_0, etc.)
- Compatible with llamafile backend

## Tips:
- Use Q4_K_M quantization for best size/quality balance
- Ensure you have enough RAM (model size × 1.2)
- Test with simple queries first before complex tasks

