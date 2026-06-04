#!/usr/bin/env bash
#
# ESC Twenty Apply Script
#
# Applies all ESC customizations to a Twenty checkout. This works on:
#   - A fresh Twenty clone (initial overlay)
#   - A Twenty that was just updated from upstream (re-apply after upgrade)
#
# Pattern mirrors eMobility-Innovations/docuseal-full (esc/ overlay system).
# Unlike DocuSeal (Ruby/Rails), Twenty is a TypeScript Nx monorepo, so this
# script does NOT run bundle/rails. It only overlays files; the actual build is
# a Docker image build (see the "Next steps" printed at the end).
#
# What it does:
#   1. Copies every ESC-modified file from esc/overlay/ over the upstream original
#      (backing the original up to .esc-originals/ first).
#   2. Copies every ESC-new file from esc/new/ into the tree (if that dir exists).
#   3. Runs the verification script (scripts/verify-esc-features.sh).
#
# Usage:
#   ./esc/esc-apply.sh [--no-verify] [--dry-run]
#
# Options:
#   --no-verify   Skip verification after applying
#   --dry-run     Show what would change without writing anything

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OVERLAY_DIR="${SCRIPT_DIR}/overlay"
NEW_DIR="${SCRIPT_DIR}/new"

DRY_RUN=false
DO_VERIFY=true

for arg in "$@"; do
    case "$arg" in
        --dry-run)   DRY_RUN=true ;;
        --no-verify) DO_VERIFY=false ;;
        --help|-h)
            echo "Usage: $0 [--no-verify] [--dry-run]"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            exit 1
            ;;
    esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}==> $1${NC}"; }
log_file()    { echo -e "  ${DIM}${1}${NC}"; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        ESC Twenty Apply / Migrate        ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

if [ "${DRY_RUN}" = true ]; then
    log_warn "DRY RUN MODE - No changes will be made"
    echo ""
fi

APPLIED=0
SKIPPED=0
ERRORS=0
CONFLICT_FILES=()

# ─── Step 1: Apply overlay (modified upstream files) ────────────────────────
log_step "Step 1/3: Applying overlay (modified upstream files)"

if [ ! -d "${OVERLAY_DIR}" ]; then
    log_error "Overlay directory not found: ${OVERLAY_DIR}"
    exit 1
fi

cd "${APP_DIR}"

while IFS= read -r -d '' src_file; do
    rel_path="${src_file#${OVERLAY_DIR}/}"
    dest_file="${APP_DIR}/${rel_path}"
    dest_dir="$(dirname "${dest_file}")"

    if [ -f "${dest_file}" ]; then
        if cmp -s "${src_file}" "${dest_file}"; then
            SKIPPED=$((SKIPPED + 1))
            continue
        fi

        if [ "${DRY_RUN}" = true ]; then
            echo -e "  ${YELLOW}OVERWRITE${NC} ${rel_path}"
        else
            mkdir -p "${APP_DIR}/.esc-originals/$(dirname "${rel_path}")"
            cp "${dest_file}" "${APP_DIR}/.esc-originals/${rel_path}" 2>/dev/null || true
            cp "${src_file}" "${dest_file}"
            log_file "APPLIED  ${rel_path}"
        fi
    else
        # Destination doesn't exist - upstream may have renamed/removed it.
        if [ "${DRY_RUN}" = true ]; then
            echo -e "  ${RED}MISSING${NC}  ${rel_path} (upstream may have moved/removed this file)"
            CONFLICT_FILES+=("${rel_path}")
        else
            mkdir -p "${dest_dir}"
            cp "${src_file}" "${dest_file}"
            log_file "CREATED  ${rel_path} (was missing)"
        fi
    fi
    APPLIED=$((APPLIED + 1))
done < <(find "${OVERLAY_DIR}" -type f -print0 | sort -z)

log_success "${APPLIED} overlay files applied, ${SKIPPED} already up-to-date"

# ─── Step 2: Apply new files (ESC additions) ────────────────────────────────
log_step "Step 2/3: Copying ESC-new files"

NEW_APPLIED=0
NEW_SKIPPED=0

if [ -d "${NEW_DIR}" ]; then
    while IFS= read -r -d '' src_file; do
        rel_path="${src_file#${NEW_DIR}/}"
        dest_file="${APP_DIR}/${rel_path}"
        dest_dir="$(dirname "${dest_file}")"

        if [ -f "${dest_file}" ] && cmp -s "${src_file}" "${dest_file}"; then
            NEW_SKIPPED=$((NEW_SKIPPED + 1))
            continue
        fi

        if [ "${DRY_RUN}" = true ]; then
            if [ -f "${dest_file}" ]; then
                echo -e "  ${YELLOW}UPDATE${NC}  ${rel_path}"
            else
                echo -e "  ${GREEN}NEW${NC}     ${rel_path}"
            fi
        else
            mkdir -p "${dest_dir}"
            cp "${src_file}" "${dest_file}"
            log_file "ADDED    ${rel_path}"
        fi
        NEW_APPLIED=$((NEW_APPLIED + 1))
    done < <(find "${NEW_DIR}" -type f -print0 | sort -z)

    log_success "${NEW_APPLIED} new files applied, ${NEW_SKIPPED} already present"
else
    log_info "No ESC-new files directory (esc/new/) — nothing to add"
fi

# ─── Step 3: Verification ───────────────────────────────────────────────────
log_step "Step 3/3: Verifying ESC features"

if [ "${DO_VERIFY}" = true ] && [ "${DRY_RUN}" = false ]; then
    VERIFY_SCRIPT="${APP_DIR}/scripts/verify-esc-features.sh"
    if [ -f "${VERIFY_SCRIPT}" ]; then
        echo ""
        bash "${VERIFY_SCRIPT}" || {
            log_warn "Some verifications failed. Review output above."
            ERRORS=$((ERRORS + 1))
        }
    else
        log_warn "Verification script not found: ${VERIFY_SCRIPT}"
    fi
elif [ "${DO_VERIFY}" = true ]; then
    echo -e "  ${DIM}Would run: scripts/verify-esc-features.sh${NC}"
else
    log_info "Skipping verification (--no-verify)"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${BOLD}  Apply Summary${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo ""
echo "  Overlay files applied:  ${APPLIED}"
echo "  New files added:        ${NEW_APPLIED}"
echo "  Already up-to-date:     $((SKIPPED + NEW_SKIPPED))"

if [ ${#CONFLICT_FILES[@]} -gt 0 ]; then
    echo ""
    log_warn "These overlay files target paths that no longer exist upstream:"
    for f in "${CONFLICT_FILES[@]}"; do
        echo "    ${f}"
    done
    echo ""
    echo "  Upstream likely renamed/moved them. Read scripts/PATCH_MANIFEST.md to"
    echo "  understand each patch, find the new upstream location, and update esc/overlay/."
fi

echo ""
if [ "${ERRORS}" -gt 0 ]; then
    log_error "${ERRORS} error(s) occurred. Review messages above."
    exit 1
elif [ "${DRY_RUN}" = true ]; then
    log_success "Dry run complete. No changes made."
    echo "  Run without --dry-run to apply changes."
else
    log_success "All ESC customizations applied successfully!"
    echo ""
    echo "  Next steps (Twenty is a TS monorepo — build is a Docker image, NOT bundle/rails):"
    echo "    Option A (source build, faithful):"
    echo "      docker build -t ghcr.io/emobility-innovations/twenty:<ver>-esc ."
    echo "    Option B (thin overlay on official image, fast — see PATCH_MANIFEST.md):"
    echo "      patch the compiled isValid() in dist/ on top of twentycrm/twenty:<ver>"
    echo "    Then point CT 175 /root/twenty-esc/docker-compose.yml at the custom image,"
    echo "    keep the official image tag for rollback, and 'docker compose up -d'."
fi
