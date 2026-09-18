"""
Inspects all clinical trial datasets and prints summary statistics.
"""

import glob
import os
import sys
import pandas as pd


def inspect(data_dir: str):
    print(f"=== Inspecting Data in {data_dir} ===")
    csv_pattern = os.path.join(data_dir, "data", "*.csv")
    csv_files = sorted(glob.glob(csv_pattern))
    if not csv_files:
        csv_pattern = os.path.join(data_dir, "*.csv")
        csv_files = sorted(glob.glob(csv_pattern))

    for p in csv_files:
        fname = os.path.basename(p)
        df = pd.read_csv(p, dtype=str)
        print(f"\n[{fname}] Rows: {len(df)}, Cols: {len(df.columns)}")
        print(f"Columns: {', '.join(df.columns)}")
        null_counts = {col: int(cnt) for col, cnt in df.isna().sum().items() if cnt > 0}
        if null_counts:
            print(f"Nulls: {null_counts}")
        else:
            print("Nulls: None")


if __name__ == "__main__":
    data_path = sys.argv[1] if len(sys.argv) > 1 else "hackathon-data"
    inspect(data_path)
