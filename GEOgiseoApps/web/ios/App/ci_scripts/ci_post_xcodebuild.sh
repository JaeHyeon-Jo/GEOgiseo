#!/bin/sh

# Xcode Cloud's build summary can report only exit code 70 when archive
# re-signing fails. Surface the useful distribution diagnostics in the main
# build log so the failing bundle identifier or profile is immediately clear.
set +e

workspace_root="${CI_WORKSPACE_PATH:-/Volumes/workspace}"
found_logs=0

for log_directory in \
    "${workspace_root}/tmp/ad-hoc-export-archive-logs" \
    "${workspace_root}/tmp/development-export-archive-logs" \
    "${workspace_root}/tmp/app-store-export-archive-logs"
do
    [ -d "${log_directory}" ] || continue
    found_logs=1
    echo "==> Distribution diagnostics: ${log_directory##*/}"

    find "${log_directory}" -type f -name '*.log' -print | while IFS= read -r log_file
    do
        diagnostics=$(grep -Ei '(^|[^a-z])(error|failed|failure|provision|certificate|signing|profile)([^a-z]|$)' "${log_file}" | tail -n 80)
        [ -n "${diagnostics}" ] || continue
        echo "--- ${log_file##*/}"
        printf '%s\n' "${diagnostics}"
    done
done

if [ "${found_logs}" -eq 0 ]; then
    echo "==> No distribution export logs were generated."
fi

exit 0
