#!/usr/bin/env bash
# Explore the MIT Supercloud GPU traces (CC BY-NC-ND 4.0). We never commit the traces themselves:
# this only logs the layout and column names, and lab-pull/gpu-stats.py keeps summary statistics.
set -u
OUT=lab-data
mkdir -p "$OUT" /tmp/gpu
LOG="$OUT/gpu-log.txt"
B=s3://mit-supercloud-dataset/datacenter-challenge/202201
{
  echo "== top level"; aws s3 ls --no-sign-request "$B/" 2>&1 | head -40
  aws s3 cp --no-sign-request "$B/README.md" /tmp/gpu/README.md >/dev/null 2>&1 && { echo "== README"; cat /tmp/gpu/README.md; }
  aws s3 cp --no-sign-request "$B/LICENSE" /tmp/gpu/LICENSE >/dev/null 2>&1 && { echo "== LICENSE"; cat /tmp/gpu/LICENSE; }
  echo "== gpu/"; aws s3 ls --no-sign-request "$B/gpu/" 2>&1 | head -20
  first=$(aws s3 ls --no-sign-request "$B/gpu/" 2>/dev/null | awk '/PRE/{print $2; exit}')
  echo "== gpu/$first"; aws s3 ls --no-sign-request "$B/gpu/$first" 2>&1 | head -20
  f=$(aws s3 ls --no-sign-request "$B/gpu/$first" 2>/dev/null | awk '{print $4}' | grep -m1 .)
  if [ -n "$f" ]; then
    aws s3 cp --no-sign-request "$B/gpu/$first$f" /tmp/gpu/sample >/dev/null 2>&1
    echo "== sample file $first$f"; file /tmp/gpu/sample; (zcat -f /tmp/gpu/sample | head -5) 2>&1 | cut -c1-600
  fi
} > "$LOG" 2>&1
echo "gpu exploration logged to $LOG"
