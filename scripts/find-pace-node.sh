#!/usr/bin/env bash
# Look for PacifiCorp price nodes on CAISO OASIS. Run on your Mac.
set -u
cd "$(dirname "$0")/.."
mkdir -p data/raw
d=$(python3 -c "import datetime;print((datetime.date.today()-datetime.timedelta(days=3)).strftime('%Y%m%d'))")
for mkt in DAM RTM; do
  [ $mkt = RTM ] && continue
  echo "== $mkt all aggregate pricing nodes"
  curl -L -s -m 150 -o data/raw/lmp_all.zip -w "HTTP %{http_code}\n" "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&startdatetime=${d}T07:00-0000&enddatetime=${d}T08:00-0000&version=1&market_run_id=${mkt}&grp_type=ALL_APNODES&resultformat=6"
  file data/raw/lmp_all.zip
  unzip -p data/raw/lmp_all.zip 2>/dev/null | head -2
  unzip -p data/raw/lmp_all.zip 2>/dev/null | python3 -c "
import sys,csv
r=csv.DictReader(sys.stdin); s=set()
for row in r:
    n=row.get('NODE','')
    if any(k in n.upper() for k in ('PACE','PACW','PACI','PAC-')): s.add(n)
print('PacifiCorp style nodes:', sorted(s)[:40] or 'none found')"
done
