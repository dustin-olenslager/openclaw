# Community Skills Validator

Automated validation system for community OpenClaw skills against the official awesome-openclaw-skills repository.

## Purpose

Enforces the community skills policy programmatically:
- ✅ Auto-validates skills against https://github.com/VoltAgent/awesome-openclaw-skills
- ✅ Blocks installation of non-approved skills  
- ✅ Requires explicit confirmation for approved skills
- ✅ Maintains audit log of all installation attempts
- ✅ Provides safety warnings and repository information

## Usage

### Manual Validation
```bash
node validate-skill.js <skill-name>
```

### Integration with Skill Installation
The validator integrates with any skill installation process by:
1. Checking if requested skill is on the approved list
2. Displaying safety information and repository details
3. Requiring explicit user confirmation
4. logging the installation attempt

## Features

- **Real-time validation** against latest awesome-openclaw-skills list
- **Caching** of approved skills list (1 hour TTL) for performance
- **Safety scoring** based on GitHub metrics (stars, forks, last updated)
- **Audit logging** with timestamps and user decisions
- **Graceful fallback** when GitHub API is unavailable

## Security Policy

**Default**: Build our own skills. Community is the exception.
**Requirements**: Skills must be:
1. Listed on https://github.com/VoltAgent/awesome-openclaw-skills
2. Pass automated safety checks
3. Receive explicit user approval

**Never install a community skill without ALL requirements met.**

## Files

- `validate-skill.js` - Main validation logic
- `approved-skills.json` - Cached approved skills list  
- `audit.log` - Installation attempt log
- `SKILL.md` - This documentation

## Example

```bash
$ node validate-skill.js weather-forecast
✅ APPROVED: weather-forecast found in awesome-openclaw-skills
📊 Repository: github.com/weather-dev/openclaw-weather
⭐ Stars: 45 | 🍴 Forks: 12 | 🔄 Updated: 2026-02-15
🔒 Safety Score: 8/10 (Good)

⚠️  COMMUNITY SKILL WARNING:
This skill is from an external developer. Review the code before installation.

Install weather-forecast? (y/N): 
```

## Integration Notes

This skill can be called by other installation scripts or manually by users. It provides both programmatic (exit codes) and human-readable output.