"""Train a candidate MobileNetV2 on curated, store-grouped data.

This keeps trained_model/ untouched. Review the metrics before activating v2.
"""

import json
import os
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.preprocessing.image import ImageDataGenerator

HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset_curated_v2"
OUTPUT = HERE / "trained_model_v2"
IMG_SIZE = (224, 224)
BATCH_SIZE = 16


def generator(split, training=False, preprocessing=preprocess_input):
    options = {"preprocessing_function": preprocessing}
    if training:
        options.update(rotation_range=15, width_shift_range=0.1, height_shift_range=0.1,
                       zoom_range=0.15, horizontal_flip=True, fill_mode="nearest")
    return ImageDataGenerator(**options).flow_from_directory(
        DATASET / split, target_size=IMG_SIZE, batch_size=BATCH_SIZE,
        class_mode="binary", shuffle=training,
    )


def score_model(model, test_data):
    test_data.reset()
    probabilities = model.predict(test_data, verbose=0).reshape(-1)
    predictions = (probabilities >= 0.5).astype(int)
    truth = test_data.classes
    tn = int(np.sum((truth == 0) & (predictions == 0)))
    fp = int(np.sum((truth == 0) & (predictions == 1)))
    fn = int(np.sum((truth == 1) & (predictions == 0)))
    tp = int(np.sum((truth == 1) & (predictions == 1)))
    return {
        "accuracy": float(np.mean(predictions == truth)),
        "balanced_accuracy": float(((tn / (tn + fp)) + (tp / (tp + fn))) / 2),
        "true_negative": tn, "false_positive": fp,
        "false_negative": fn, "true_positive": tp,
    }


def main():
    if OUTPUT.exists():
        raise FileExistsError(f"Candidate output already exists: {OUTPUT}")
    tf.keras.utils.set_random_seed(42)
    train_data = generator("train", training=True)
    validation_data = generator("validation")
    test_data = generator("test")

    old_model = tf.keras.models.load_model(HERE / "trained_model/store_classifier.keras")
    old_test_data = generator("test", preprocessing=lambda image: image / 255.0)
    baseline = score_model(old_model, old_test_data)
    print("Old model on curated store-grouped test:", baseline, flush=True)
    del old_model

    base = MobileNetV2(weights="imagenet", include_top=False, input_shape=(*IMG_SIZE, 3))
    base.trainable = False
    inputs = tf.keras.Input(shape=(*IMG_SIZE, 3))
    features = base(inputs, training=False)
    features = tf.keras.layers.GlobalAveragePooling2D()(features)
    features = tf.keras.layers.Dropout(0.3)(features)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid")(features)
    model = tf.keras.Model(inputs, outputs)

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005),
                  loss="binary_crossentropy", metrics=["accuracy"])
    first = model.fit(train_data, validation_data=validation_data, epochs=5,
                      callbacks=[tf.keras.callbacks.EarlyStopping(
                          monitor="val_loss", patience=2, restore_best_weights=True)], verbose=2)

    base.trainable = True
    for layer in base.layers[:-25]:
        layer.trainable = False
    for layer in base.layers[-25:]:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.00002),
                  loss="binary_crossentropy", metrics=["accuracy"])
    second = model.fit(train_data, validation_data=validation_data, epochs=3,
                       callbacks=[tf.keras.callbacks.EarlyStopping(
                           monitor="val_loss", patience=2, restore_best_weights=True)], verbose=2)

    candidate = score_model(model, test_data)
    print("Candidate on curated store-grouped test:", candidate, flush=True)
    OUTPUT.mkdir(parents=True)
    model.save(OUTPUT / "store_classifier.keras")
    info = {
        "preprocessing": "mobilenet_v2",
        "class_indices": train_data.class_indices,
        "dataset": "dataset_curated_v2",
        "split_unit": "store",
        "baseline_on_same_test": baseline,
        "candidate_on_same_test": candidate,
        "epochs_phase1": len(first.history["loss"]),
        "epochs_phase2": len(second.history["loss"]),
        "train_images": train_data.samples,
        "validation_images": validation_data.samples,
        "test_images": test_data.samples,
    }
    (OUTPUT / "model_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    print("Saved candidate:", OUTPUT, flush=True)


if __name__ == "__main__":
    main()
