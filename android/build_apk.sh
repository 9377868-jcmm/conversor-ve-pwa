#!/usr/bin/env bash
# Compila dist/conversor-ve.apk sin Android Studio ni SDK: descarga de Maven
# Central apktool (trae aapt2 y el framework de Android), dx y apksig.
# Requisitos: Java 17+, Python 3, curl, unzip. Uso: bash android/build_apk.sh
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
OBRA="$AQUI/build"
HERR="$AQUI/.tools"
M=https://repo1.maven.org/maven2
VERSION_CODE="${VERSION_CODE:-2}"
VERSION_NAME="${VERSION_NAME:-1.1}"
KEYSTORE="${KEYSTORE:-$AQUI/conversor-ve.p12}"
CLAVE="${KEYSTORE_PASS:-monedasve}"
ALIAS="${KEY_ALIAS:-monedasve}"

mkdir -p "$HERR"
bajar() { [ -f "$HERR/$2" ] || curl -sSfL -o "$HERR/$2" "$M/$1"; }
bajar org/apktool/apktool-cli/3.0.3/apktool-cli-3.0.3.jar apktool.jar
bajar com/google/android/tools/dx/1.7/dx-1.7.jar dx.jar
bajar com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar
bajar com/google/android/android/4.1.1.4/android-4.1.1.4.jar android.jar
if [ ! -x "$HERR/aapt2" ]; then
  (cd "$HERR" && unzip -o -q apktool.jar prebuilt/linux/aapt2 prebuilt/android-framework.jar \
    && mv prebuilt/linux/aapt2 aapt2 && mv prebuilt/android-framework.jar framework.jar && rm -rf prebuilt)
  chmod +x "$HERR/aapt2"
fi

rm -rf "$OBRA" && mkdir -p "$OBRA/assets/www" "$OBRA/classes"

# 1) La PWA va dentro del APK como assets (funciona sin internet).
cp "$RAIZ"/index.html "$RAIZ"/style.css "$RAIZ"/app.js "$RAIZ"/manifest.json "$OBRA/assets/www/"
cp -r "$RAIZ"/vendor "$RAIZ"/icons "$OBRA/assets/www/"

# 2) Recursos y manifiesto.
"$HERR/aapt2" compile --dir "$AQUI/res" -o "$OBRA/res.zip"
"$HERR/aapt2" link -I "$HERR/framework.jar" --manifest "$AQUI/AndroidManifest.xml" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  -A "$OBRA/assets" -o "$OBRA/base.apk" "$OBRA/res.zip"

# 3) Código Java -> classes.dex (bytecode 1.6 para que dx lo acepte).
javac -nowarn -Xlint:-options --release 8 -cp "$HERR/android.jar" -d "$OBRA/classes" \
  "$AQUI/src/ve/monedas/conversor/MainActivity.java"
python3 - "$OBRA/classes" <<'PY'
import pathlib, sys
for p in pathlib.Path(sys.argv[1]).rglob("*.class"):
    b = bytearray(p.read_bytes()); b[6:8] = (50).to_bytes(2, "big"); p.write_bytes(bytes(b))
PY
java -cp "$HERR/dx.jar" com.android.dx.command.Main --dex --output="$OBRA/classes.dex" "$OBRA/classes"
(cd "$OBRA" && zip -q base.apk classes.dex)

# 4) Alinear y firmar (v2; minSdk 24 = Android 7.0).
python3 "$AQUI/zipalign.py" "$OBRA/base.apk" "$OBRA/alineado.apk"
if [ ! -f "$KEYSTORE" ]; then
  echo "Creando llave de firma nueva en $KEYSTORE (guárdala: sin ella no se puede actualizar la app instalada)"
  keytool -genkeypair -storetype PKCS12 -keystore "$KEYSTORE" -storepass "$CLAVE" -keypass "$CLAVE" \
    -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Conversor de Monedas VE, O=Personal, C=VE" >/dev/null 2>&1
fi
javac -nowarn -cp "$HERR/apksig.jar" -d "$OBRA/classes" "$AQUI/tools-src/Firmar.java"
mkdir -p "$RAIZ/dist"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED \
  -cp "$HERR/apksig.jar:$OBRA/classes" Firmar "$KEYSTORE" "$CLAVE" "$ALIAS" \
  "$OBRA/alineado.apk" "$RAIZ/dist/conversor-ve.apk"
ls -la "$RAIZ/dist/conversor-ve.apk"
