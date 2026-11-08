#!/bin/sh
# Holt Schriften und QR-Bibliothek (einmalig) nach quelle/.deps
cd "$(dirname "$0")" && mkdir -p .deps && cd .deps
for p in @fontsource/special-elite@5.3.0 @fontsource/courier-prime@5.3.0 qrcode-generator@2.0.4; do npm pack "$p" >/dev/null 2>&1; done
for f in *.tgz; do d="${f%.tgz}"; mkdir -p "$d" && tar -xzf "$f" -C "$d"; done
