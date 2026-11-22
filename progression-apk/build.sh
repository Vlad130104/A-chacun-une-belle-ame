#!/usr/bin/env bash
# Build Progression.apk sans Gradle (aapt + javac + dx + zipalign + apksigner)
set -euo pipefail
cd "$(dirname "$0")"
BT=/usr/lib/android-sdk/build-tools/29.0.3
JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
rm -rf build && mkdir -p build/classes
aapt package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" -F build/base.apk
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -d build/classes src/com/progression/app/*.java 2>&1 | grep -v 'warning' || true
$BT/dx --dex --output=build/classes.dex build/classes
(cd build && aapt add base.apk classes.dex >/dev/null)
[ -f progression.keystore ] || keytool -genkeypair -keystore progression.keystore -storepass progression -keypass progression \
  -alias progression -keyalg RSA -keysize 2048 -validity 36500 -dname "CN=Progression" 2>/dev/null
zipalign -f -p 4 build/base.apk build/aligned.apk
apksigner sign --ks progression.keystore --ks-pass pass:progression --key-pass pass:progression --out Progression.apk build/aligned.apk
apksigner verify -v Progression.apk | head -6
ls -l Progression.apk
