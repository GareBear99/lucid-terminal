# Interrupt Handling for Model Downloads

## Overview

LuciferAI now properly handles Ctrl+C interrupts during model downloads by automatically cleaning up partial/corrupted files.

## Behavior

### ✅ Before the Fix
When pressing Ctrl+C during a download:
- ❌ Partial file was left on disk
- ❌ Resume message was confusing (file was corrupt)
- ❌ User had to manually delete the file
- ❌ Waste of disk space

### ✅ After the Fix
When pressing Ctrl+C during a download:
- ✅ Partial file is automatically deleted
- ✅ Clean error message
- ✅ User can retry immediately
- ✅ No disk space wasted

## Implementation

### File: `core/model_download.py`

```python
except KeyboardInterrupt:
    print("\n⚠️  Download interrupted by user")
    
    # Delete the partial file to avoid corruption
    if output_path.exists():
        try:
            output_path.unlink()
            print(f"🗑️  Deleted partial download: {output_path.name}")
            print(f"   Run the install command again to restart")
        except Exception as e:
            print(f"⚠️  Could not delete partial file: {e}")
            print(f"📦 Partial file at: {output_path}")
    
    return False
```

## Commands Affected

All model installation commands now properly handle interrupts:

### Individual Model Install
```bash
luci install llama3.2
# Press Ctrl+C during download
# → Partial file deleted automatically
```

### Install Core Models
```bash
luci install core models
# Press Ctrl+C during any model download
# → Current model's partial file deleted
# → Other completed models remain
```

### Install All Models
```bash
luci install all models
# Press Ctrl+C during any model download
# → Current model's partial file deleted
# → All previously completed models remain
```

## Testing

### Test Script
Run the test script to verify cleanup works:

```bash
cd tests
python3 test_interrupt_cleanup.py
# Press Ctrl+C during download
# Verify cleanup success message
```

### Manual Testing
1. Start any model installation:
   ```bash
   luci install mistral
   ```

2. Press Ctrl+C during download

3. Verify output:
   ```
   ⚠️  Download interrupted by user
   🗑️  Deleted partial download: mistral-7b-instruct-v0.2.Q4_K_M.gguf
      Run the install command again to restart
   ```

4. Check models directory:
   ```bash
   ls ~/.luciferai/models/
   # Should NOT contain partial file
   ```

5. Retry installation:
   ```bash
   luci install mistral
   # Should start fresh (not resume)
   ```

## User Experience

### Old Behavior
```
LuciferAI> install llama3.2
📥 Downloading...  50% | 1.0GB/2.0GB
^C
⚠️  Download interrupted by user
📦 Partial file saved: llama-3.2-3b-instruct-Q4_K_M.gguf
   Run the install command again to resume

LuciferAI> install llama3.2
❌ File verification failed (corrupt file)
   Please manually delete ~/.luciferai/models/llama-3.2-3b-instruct-Q4_K_M.gguf
```

### New Behavior
```
LuciferAI> install llama3.2
📥 Downloading...  50% | 1.0GB/2.0GB
^C
⚠️  Download interrupted by user
🗑️  Deleted partial download: llama-3.2-3b-instruct-Q4_K_M.gguf
   Run the install command again to restart

LuciferAI> install llama3.2
📥 Downloading...  0% | Starting fresh
```

## Error Cases

### Cannot Delete Partial File
If deletion fails (e.g., permissions issue):

```
⚠️  Download interrupted by user
⚠️  Could not delete partial file: Permission denied
📦 Partial file at: /Users/user/.luciferai/models/model.gguf
```

User can manually delete:
```bash
rm ~/.luciferai/models/model.gguf
```

## Benefits

1. **Better UX** - No manual cleanup needed
2. **Safer** - No corrupt files left on disk
3. **Cleaner** - No wasted disk space
4. **Consistent** - All install commands behave the same
5. **Documented** - Clear messages guide user

## Related Files

- `core/model_download.py` - Main download logic
- `core/enhanced_agent.py` - Install handlers
- `tests/test_interrupt_cleanup.py` - Test script
- `IMPLEMENTATION_SUMMARY.md` - Overall implementation

## Future Enhancements

Potential improvements:
- [ ] Add resume capability (with integrity checks)
- [ ] Save download metadata for smarter resume
- [ ] Add cleanup for orphaned files
- [ ] Add disk space monitoring during download
