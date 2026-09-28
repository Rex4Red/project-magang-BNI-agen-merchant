"""Compare model thresholds on validation, then report test performance."""

import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import numpy as np
import tensorflow as tf
from train_model_v2 import HERE, generator


def metrics(truth, probabilities, threshold):
    prediction = probabilities >= threshold
    tp = int(np.sum((truth == 1) & prediction))
    fp = int(np.sum((truth == 0) & prediction))
    fn = int(np.sum((truth == 1) & ~prediction))
    tn = int(np.sum((truth == 0) & ~prediction))
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f05 = 1.25 * precision * recall / (0.25 * precision + recall) if precision + recall else 0
    return {"threshold": threshold, "accuracy": round((tp + tn) / len(truth), 3),
            "precision": round(precision, 3), "recall": round(recall, 3),
            "f0.5": round(f05, 3), "false_positive": fp, "false_negative": fn}


def main():
    for model_name in ("trained_model", "trained_model_v3"):
        model = tf.keras.models.load_model(HERE / model_name / "store_classifier.keras")
        scores = {}
        for split in ("validation", "test"):
            data = generator(split, preprocessing=lambda image: image / 255.0)
            scores[split] = (data.classes, model.predict(data, verbose=0).reshape(-1))
        print(model_name, flush=True)
        for threshold in (0.4, 0.5, 0.6, 0.7, 0.8):
            print("  val", metrics(*scores["validation"], threshold), flush=True)
            print("  test", metrics(*scores["test"], threshold), flush=True)


if __name__ == "__main__":
    main()
