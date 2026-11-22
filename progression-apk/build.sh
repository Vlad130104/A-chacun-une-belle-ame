#!/usr/bin/env bash
# Construit, sans Gradle, l'AAB pour le Play Store (build/Progression.aab) et un APK de test (build/Progression-test.apk).
#   APP_ID        identifiant de l'appli (définitif après le 1er envoi !)   défaut: com.progression.app
#   VERSION_CODE  entier, à incrémenter à chaque envoi                      défaut: 1
#   VERSION_NAME  texte affiché aux utilisateurs                            défaut: 1.0
#   KEYSTORE / KS_PASS  clé d'ENVOI (upload key)                            défaut: upload.keystore / lu dans upload.keystore.pass
set -euo pipefail
cd "$(dirname "$0")"
APP_ID=${APP_ID:-com.progression.app}; VERSION_CODE=${VERSION_CODE:-1}; VERSION_NAME=${VERSION_NAME:-1.0}
KEYSTORE=${KEYSTORE:-upload.keystore}; KS_PASS=${KS_PASS:-$(cat upload.keystore.pass)}
TARGET_SDK=36; MIN_SDK=21
BT=/usr/lib/android-sdk/build-tools/29.0.3
JAR23=/usr/lib/android-sdk/platforms/android-23/android.jar      # compilation (API minimale, sans API récente par erreur)
FW=${FW:-$(ls ~/.cache/android-all/android-all-*.jar 2>/dev/null | head -1)}  # ressources du framework (attributs récents) pour aapt2
[ -f "$FW" ] || { echo "Jar framework introuvable: télécharger org.robolectric:android-all:14-robolectric-10818077 dans ~/.cache/android-all/"; exit 1; }

rm -rf build && mkdir -p build/classes build/res
sed -e "s/@APP_ID@/$APP_ID/" -e "s/@VERSION_CODE@/$VERSION_CODE/" -e "s/@VERSION_NAME@/$VERSION_NAME/" AndroidManifest.xml > build/AndroidManifest.xml

# 1. Code -> classes.dex
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR23" -d build/classes src/com/progression/app/*.java 2>&1 | grep -v '^warning\|^Note\|^[0-9]* warning' || true
$BT/dx --dex --min-sdk-version=$MIN_SDK --output=build/classes.dex build/classes

# 2. Ressources
aapt2 compile --dir res -o build/res.zip
LINK="-I $FW --manifest build/AndroidManifest.xml --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE --version-name $VERSION_NAME -R build/res.zip -A assets --auto-add-overlay"

# 3a. AAB (format proto)
aapt2 link --proto-format $LINK -o build/proto.zip
python3 - "$VERSION_NAME" <<'PY'
import sys, zipfile
z=zipfile.ZipFile("build/proto.zip"); out=zipfile.ZipFile("build/Progression-unsigned.aab","w",zipfile.ZIP_DEFLATED)
for i in z.infolist():
    n=i.filename
    if n.endswith("/"): continue
    if n=="AndroidManifest.xml": dst="base/manifest/AndroidManifest.xml"
    elif n=="resources.pb": dst="base/resources.pb"
    else: dst="base/"+n            # res/..., assets/...
    out.writestr(dst, z.read(n))
out.writestr("base/dex/classes.dex", open("build/classes.dex","rb").read())
ver=b"1.17.2"; bt=b"\x12"+bytes([len(ver)])+ver          # Bundletool{version=2}
out.writestr("BundleConfig.pb", b"\x0a"+bytes([len(bt)])+bt)  # BundleConfig{bundletool=1}
out.close()
PY
cp build/Progression-unsigned.aab build/Progression.aab
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$KEYSTORE" -storepass "$KS_PASS" build/Progression.aab upload >/dev/null
jarsigner -verify build/Progression.aab | head -1

# 3b. APK de test (même contenu, format binaire)
aapt2 link $LINK -o build/test-unsigned.apk
(cd build && aapt add test-unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 build/test-unsigned.apk build/test-aligned.apk
apksigner sign --ks "$KEYSTORE" --ks-pass pass:"$KS_PASS" --key-pass pass:"$KS_PASS" --ks-key-alias upload --out build/Progression-test.apk build/test-aligned.apk
apksigner verify -v build/Progression-test.apk | sed -n 1,4p
ls -l build/Progression.aab build/Progression-test.apk
