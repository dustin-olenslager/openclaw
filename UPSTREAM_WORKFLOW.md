# IronClaw Supreme - Upstream Management Workflow

## 🎯 **The Problem**

When you fork an active repository like OpenClaw, you can end up with hundreds of upstream branches (we had 394!). This clutters your repository and defeats the purpose of having a clean, focused fork.

## ✅ **The Solution: Selective Upstream Sync**

We use a **selective sync approach** that only pulls the changes we want, when we want them.

### **Remote Configuration**

```bash
# Your fork
origin → https://github.com/dustin-olenslager/ironclaw-supreme.git

# Upstream OpenClaw (original repository)  
upstream → https://github.com/openclaw/openclaw.git

# Configured to fetch ONLY main branch from upstream
git config remote.upstream.fetch '+refs/heads/main:refs/remotes/upstream/main'
```

## 🔄 **Update Process**

### **Option 1: Automated Script (Recommended)**

```bash
# Run the update script
./scripts/update-from-upstream.sh
```

The script will:
1. Switch to `ironclaw-dev` branch
2. Fetch only upstream main branch  
3. Show you what's new
4. Let you choose how to integrate changes

### **Option 2: Manual Process**

```bash
# 1. Switch to your dev branch
git checkout ironclaw-dev

# 2. Fetch upstream main only
git fetch upstream main:upstream-main --no-tags

# 3. Review changes
git log --oneline ironclaw-dev..upstream-main
git diff --stat ironclaw-dev..upstream-main

# 4. Merge (creates clean merge commit)
git merge upstream-main --no-ff -m "feat: Sync with upstream OpenClaw $(date +%Y-%m-%d)"

# 5. Test and push
git push origin ironclaw-dev

# 6. Clean up temp branch
git branch -D upstream-main
```

## 🌿 **Branch Strategy**

### **Core Branches (Never Changes)**
- **`main`** - Production-ready IronClaw Supreme
- **`ironclaw-dev`** - Development branch  
- **`ironclaw-v2`** - Legacy reference

### **Integration Workflow**
1. **Upstream sync** → `ironclaw-dev`
2. **Feature work** → `feature/branch-name` (from ironclaw-dev)
3. **Testing** → `ironclaw-dev` 
4. **Production** → `main`

## ⚡ **Advantages of This Approach**

### **✅ Clean Repository**
- No upstream branch pollution
- Only 3 core branches maintained
- Clear, focused development

### **✅ Controlled Updates**  
- You choose when to sync with upstream
- Review changes before integration
- Test upstream changes in isolation

### **✅ Best Practices**
- Follows Git flow methodology
- Maintains clear history
- Preserves your customizations

## 🚫 **What NOT to Do**

### **❌ Don't Use `git fetch --all`**
```bash
# This pulls ALL 394 branches - avoid!
git fetch upstream  
```

### **❌ Don't Merge Directly to Main**
```bash
# Always merge to dev first for testing
git checkout main
git merge upstream/main  # DON'T DO THIS
```

### **❌ Don't Rebase Upstream Changes**
```bash
# This can rewrite your custom commits
git rebase upstream/main  # DON'T DO THIS
```

## 🔧 **Setup Commands**

If you're setting this up on a new machine:

```bash
# Add upstream remote
git remote add upstream https://github.com/openclaw/openclaw.git

# Configure selective fetch
git config remote.upstream.fetch '+refs/heads/main:refs/remotes/upstream/main'

# Make update script executable
chmod +x scripts/update-from-upstream.sh
```

## 📅 **Recommended Schedule**

- **Weekly**: Check for upstream updates
- **Monthly**: Integrate stable upstream changes  
- **Before major releases**: Full upstream sync

## 🛡️ **Preserving Your Customizations**

Your IronClaw Supreme features will be preserved because:

1. **Merge commits** maintain parallel history
2. **Dev branch testing** catches conflicts early
3. **Selective sync** avoids unwanted changes
4. **Documentation** tracks what's custom vs upstream

## 🎉 **Result**

Clean, maintainable fork with:
- Latest upstream features when YOU want them
- All your custom hardening preserved
- No branch pollution
- Professional Git workflow

---

**Next update?** Just run `./scripts/update-from-upstream.sh` and choose your integration approach!