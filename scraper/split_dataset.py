"""
split_dataset.py — Split scraped images into train/validation/test sets

Usage:
    python split_dataset.py

This script:
1. Flattens all images from subdirectories into potensial/ and non_potensial/
2. Splits into 80% train / 10% validation / 10% test
3. Creates the folder structure needed for TensorFlow training
"""

import os
import shutil
import random
from pathlib import Path

# Configuration
DATASET_DIR = "./dataset"
OUTPUT_DIR = "./dataset_split"
TRAIN_RATIO = 0.80
VAL_RATIO = 0.10
TEST_RATIO = 0.10
RANDOM_SEED = 42
MIN_FILE_SIZE = 5000  # Skip files smaller than 5KB

def collect_images(category_dir):
    """Collect all valid jpg images from nested subdirectories."""
    images = []
    category_path = Path(category_dir)
    
    if not category_path.exists():
        print(f"  ⚠️  Directory not found: {category_dir}")
        return images
    
    for jpg_file in category_path.rglob("*.jpg"):
        if jpg_file.stat().st_size >= MIN_FILE_SIZE:
            images.append(jpg_file)
    
    return images


def split_and_copy(images, label, output_dir):
    """Split images into train/val/test and copy to output directory."""
    random.shuffle(images)
    
    n = len(images)
    n_train = int(n * TRAIN_RATIO)
    n_val = int(n * VAL_RATIO)
    
    splits = {
        "train": images[:n_train],
        "validation": images[n_train:n_train + n_val],
        "test": images[n_train + n_val:],
    }
    
    for split_name, split_images in splits.items():
        dest_dir = Path(output_dir) / split_name / label
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        for i, img_path in enumerate(split_images):
            # Create unique filename to avoid collisions
            dest_file = dest_dir / f"{label}_{i+1:04d}.jpg"
            shutil.copy2(img_path, dest_file)
        
        print(f"  {split_name:12s}: {len(split_images):4d} images → {dest_dir}")
    
    return {k: len(v) for k, v in splits.items()}


def main():
    random.seed(RANDOM_SEED)
    
    print("=" * 60)
    print("📁 BNI Canvas Pro — Dataset Splitter")
    print("=" * 60)
    
    # Clean output directory
    output_path = Path(OUTPUT_DIR)
    if output_path.exists():
        shutil.rmtree(output_path)
        print(f"🗑️  Cleaned existing output: {OUTPUT_DIR}")
    
    # Process each category
    categories = {
        "potensial": os.path.join(DATASET_DIR, "potensial"),
        "non_potensial": os.path.join(DATASET_DIR, "non_potensial"),
    }
    
    total_stats = {}
    
    for label, category_dir in categories.items():
        print(f"\n📂 Processing: {label.upper()}")
        print(f"   Source: {category_dir}")
        
        images = collect_images(category_dir)
        print(f"   Found: {len(images)} valid images")
        
        if len(images) == 0:
            print(f"   ⚠️  No images found, skipping!")
            continue
        
        stats = split_and_copy(images, label, OUTPUT_DIR)
        total_stats[label] = {"total": len(images), **stats}
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 DATASET SPLIT SUMMARY")
    print("=" * 60)
    print(f"{'Category':<20} {'Total':>6} {'Train':>6} {'Val':>6} {'Test':>6}")
    print("-" * 50)
    
    grand_total = {"total": 0, "train": 0, "validation": 0, "test": 0}
    for label, stats in total_stats.items():
        print(f"{label:<20} {stats['total']:>6} {stats['train']:>6} {stats['validation']:>6} {stats['test']:>6}")
        for k in grand_total:
            grand_total[k] += stats[k]
    
    print("-" * 50)
    print(f"{'TOTAL':<20} {grand_total['total']:>6} {grand_total['train']:>6} {grand_total['validation']:>6} {grand_total['test']:>6}")
    print("=" * 60)
    
    print(f"\n✅ Dataset split saved to: {os.path.abspath(OUTPUT_DIR)}")
    print(f"   Ready for training!")


if __name__ == "__main__":
    main()
