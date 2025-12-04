#!/bin/bash
# Beypro POS v17.0.0 - Windows Build & Deploy Script
# Usage: Run commands from hurryposdash-vite directory

echo "🚀 Beypro POS v17.0.0 - Windows Build & Deploy"
echo "================================================"
echo ""

# Step 1: Verify location
echo "📍 Checking location..."
if [ ! -f "package.json" ]; then
    echo "❌ Error: Not in hurryposdash-vite directory"
    echo "Please run from: /Users/nurikord/PycharmProjects/hurryposdashboard/hurryposdash-vite"
    exit 1
fi
echo "✅ Correct directory"
echo ""

# Step 2: Check git status
echo "🔍 Checking git status..."
git status
echo ""

# Step 3: Verify version
echo "📦 Current version in package.json:"
grep '"version"' package.json | head -1
echo ""

# Step 4: Create release options
echo "🎯 Release Options:"
echo "===================="
echo "1. Test Build (RC - Release Candidate)"
echo "2. Production Build (v17.0.0)"
echo "3. Patch Build (v17.0.1)"
echo ""

read -p "Choose option (1-3): " choice

case $choice in
    1)
        VERSION="v17.0.0-rc.1"
        MESSAGE="Release candidate 1 for v17.0.0"
        ;;
    2)
        VERSION="v17.0.0"
        MESSAGE="Beypro POS v17.0.0 - Electron 17 with LAN printer fixes"
        ;;
    3)
        VERSION="v17.0.1"
        MESSAGE="Bugfix release v17.0.1"
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📝 Creating tag: $VERSION"
echo "   Message: $MESSAGE"
echo ""

# Step 5: Confirmation
read -p "Continue? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelled"
    exit 1
fi

# Step 6: Create tag
echo "🏷️  Creating annotated tag..."
git tag -a "$VERSION" -m "$MESSAGE"

if [ $? -ne 0 ]; then
    echo "❌ Failed to create tag"
    exit 1
fi
echo "✅ Tag created: $VERSION"
echo ""

# Step 7: Push tag
echo "📤 Pushing tag to GitHub (this triggers build)..."
echo "   Running: git push origin $VERSION"
git push origin "$VERSION"

if [ $? -ne 0 ]; then
    echo "❌ Failed to push tag"
    exit 1
fi
echo "✅ Tag pushed successfully"
echo ""

# Step 8: Success message
echo "🎉 SUCCESS!"
echo "==========================================="
echo "✅ Tag pushed: $VERSION"
echo "✅ GitHub Actions build triggered"
echo ""
echo "📊 Next Steps:"
echo "1. Watch build progress:"
echo "   https://github.com/beyproweb/beypro-pos/actions"
echo ""
echo "2. Download installer when ready:"
echo "   https://github.com/beyproweb/beypro-pos/releases"
echo ""
echo "3. Expected build time: ~10-15 minutes"
echo ""
echo "📦 Release artifacts:"
echo "   - Beypro-POS-Setup-${VERSION}.exe (installer)"
echo "   - Beypro-POS-Setup-${VERSION}.exe.yml (metadata)"
echo "   - Beypro-POS-Setup-${VERSION}.exe.blockmap (updates)"
echo ""
echo "✨ All done!"

