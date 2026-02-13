#!/usr/bin/env bash
##############################################################################
# CrazyStream — Website Deployment Script
#
# Builds the Next.js static site and uploads to GCS.
#
# Usage:
#   ./infra/deploy-website.sh [--project PROJECT_ID] [--bucket BUCKET_NAME]
#
# Prerequisites:
#   - Node.js 20+
#   - gcloud CLI authenticated
#   - GCS bucket created (via Terraform or manually)
##############################################################################

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-gridbusiness-220920}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
BUCKET_NAME="${BUCKET_NAME:-crazystream-website-${ENVIRONMENT}}"
WEBSITE_DIR="$(cd "$(dirname "$0")/../apps/website" && pwd)"
BUILD_DIR="${WEBSITE_DIR}/out"

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)  PROJECT_ID="$2"; shift 2 ;;
    --bucket)   BUCKET_NAME="$2"; shift 2 ;;
    --env)      ENVIRONMENT="$2"; shift 2 ;;
    *)          echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "============================================================"
echo "  CrazyStream Website Deploy"
echo "  Project:  ${PROJECT_ID}"
echo "  Bucket:   ${BUCKET_NAME}"
echo "  Site dir: ${WEBSITE_DIR}"
echo "============================================================"

# ---------------------------------------------------------------------------
# Step 1: Check prerequisites
# ---------------------------------------------------------------------------
echo ""
echo "[1/5] Checking prerequisites..."

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install Node.js 20+."
  exit 1
fi

if ! command -v gcloud &>/dev/null && ! command -v gcloud.cmd &>/dev/null; then
  echo "ERROR: gcloud CLI not found."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found v${NODE_VERSION})"
  exit 1
fi

echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# ---------------------------------------------------------------------------
# Step 2: Install dependencies
# ---------------------------------------------------------------------------
echo ""
echo "[2/5] Installing dependencies..."

cd "$WEBSITE_DIR"
npm install

# ---------------------------------------------------------------------------
# Step 3: Build static site
# ---------------------------------------------------------------------------
echo ""
echo "[3/5] Building static site..."

npm run build

if [ ! -d "$BUILD_DIR" ]; then
  echo "ERROR: Build output not found at ${BUILD_DIR}"
  echo "       Make sure next.config has output: 'export'"
  exit 1
fi

FILE_COUNT=$(find "$BUILD_DIR" -type f | wc -l)
echo "  Built ${FILE_COUNT} files"

# ---------------------------------------------------------------------------
# Step 4: Create GCS bucket if it doesn't exist
# ---------------------------------------------------------------------------
echo ""
echo "[4/5] Ensuring GCS bucket exists..."

GCLOUD_CMD="gcloud"
if command -v gcloud.cmd &>/dev/null && ! command -v gcloud &>/dev/null; then
  GCLOUD_CMD="gcloud.cmd"
fi

if ! $GCLOUD_CMD storage buckets describe "gs://${BUCKET_NAME}" --project="$PROJECT_ID" &>/dev/null; then
  echo "  Creating bucket gs://${BUCKET_NAME}..."
  $GCLOUD_CMD storage buckets create "gs://${BUCKET_NAME}" \
    --project="$PROJECT_ID" \
    --location=us-west1 \
    --uniform-bucket-level-access \
    --public-access-prevention=inherited

  # Make publicly readable
  $GCLOUD_CMD storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
    --member=allUsers \
    --role=roles/storage.objectViewer
else
  echo "  Bucket gs://${BUCKET_NAME} already exists"
fi

# ---------------------------------------------------------------------------
# Step 5: Upload to GCS
# ---------------------------------------------------------------------------
echo ""
echo "[5/5] Uploading to gs://${BUCKET_NAME}..."

# Sync with proper content types and cache headers
$GCLOUD_CMD storage rsync "$BUILD_DIR" "gs://${BUCKET_NAME}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --project="$PROJECT_ID"

# Set cache headers for static assets
$GCLOUD_CMD storage objects update "gs://${BUCKET_NAME}/**/*.js" \
  --cache-control="public, max-age=31536000, immutable" \
  --project="$PROJECT_ID" 2>/dev/null || true

$GCLOUD_CMD storage objects update "gs://${BUCKET_NAME}/**/*.css" \
  --cache-control="public, max-age=31536000, immutable" \
  --project="$PROJECT_ID" 2>/dev/null || true

$GCLOUD_CMD storage objects update "gs://${BUCKET_NAME}/**/*.html" \
  --cache-control="public, max-age=300" \
  --project="$PROJECT_ID" 2>/dev/null || true

# Set website configuration
$GCLOUD_CMD storage buckets update "gs://${BUCKET_NAME}" \
  --web-main-page-suffix=index.html \
  --web-error-page=404.html \
  --project="$PROJECT_ID" 2>/dev/null || true

echo ""
echo "============================================================"
echo "  Deployment complete!"
echo ""
echo "  Website URL:"
echo "    https://storage.googleapis.com/${BUCKET_NAME}/index.html"
echo ""
echo "  Direct bucket URL (shorter):"
echo "    https://${BUCKET_NAME}.storage.googleapis.com"
echo "============================================================"
