"""Summary statistics of real AI training power, from the MIT Supercloud Dataset (CC BY-NC-ND 4.0).
Runs on GitHub Actions. Downloads a sample of labelled training jobs' GPU traces (nvidia-smi, every
100 ms), measures how fast and how far job power swings, and writes ONLY aggregate statistics to
lab-data/gpu-stats.json. The traces themselves are never saved to the repo.
Cite: Samsi et al., The MIT Supercloud Dataset, IEEE HPEC 2021."""
import io
import json
import os
import random
import subprocess
import sys

import numpy as np
import pandas as pd

B = "s3://mit-supercloud-dataset/datacenter-challenge/202201"
TMP = "/tmp/gpu"
os.makedirs(TMP, exist_ok=True)
LOG = open("lab-data/gpu-stats-log.txt", "w")


def log(*a):
    print(*a)
    print(*a, file=LOG, flush=True)


def s3(*args):
    return subprocess.run(["aws", "s3", *args, "--no-sign-request"], capture_output=True, text=True).stdout


# Labelled training jobs: job id to model name.
subprocess.run(["aws", "s3", "cp", f"{B}/labelled_jobids.csv", f"{TMP}/labels.csv", "--no-sign-request"], capture_output=True)
labels = pd.read_csv(f"{TMP}/labels.csv")
log("labels columns", list(labels.columns), "rows", len(labels))
log(labels.head(3).to_string())
idcol = next(c for c in labels.columns if "id" in c.lower())
modelcol = next(c for c in labels.columns if c != idcol)
label_of = {str(r[idcol]): str(r[modelcol]) for _, r in labels.iterrows()}

# Listing of all GPU trace files, with sizes.
files = []
for i in range(100):
    folder = f"{i:04d}"
    for line in s3("ls", f"{B}/gpu/{folder}/").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[3].endswith(".csv"):
            files.append((folder, parts[3], int(parts[2])))
log("gpu files listed", len(files))
job = lambda name: name.split("-")[0]
labelled = [f for f in files if job(f[1]) in label_of]
log("labelled gpu files", len(labelled))
pool = labelled if len(labelled) >= 20 else files
pool = [f for f in pool if 3e6 <= f[2] <= 80e6]
random.seed(11)
by_model = {}
for f in pool:
    by_model.setdefault(label_of.get(job(f[1]), "unlabelled"), []).append(f)
pick = []
while len(pick) < 48 and any(by_model.values()):
    for m in list(by_model):
        if by_model[m]:
            pick.append(by_model[m].pop(random.randrange(len(by_model[m]))))
log("picked", len(pick), "jobs from models", sorted({label_of.get(job(f[1]), "unlabelled") for f in pick}))


def q(x, p):
    return float(np.quantile(x, p)) if len(x) else None


jobs = []
minute_series = []
for folder, name, size in pick:
    path = f"{TMP}/job.csv"
    subprocess.run(["aws", "s3", "cp", f"{B}/gpu/{folder}/{name}", path, "--no-sign-request"], capture_output=True)
    try:
        df = pd.read_csv(path, usecols=["timestamp", "gpu_index", "power_draw_W"])
    except Exception as e:
        log("skip", name, str(e)[:80])
        continue
    finally:
        if os.path.exists(path):
            os.remove(path)
    df["s"] = np.floor(df["timestamp"]).astype(np.int64)
    per = df.groupby(["s", "gpu_index"])["power_draw_W"].mean().unstack().sort_index()
    per = per.reindex(range(per.index.min(), per.index.max() + 1)).ffill()
    total = per.sum(axis=1).to_numpy()
    n_gpu = per.shape[1]
    if len(total) < 20 * 60 or n_gpu < 1:
        continue
    peak = np.quantile(total, 0.99)
    if peak < 120 * n_gpu:  # not a busy training job
        continue
    busy = np.where(total > 0.5 * peak)[0]
    total = total[busy[0] : busy[-1] + 1]
    if len(total) < 20 * 60:
        continue
    x = total / peak
    d1 = np.abs(np.diff(x))
    m = x[: len(x) // 60 * 60].reshape(-1, 60)
    mmean = m.mean(axis=1)
    dm = np.abs(np.diff(mmean))
    within = m.max(axis=1) - m.min(axis=1)
    xc = x - x.mean()
    ac = np.correlate(xc[:4000], xc[:4000], mode="full")[3999:]
    ac = ac / ac[0] if ac[0] > 0 else ac
    lag = next((i for i in range(3, min(900, len(ac) - 1)) if ac[i] > ac[i - 1] and ac[i] >= ac[i + 1] and ac[i] > 0.2), None)
    jobs.append(
        {
            "model": label_of.get(job(name), "unlabelled"),
            "gpus": int(n_gpu),
            "minutes": round(len(x) / 60, 1),
            "meanOfPeak": float(x.mean()),
            "secondStepP95": q(d1, 0.95),
            "secondStepMax": float(d1.max()),
            "minuteStepP95": q(dm, 0.95),
            "minuteStepMax": float(dm.max()) if len(dm) else None,
            "withinMinuteRangeP50": q(within, 0.5),
            "withinMinuteRangeP95": q(within, 0.95),
            "shareMinutesSwing30pct": float((within >= 0.3).mean()),
            "repeatPeriodS": lag,
        }
    )
    minute_series.append(mmean * peak / n_gpu)  # W per GPU, minute means, kept in memory only
    log("job", jobs[-1]["model"], n_gpu, "gpus", jobs[-1]["minutes"], "min")

# Fleet experiment: many independent jobs added with random time offsets, versus one synchronized job
# scaled up. Measures the largest 1 minute step as a share of the fleet's peak.
fleet = {}
rng = np.random.default_rng(5)
if minute_series:
    L = 240
    usable = [s for s in minute_series if len(s) >= L]
    for k in [1, 4, 16, 48]:
        steps = []
        for _ in range(200):
            chosen = [usable[i] for i in rng.integers(0, len(usable), size=k)]
            tot = np.zeros(L)
            for s in chosen:
                o = rng.integers(0, len(s) - L + 1)
                tot += s[o : o + L]
            steps.append(np.abs(np.diff(tot)).max() / tot.max())
        fleet[str(k)] = {"medianMaxMinuteStepOfPeak": float(np.median(steps)), "p90": float(np.quantile(steps, 0.9))}

agg = lambda key, p: q(np.array([j[key] for j in jobs if j[key] is not None]), p)
out = {
    "source": "MIT Supercloud Dataset (Samsi et al., IEEE HPEC 2021), nvidia-smi power_draw_W at 100 ms, CC BY-NC-ND 4.0. Aggregate statistics only.",
    "jobs": len(jobs),
    "models": sorted({j["model"] for j in jobs}),
    "gpusMedian": agg("gpus", 0.5),
    "minutesMedian": agg("minutes", 0.5),
    "acrossJobsMedian": {k: agg(k, 0.5) for k in ["meanOfPeak", "secondStepP95", "secondStepMax", "minuteStepP95", "minuteStepMax", "withinMinuteRangeP50", "withinMinuteRangeP95", "shareMinutesSwing30pct", "repeatPeriodS"]},
    "acrossJobsP90": {k: agg(k, 0.9) for k in ["secondStepMax", "minuteStepMax", "withinMinuteRangeP95", "shareMinutesSwing30pct"]},
    "fleetIndependentJobs": fleet,
    "perJob": jobs,
}
json.dump(out, open("lab-data/gpu-stats.json", "w"), indent=1)
log("done", len(jobs), "jobs")
sys.exit(0)
