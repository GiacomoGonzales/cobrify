#!/usr/bin/env bash
#
# Release iOS de Cobrify (Capacitor + Xcode) → sube a App Store Connect por CLI.
#
#   Uso:  scripts/release-ios.sh <marketingVersion> <buildNumber>
#   Ej:   scripts/release-ios.sh 4.28.4 54
#
# Hace: build web → cap sync ios → sube versión en el pbxproj → archiva →
#       exporta .ipa firmado para distribución → valida → sube a App Store Connect.
#
# Requisitos:
#   - La API key .p8 en ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
#   - Xcode + CocoaPods instalados.
#
# Nota: ISSUER_ID y KEY_ID son IDENTIFICADORES (no secretos). El secreto es la .p8,
#       que vive fuera del repo. Puedes sobreescribirlos con env vars ASC_ISSUER_ID / ASC_KEY_ID.
#
set -euo pipefail

MKT="${1:?Uso: release-ios.sh <marketingVersion> <buildNumber>  (ej: 4.28.4 54)}"
BUILD="${2:?Uso: release-ios.sh <marketingVersion> <buildNumber>  (ej: 4.28.4 54)}"

ISSUER_ID="${ASC_ISSUER_ID:-30c4081f-93c0-4315-a7fd-bdb65e06a34c}"
KEY_ID="${ASC_KEY_ID:-ASW2WC8WUH}"
TEAM_ID="WAUWHRT3D6"
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
P8="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
DATE="$(date +%Y-%m-%d)"
ARCHIVE="$HOME/Library/Developer/Xcode/Archives/${DATE}/Cobrify-${MKT}-${BUILD}.xcarchive"
EXPORT_DIR="$(mktemp -d /tmp/cobrify_export.XXXX)"
PLIST="${EXPORT_DIR}/ExportOptions.plist"

# Fix del bug de locale de CocoaPods (1.16 + Ruby 3.4) en esta Mac.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

[ -f "$P8" ] || { echo "❌ No existe la API key: $P8"; exit 1; }

echo "▶ 1/6  Build web (vite)…"
npm run build

echo "▶ 2/6  cap sync ios…"
npx cap sync ios

echo "▶ 3/6  Versión → ${MKT} (build ${BUILD})…"
/usr/bin/sed -i '' -E \
  -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = ${MKT};/g" \
  -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = ${BUILD};/g" \
  "$PBXPROJ"

echo "▶ 4/6  Archivando…"
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  archive -allowProvisioningUpdates

echo "▶ 5/6  Exportando .ipa…"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>export</string>
	<key>teamID</key>
	<string>${TEAM_ID}</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>uploadSymbols</key>
	<true/>
</dict>
</plist>
PLISTEOF

xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$PLIST" -allowProvisioningUpdates \
  -authenticationKeyPath "$P8" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER_ID"

IPA="$(ls "${EXPORT_DIR}"/*.ipa | head -1)"
[ -n "$IPA" ] || { echo "❌ No se generó .ipa"; exit 1; }

echo "▶ 6/6  Subiendo a App Store Connect…"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

echo ""
echo "✅ Subido ${MKT} (${BUILD}). En ~5-30 min aparece en App Store Connect (procesando)."
echo "   Luego: elegir el build para la versión y 'Enviar a revisión'."
