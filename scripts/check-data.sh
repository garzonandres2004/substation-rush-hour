#!/usr/bin/env bash
# Data check. Run on your Mac: ./scripts/check-data.sh
set -u
cd "$(dirname "$0")/.." && [ -f .env.local ] && set -a && . ./.env.local && set +a
mkdir -p data/raw
day() { python3 -c "import datetime;print((datetime.date.today()-datetime.timedelta(days=$1)).strftime('%Y%m%d'))"; }

echo "== 1. Open-Meteo"
curl -g -s -m 20 -w "\nHTTP %{http_code}\n" "https://api.open-meteo.com/v1/forecast?latitude=40.7&longitude=-111.9&hourly=temperature_2m,shortwave_radiation&forecast_days=1" | tail -c 120

echo; echo "== 2. EIA hourly demand, PACE (Utah)"
if [ -z "${EIA_API_KEY:-}" ]; then echo "EIA_API_KEY missing in .env.local"; else
curl -g -s -m 40 -w "\nHTTP %{http_code}\n" "https://api.eia.gov/v2/electricity/rto/region-data/data/?api_key=${EIA_API_KEY}&frequency=hourly&data[0]=value&facets[respondent][]=PACE&facets[type][]=D&sort[0][column]=period&sort[0][direction]=desc&length=3" | head -c 800; echo

echo; echo "== 3. EIA generation by fuel, PACE"
curl -g -s -m 40 -w "\nHTTP %{http_code}\n" "https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/?api_key=${EIA_API_KEY}&frequency=hourly&data[0]=value&facets[respondent][]=PACE&sort[0][column]=period&sort[0][direction]=desc&length=4" | head -c 800; echo; fi

echo; echo "== 4. CAISO: all nodes for one hour, search for PacifiCorp"
curl -s -m 120 -o data/raw/lmp_all.zip -w "HTTP %{http_code}\n" "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&startdatetime=$(day 3)T07:00-0000&enddatetime=$(day 3)T08:00-0000&version=1&market_run_id=DAM&grp_type=ALL&resultformat=6"
unzip -l data/raw/lmp_all.zip 2>&1 | head -6
unzip -p data/raw/lmp_all.zip 2>/dev/null | head -1
echo "-- node names containing PACE or PACW or PACI:"
unzip -p data/raw/lmp_all.zip 2>/dev/null | python3 -c "
import sys,csv
r=csv.DictReader(sys.stdin); s=set()
for row in r:
    n=row.get('NODE','')
    if any(k in n.upper() for k in ('PACE','PACW','PACI','UTAH')): s.add(n)
print(sorted(s)[:40] or 'none found')"
