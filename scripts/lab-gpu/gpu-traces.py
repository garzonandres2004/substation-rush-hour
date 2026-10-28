"""Real AI training power at 1 second, for the second by second Station model.
Runs on GitHub Actions only. Downloads the same sample of labelled training jobs as gpu-stats.py
(MIT Supercloud Dataset, nvidia-smi power_draw_W every 100 ms, CC BY-NC-ND 4.0), sums each job's
GPUs, averages to 1 s, keeps the busy stretch and divides by the job's own peak (99th percentile).
Writes the normalized series to a TEMPORARY folder given as the first argument (float32 files plus
index.json). The traces are used by scripts/lab-seconds.ts in the same run and never committed.
Cite: Samsi et al., The MIT Supercloud Dataset, IEEE HPEC 2021."""
import json
import os
import random
import subprocess
import sys

import numpy as np
import pandas as pd

OUT = sys.argv[1]
B = "s3://mit-supercloud-dataset/datacenter-challenge/202201"
TMP = "/tmp/gpu-dl"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)


def s3(*args):
    return subprocess.run(["aws", "s3", *args, "--no-sign-request"], capture_output=True, text=True).stdout


subprocess.run(["aws", "s3", "cp", f"{B}/labelled_jobids.csv", f"{TMP}/labels.csv", "--no-sign-request"], capture_output=True)
labels = pd.read_csv(f"{TMP}/labels.csv")
idcol = next(c for c in labels.columns if "id" in c.lower())
modelcol = next(c for c in labels.columns if c != idcol)
label_of = {str(r[idcol]): str(r[modelcol]) for _, r in labels.iterrows()}

files = []
for i in range(100):
    folder = f"{i:04d}"
    for line in s3("ls", f"{B}/gpu/{folder}/").splitlines():
        parts = line.split()
        if len(parts) == 4 and parts[3].endswith(".csv"):
            files.append((folder, parts[3], int(parts[2])))
job = lambda name: name.split("-")[0]
labelled = [f for f in files if job(f[1]) in label_of]
pool = labelled if len(labelled) >= 20 else files
pool = [f for f in pool if 3e6 <= f[2] <= 80e6]
random.seed(11)  # same sample as gpu-stats.py
by_model = {}
for f in pool:
    by_model.setdefault(label_of.get(job(f[1]), "unlabelled"), []).append(f)
pick = []
while len(pick) < 48 and any(by_model.values()):
    for m in list(by_model):
        if by_model[m]:
            pick.append(by_model[m].pop(random.randrange(len(by_model[m]))))
print("picked", len(pick))

index = []
for folder, name, size in pick:
    path = f"{TMP}/job.csv"
    subprocess.run(["aws", "s3", "cp", f"{B}/gpu/{folder}/{name}", path, "--no-sign-request"], capture_output=True)
    try:
        df = pd.read_csv(path, usecols=["timestamp", "gpu_index", "power_draw_W"])
    except Exception as e:
        print("skip", name, str(e)[:80])
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
    if peak < 120 * n_gpu:
        continue
    busy = np.where(total > 0.5 * peak)[0]
    total = total[busy[0] : busy[-1] + 1]
    if len(total) < 20 * 60:
        continue
    x = (total / peak).astype(np.float32)
    k = len(index)
    x.tofile(f"{OUT}/{k}.f32")
    index.append({"file": f"{k}.f32", "model": label_of.get(job(name), "unlabelled"), "gpus": int(n_gpu), "seconds": int(len(x))})
    print("job", index[-1]["model"], n_gpu, "gpus", len(x), "s")

json.dump(index, open(f"{OUT}/index.json", "w"))
print("done", len(index), "jobs", sum(j["seconds"] for j in index), "s")
