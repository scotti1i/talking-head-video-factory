#!/bin/bash
# ============================================================
# 打包「口播工厂.app」:
#   双击 → 拉起本地控制台服务(若未运行)→ Chrome 应用窗口打开
# 产物:~/Applications/口播工厂.app + ~/Downloads/口播工厂.app.zip
# ============================================================
set -euo pipefail

FACTORY="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="口播工厂"
BUILD_DIR="$FACTORY/out/app-build"
APP="$BUILD_DIR/$APP_NAME.app"
NODE_BIN="$(command -v node || echo /opt/homebrew/bin/node)"

rm -rf "$BUILD_DIR"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# ---- 图标 ----
ICON_PNG="$BUILD_DIR/icon-1024.png"
python3 "$FACTORY/scripts/make-app-icon.py" "$ICON_PNG"
ICONSET="$BUILD_DIR/app.iconset"
mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512; do
  sips -z $s $s "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z $d $d "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/app.icns"

# ---- Info.plist ----
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>com.scott.talkinghead.console</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>app</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
</dict>
</plist>
PLIST

# ---- 启动器(Finder 启动时 PATH 极简,node 路径写死+兜底) ----
cat > "$APP/Contents/MacOS/launcher" <<LAUNCH
#!/bin/bash
PORT=4870
FACTORY="$FACTORY"
URL="http://127.0.0.1:\$PORT"
NODE="$NODE_BIN"
[ -x "\$NODE" ] || NODE="/opt/homebrew/bin/node"
[ -x "\$NODE" ] || NODE="/usr/local/bin/node"

if ! nc -z 127.0.0.1 \$PORT >/dev/null 2>&1; then
  mkdir -p "\$FACTORY/console/logs"
  nohup "\$NODE" "\$FACTORY/console/server.mjs" >> "\$FACTORY/console/logs/app.log" 2>&1 &
  for i in \$(seq 1 40); do
    nc -z 127.0.0.1 \$PORT >/dev/null 2>&1 && break
    sleep 0.25
  done
fi

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="\$URL" --window-size=1440,940
else
  open "\$URL"
fi
LAUNCH
chmod +x "$APP/Contents/MacOS/launcher"

# ---- 安装 + 打包下载件 ----
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/$APP_NAME.app"
cp -R "$APP" "$HOME/Applications/"
ditto -c -k --keepParent "$APP" "$HOME/Downloads/$APP_NAME.app.zip"

echo "✓ 已安装: $HOME/Applications/$APP_NAME.app"
echo "✓ 下载件: $HOME/Downloads/$APP_NAME.app.zip"
echo "双击即用;首次如被 Gatekeeper 拦截,右键 → 打开。"
