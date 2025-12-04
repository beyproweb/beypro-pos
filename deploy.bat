@echo off
REM Beypro POS v17.0.0 - Windows Build & Deploy Script
REM Usage: Run from hurryposdash-vite directory in PowerShell or CMD

setlocal enabledelayedexpansion

echo.
echo 🚀 Beypro POS v17.0.0 - Windows Build ^& Deploy
echo ================================================
echo.

REM Step 1: Verify location
echo 📍 Checking location...
if not exist package.json (
    echo ❌ Error: Not in hurryposdash-vite directory
    echo Please run from: \Users\nurikord\PycharmProjects\hurryposdashboard\hurryposdash-vite
    exit /b 1
)
echo ✅ Correct directory
echo.

REM Step 2: Check git status
echo 🔍 Checking git status...
git status
echo.

REM Step 3: Show version
echo 📦 Current version in package.json:
for /f "tokens=*" %%a in ('findstr "version" package.json ^| findstr /v "//"') do (
    echo %%a
    goto :version_found
)
:version_found
echo.

REM Step 4: Release menu
echo 🎯 Release Options:
echo ====================
echo 1. Test Build (RC - Release Candidate)
echo 2. Production Build (v17.0.0)
echo 3. Patch Build (v17.0.1)
echo.

set /p choice="Choose option (1-3): "

if "%choice%"=="1" (
    set VERSION=v17.0.0-rc.1
    set MESSAGE=Release candidate 1 for v17.0.0
) else if "%choice%"=="2" (
    set VERSION=v17.0.0
    set MESSAGE=Beypro POS v17.0.0 - Electron 17 with LAN printer fixes
) else if "%choice%"=="3" (
    set VERSION=v17.0.1
    set MESSAGE=Bugfix release v17.0.1
) else (
    echo ❌ Invalid choice
    exit /b 1
)

echo.
echo 📝 Creating tag: !VERSION!
echo    Message: !MESSAGE!
echo.

REM Step 5: Confirmation
set /p confirm="Continue? (y/n): "
if /i not "%confirm%"=="y" (
    echo ❌ Cancelled
    exit /b 1
)

REM Step 6: Create tag
echo.
echo 🏷️  Creating annotated tag...
git tag -a !VERSION! -m "!MESSAGE!"
if errorlevel 1 (
    echo ❌ Failed to create tag
    exit /b 1
)
echo ✅ Tag created: !VERSION!
echo.

REM Step 7: Push tag
echo 📤 Pushing tag to GitHub (this triggers build^)...
echo    Running: git push origin !VERSION!
git push origin !VERSION!
if errorlevel 1 (
    echo ❌ Failed to push tag
    exit /b 1
)
echo ✅ Tag pushed successfully
echo.

REM Step 8: Success
echo 🎉 SUCCESS!
echo ===========================================
echo ✅ Tag pushed: !VERSION!
echo ✅ GitHub Actions build triggered
echo.
echo 📊 Next Steps:
echo 1. Watch build progress:
echo    https://github.com/beyproweb/beypro-pos/actions
echo.
echo 2. Download installer when ready:
echo    https://github.com/beyproweb/beypro-pos/releases
echo.
echo 3. Expected build time: ~10-15 minutes
echo.
echo 📦 Release artifacts:
echo    - Beypro-POS-Setup-!VERSION!.exe (installer^)
echo    - Beypro-POS-Setup-!VERSION!.exe.yml (metadata^)
echo    - Beypro-POS-Setup-!VERSION!.exe.blockmap (updates^)
echo.
echo ✨ All done!
echo.

pause

