# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Model

### Threat Profile

Lucid Terminal operates with a **user-level threat model**:

- **In Scope**: Protection against malicious code execution, data exfiltration, privilege escalation within user context
- **Out of Scope**: System-level attacks, kernel exploits, physical access attacks

### Security Features

#### 1. Code Execution Safety

**LLM Output Sanitization**:
- All AI-generated code is syntax-validated before execution
- No `eval()` or dynamic code execution in renderer process
- Scripts run with user permissions only (no sudo/admin)
- Sandboxed test environment for validation

**Implementation**:
```typescript
// electron/core/executor/scriptExecutor.ts
async validateSyntax(code: string, language: string): Promise<boolean> {
  // Language-specific syntax validation
  // Returns false if malicious patterns detected
}
```

#### 2. Data Protection

**FixNet Encryption**:
- Algorithm: AES-256-GCM (NIST approved)
- Key Derivation: PBKDF2 with 100,000 iterations
- Authentication: HMAC-SHA256 for integrity
- Storage: User home directory (`~/.lucid/fixnet/`)

**No External Data Transmission**:
- 72% offline operation (no network calls)
- Ollama API is local-only (localhost:11434)
- No telemetry, analytics, or crash reporting
- User data never leaves the machine

#### 3. IPC Security

**Electron Process Isolation**:
```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('lucidAPI', {
  // Only safe, validated methods exposed
  command: (input: string) => ipcRenderer.invoke('command', input),
  // No direct filesystem or shell access
});
```

**Message Validation**:
- All IPC messages validated with TypeScript types
- Input sanitization on both main and renderer sides
- Rate limiting on expensive operations

#### 4. Filesystem Access Control

**Restricted Operations**:
- Scripts created in `~/Documents/lucid-scripts/` only
- No write access to system directories
- No automatic execution without validation
- User confirmation for file operations

**Permission Model**:
- Read: Current directory and subdirectories
- Write: User home directory only
- Execute: Validated scripts with user confirmation

#### 5. Model Security

**Ollama Sandboxing**:
- Models run in Ollama's sandboxed environment
- No direct system access from models
- Resource limits enforced by Ollama
- No persistent state across calls

**Model Validation**:
- Only officially published Ollama models supported
- No custom model loading (prevents supply chain attacks)
- Model checksums verified by Ollama

### Known Limitations

#### Current Vulnerabilities

1. **Dependency Supply Chain**
   - Risk: npm packages could be compromised
   - Mitigation: Regular `npm audit`, pinned versions
   - Status: Ongoing monitoring

2. **Electron Security**
   - Risk: Electron framework vulnerabilities
   - Mitigation: Regular updates, nodeIntegration disabled
   - Status: Following Electron security best practices

3. **Local Privilege Escalation**
   - Risk: User could execute malicious scripts
   - Mitigation: Syntax validation, sandboxed testing
   - Status: User responsibility for script review

#### Out of Scope

The following threats are **not addressed** by Lucid Terminal's security model:

- Physical access attacks
- Keyloggers or screen capture malware
- OS-level privilege escalation
- Side-channel attacks (timing, cache)
- Social engineering attacks

## Reporting a Vulnerability

### Responsible Disclosure

We take security seriously. If you discover a vulnerability:

**DO**:
- Report privately via email or GitHub Security Advisory
- Provide detailed reproduction steps
- Allow reasonable time for patch (45 days)
- Coordinate disclosure timing with maintainers

**DON'T**:
- Publicly disclose before patch is available
- Exploit the vulnerability for personal gain
- Test on systems you don't own

### Reporting Process

#### 1. Private Report (Preferred)

**GitHub Security Advisory**:
1. Go to https://github.com/GareBear99/lucid-terminal/security/advisories
2. Click "Report a vulnerability"
3. Fill out the form with:
   - Vulnerability description
   - Affected versions
   - Reproduction steps
   - Proof of concept (if applicable)
   - Suggested fix (if known)

**Email**:
- Contact: Via GitHub profile
- Subject: `[SECURITY] Lucid Terminal Vulnerability`
- Include: Same information as above

#### 2. Public Report (Non-Critical)

For low-severity issues (documentation, UI bugs without security impact):
- Open a regular GitHub issue
- Tag with `security` label
- No embargo required

### Response Timeline

| Severity | Response Time | Patch Time |
|----------|--------------|------------|
| Critical | 24 hours | 7 days |
| High | 48 hours | 14 days |
| Medium | 5 days | 30 days |
| Low | 10 days | 60 days |

**Severity Definitions**:
- **Critical**: Remote code execution, data exfiltration, privilege escalation
- **High**: Authentication bypass, XSS, local code execution
- **Medium**: Denial of service, information disclosure
- **Low**: UI issues, non-exploitable bugs

### Acknowledgments

Security researchers who responsibly disclose vulnerabilities will be:
- Acknowledged in CHANGELOG.md (if desired)
- Listed in SECURITY.md Hall of Fame
- Invited to test patches before release

**Hall of Fame**:
- *No reports yet - be the first!*

## Security Best Practices for Users

### 1. Keep Updated

```bash
# Check for updates
gh release list --repo GareBear99/lucid-terminal

# Download latest
gh release download v1.0.0 --repo GareBear99/lucid-terminal
```

### 2. Review Generated Scripts

**Before executing AI-generated code**:
- Read the script completely
- Understand what it does
- Check for suspicious operations (rm -rf, curl, wget)
- Verify file paths and permissions

### 3. Use Least Privilege

**Don't run Lucid Terminal as admin**:
```bash
# ❌ Bad
sudo open "Lucid Terminal.app"

# ✅ Good
open "Lucid Terminal.app"
```

### 4. Isolate Sensitive Environments

**For production systems**:
- Use separate user account for Lucid Terminal
- Don't store credentials in scripts
- Use environment variables for secrets
- Enable audit logging

### 5. Monitor FixNet Dictionary

**Regular audits**:
```bash
# Check FixNet size
du -sh ~/.lucid/fixnet/

# Review recent additions
ls -lt ~/.lucid/fixnet/fixes/ | head

# Backup periodically
cp -r ~/.lucid/fixnet/ ~/.lucid/fixnet.backup/
```

## Vulnerability History

### v1.0.0 (2026-02-28)
- Initial release
- No known vulnerabilities

---

## Security Contact

- **GitHub**: [@GareBear99](https://github.com/GareBear99)
- **Security Advisories**: https://github.com/GareBear99/lucid-terminal/security/advisories

## References

1. [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
2. [OWASP Top 10](https://owasp.org/www-project-top-ten/)
3. [CWE Top 25](https://cwe.mitre.org/top25/)
4. [NIST Cryptographic Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)

---

**Last Updated**: 2026-02-28  
**Version**: 1.0.0
