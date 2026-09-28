"""
predict_samples.py — Show model predictions on test images

Picks random samples from the test set, runs prediction, 
and saves a visual grid showing each image with its prediction.
"""

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import tensorflow as tf
import numpy as np
from pathlib import Path
import random
import shutil

MODEL_PATH = "./trained_model/store_classifier.keras"
TEST_DIR = "./dataset_split/test"
OUTPUT_DIR = "./prediction_samples"
NUM_SAMPLES = 16  # 4x4 grid
IMG_SIZE = (224, 224)

LABELS = {0: "NON POTENSIAL", 1: "POTENSIAL"}


def load_and_preprocess(img_path):
    """Load image and preprocess for model input."""
    img = tf.keras.utils.load_img(img_path, target_size=IMG_SIZE)
    img_array = tf.keras.utils.img_to_array(img)
    img_array = img_array / 255.0
    return img_array


def main():
    random.seed(42)
    
    print("=" * 60)
    print("Model Prediction Samples")
    print("=" * 60)
    
    # Load model
    print("\nLoading model...")
    model = tf.keras.models.load_model(MODEL_PATH)
    print("Model loaded!")
    
    # Collect test images
    test_path = Path(TEST_DIR)
    potensial_imgs = list((test_path / "potensial").glob("*.jpg"))
    non_potensial_imgs = list((test_path / "non_potensial").glob("*.jpg"))
    
    print(f"Test images: {len(potensial_imgs)} potensial, {len(non_potensial_imgs)} non-potensial")
    
    # Pick random samples (mix of both)
    n_each = NUM_SAMPLES // 2
    samples = []
    
    selected_pot = random.sample(potensial_imgs, min(n_each, len(potensial_imgs)))
    selected_non = random.sample(non_potensial_imgs, min(n_each, len(non_potensial_imgs)))
    
    for img_path in selected_pot:
        samples.append({"path": img_path, "true_label": "POTENSIAL"})
    for img_path in selected_non:
        samples.append({"path": img_path, "true_label": "NON POTENSIAL"})
    
    random.shuffle(samples)
    
    # Create output directory
    out_path = Path(OUTPUT_DIR)
    if out_path.exists():
        shutil.rmtree(out_path)
    out_path.mkdir(parents=True, exist_ok=True)
    
    # Run predictions
    print(f"\nRunning predictions on {len(samples)} images...\n")
    print(f"{'#':<4} {'True Label':<16} {'Prediction':<16} {'Confidence':>10}  {'Result':>8}  File")
    print("-" * 90)
    
    correct = 0
    results = []
    
    for i, sample in enumerate(samples):
        img_array = load_and_preprocess(str(sample["path"]))
        
        # Predict
        pred = model.predict(np.expand_dims(img_array, 0), verbose=0)[0][0]
        pred_label = LABELS[1] if pred > 0.5 else LABELS[0]
        confidence = pred if pred > 0.5 else 1 - pred
        
        is_correct = pred_label == sample["true_label"]
        if is_correct:
            correct += 1
        
        status = "OK" if is_correct else "WRONG"
        
        print(f"{i+1:<4} {sample['true_label']:<16} {pred_label:<16} {confidence:>9.1%}  {status:>8}  {sample['path'].name}")
        
        # Copy image to output with renamed file showing prediction
        tag = "CORRECT" if is_correct else "WRONG"
        dest_name = f"{i+1:02d}_{tag}_true-{sample['true_label']}_pred-{pred_label}_{confidence:.0%}.jpg"
        shutil.copy2(sample["path"], out_path / dest_name)
        
        results.append({
            "index": i + 1,
            "true_label": sample["true_label"],
            "predicted": pred_label,
            "confidence": float(confidence),
            "correct": is_correct,
            "file": sample["path"].name,
            "saved_as": dest_name,
        })
    
    accuracy = correct / len(samples) * 100
    
    print("-" * 90)
    print(f"\nAccuracy on samples: {correct}/{len(samples)} = {accuracy:.1f}%")
    print(f"Results saved to: {out_path.absolute()}")
    print("\nOpen the folder to see each image with its prediction in the filename!")


if __name__ == "__main__":
    main()
