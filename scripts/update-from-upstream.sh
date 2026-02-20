#!/bin/bash

# IronClaw Supreme - Upstream Update Script
# Selectively pulls upstream changes without all the branches

echo "🦾 IronClaw Supreme - Upstream Update Process"
echo "============================================="

# Ensure we're on the right branch
echo "📍 Switching to ironclaw-dev branch..."
git checkout ironclaw-dev

# Fetch ONLY the main branch from upstream
echo "🔄 Fetching upstream main branch (no other branches)..."
git fetch upstream main:upstream-main --no-tags

# Show what's new in upstream
echo -e "\n📊 New commits in upstream since our last sync:"
git log --oneline --graph ironclaw-dev..upstream-main | head -20

echo -e "\n🤔 What would you like to do?"
echo "1. Review changes first (git diff ironclaw-dev..upstream-main)"
echo "2. Merge upstream changes into ironclaw-dev"
echo "3. Create a new integration branch for testing"
echo "4. 🧪 Advanced: Browse experimental features (power users)"
echo "5. Exit without changes"

read -p "Choose option (1-5): " choice

case $choice in
    1)
        echo -e "\n📝 Showing changes from upstream..."
        git diff --stat ironclaw-dev..upstream-main
        echo -e "\nRun this script again when ready to merge."
        ;;
    2)
        echo -e "\n🔀 Merging upstream changes into ironclaw-dev..."
        # Create a merge commit with details about the upstream sync
        git merge upstream-main --no-ff -m "feat: Sync with upstream OpenClaw

- Merged latest upstream changes from main branch
- Maintains IronClaw Supreme customizations and hardening
- Date: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
- Upstream commit: $(git rev-parse --short upstream-main)"
        
        if [ $? -eq 0 ]; then
            echo "✅ Merge successful!"
            echo "🚀 Consider testing before pushing to main"
            echo "📤 Push with: git push origin ironclaw-dev"
        else
            echo "❌ Merge conflicts detected!"
            echo "🛠️  Resolve conflicts, then run: git commit"
        fi
        ;;
    3)
        echo -e "\n🧪 Creating integration branch for testing..."
        BRANCH_NAME="integrate/upstream-$(date +%Y%m%d)"
        git checkout -b "$BRANCH_NAME"
        git merge upstream-main --no-ff -m "test: Integration branch for upstream sync"
        echo "✅ Created branch: $BRANCH_NAME"
        echo "🧪 Test changes, then merge to ironclaw-dev if good"
        ;;
    4)
        echo -e "\n🧪 EXPERIMENTAL FEATURES (Advanced Users Only)"
        echo "⚠️  Warning: These features are unstable and may break!"
        echo -e "\n📋 Available experimental features:"
        git ls-remote --heads upstream | grep -E "feat/" | head -10 | sed 's/.*refs\/heads\//  • /'
        echo -e "\nTo manually integrate a specific feature:"
        echo "1. git fetch upstream <feature-branch>:<local-name>"
        echo "2. git checkout -b experimental/<feature-name>"  
        echo "3. git merge <local-name>"
        echo "4. Test thoroughly before using!"
        echo -e "\n👀 See FORK_STRATEGY_ANALYSIS.md for more details"
        ;;
    5)
        echo "👍 No changes made. Upstream fetch completed for reference."
        ;;
    *)
        echo "❌ Invalid option. No changes made."
        ;;
esac

echo -e "\n📊 Current branch status:"
git status --short

# Clean up the upstream-main reference (it's temporary)
git branch -D upstream-main 2>/dev/null || true

echo -e "\n✨ Update process complete!"