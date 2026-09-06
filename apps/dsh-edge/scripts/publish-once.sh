#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
tarball="open-compute-dsh-edge-0.12.0.tgz"
if [[ ! -f "$tarball" ]]; then
  echo "Missing $tarball — run: npm pack --ignore-scripts" >&2
  exit 1
fi
if [[ -z "${NPM_OTP:-}" && -z "${1:-}" ]]; then
  echo "Usage: NPM_OTP=123456 $0" >&2
  echo "   or: $0 123456" >&2
  echo "Get the 6-digit code from your authenticator app for npmjs.com." >&2
  exit 2
fi
otp="${1:-$NPM_OTP}"
npm publish "$tarball" --access public --otp="$otp"
npm view @open-compute/dsh-edge@version version
