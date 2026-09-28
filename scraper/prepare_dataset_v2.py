"""Curate image labels by business type and split by store, not by photo.

Run without arguments for a read-only preview. Use --write to create dataset_curated_v2.
Ambiguous stores are excluded until their business type can be verified.
"""

import argparse
import hashlib
import json
import random
import re
import shutil
import unicodedata
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
TAXONOMY = json.loads((HERE.parent / "webapp/src/lib/business-taxonomy.json").read_text(encoding="utf-8"))
RULES = {
    key: [(re.compile(item["pattern"]), item["reason"]) for item in TAXONOMY[key]]
    for key in ("included", "excluded")
}


def normalize(value):
    ascii_text = unicodedata.normalize("NFKD", value.lower()).encode("ascii", "ignore").decode("ascii")
    ascii_text = re.sub(r"([0-9])([a-z])|([a-z])([0-9])", lambda m: f"{m.group(1) or m.group(3)} {m.group(2) or m.group(4)}", ascii_text)
    return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


def business_label(name, category):
    normalized_name = normalize(name)
    normalized_category = normalize(category).replace(normalized_name, " ").strip()

    def find_rule(value, kind):
        return next((reason for pattern, reason in RULES[kind] if pattern.search(value)), None)

    for value in (normalized_category, normalized_name):
        excluded = find_rule(value, "excluded")
        included = find_rule(value, "included")
        if excluded and included:
            return None, None
        if excluded:
            return "non_potensial", excluded
        if included:
            return "potensial", included
    return None, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Copy curated images into a new split")
    args = parser.parse_args()

    metadata = json.loads((HERE / "dataset/scrape_metadata.json").read_text(encoding="utf-8"))
    records = []
    skipped = Counter()
    corrections = []
    for place_key, place in metadata["scrapedPlaces"].items():
        label, reason = business_label(place.get("name", ""), place.get("category", ""))
        if label is None:
            skipped["ambiguous_store"] += 1
            continue
        if not place.get("directory"):
            skipped["no_valid_images"] += 1
            continue
        folder = HERE / place["directory"].replace("\\", "/")
        images = sorted(p for p in folder.glob("*.jpg") if p.stat().st_size >= 5000)
        if not images:
            skipped["no_valid_images"] += 1
            continue
        records.append({"key": place_key, "label": label, "reason": reason, "images": images})
        if label != place.get("label"):
            corrections.append({
                "name": place.get("name"), "category": place.get("category"),
                "old_label": place.get("label"), "new_label": label,
            })

    counts = Counter(record["label"] for record in records)
    image_counts = Counter({label: sum(len(record["images"]) for record in records if record["label"] == label)
                            for label in counts})
    print(f"Stores: {dict(counts)} | Images: {dict(image_counts)}")
    print(f"Corrected store labels: {len(corrections)} | Skipped: {dict(skipped)}")
    for correction in corrections[:12]:
        print(f"  {correction['name']}: {correction['old_label']} -> {correction['new_label']}")

    if not args.write:
        return

    output = HERE / "dataset_curated_v2"
    if output.exists():
        raise FileExistsError(f"Output already exists: {output}")

    rng = random.Random(42)
    report = {"counts": dict(counts), "image_counts": dict(image_counts),
              "corrected_labels": corrections, "skipped": dict(skipped), "splits": {}}
    for label in ("potensial", "non_potensial"):
        stores = [record for record in records if record["label"] == label]
        rng.shuffle(stores)
        train_end = int(len(stores) * 0.8)
        validation_end = train_end + int(len(stores) * 0.1)
        for split, group in (("train", stores[:train_end]),
                             ("validation", stores[train_end:validation_end]),
                             ("test", stores[validation_end:])):
            destination = output / split / label
            destination.mkdir(parents=True, exist_ok=True)
            report["splits"].setdefault(split, {})[label] = {
                "stores": len(group), "images": sum(len(record["images"]) for record in group)
            }
            for record in group:
                prefix = hashlib.sha1(record["key"].encode("utf-8")).hexdigest()[:12]
                for index, image in enumerate(record["images"], start=1):
                    shutil.copy2(image, destination / f"{prefix}_{index:02d}.jpg")

    (output / "curation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Created {output}")
    print(json.dumps(report["splits"], indent=2))


if __name__ == "__main__":
    main()
