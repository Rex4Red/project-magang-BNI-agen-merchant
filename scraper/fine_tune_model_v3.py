"""Adapt the existing classifier head to curated store-grouped data."""

import json
import os
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import tensorflow as tf
from train_model_v2 import HERE, generator, score_model

OUTPUT = HERE / "trained_model_v3"


def main():
    if OUTPUT.exists():
        raise FileExistsError(f"Candidate output already exists: {OUTPUT}")

    tf.keras.utils.set_random_seed(42)
    model = tf.keras.models.load_model(HERE / "trained_model/store_classifier.keras")
    model.layers[1].trainable = False
    model.layers[5].trainable = False

    legacy_preprocessing = lambda image: image / 255.0
    train_data = generator("train", training=True, preprocessing=legacy_preprocessing)
    validation_data = generator("validation", preprocessing=legacy_preprocessing)
    test_data = generator("test", preprocessing=legacy_preprocessing)

    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
                  loss="binary_crossentropy", metrics=["accuracy"])
    history = model.fit(train_data, validation_data=validation_data, epochs=8,
                        callbacks=[
                            tf.keras.callbacks.EarlyStopping(
                                monitor="val_loss", patience=2, restore_best_weights=True),
                            tf.keras.callbacks.ReduceLROnPlateau(
                                monitor="val_loss", patience=1, factor=0.5),
                        ], verbose=2)

    candidate = score_model(model, test_data)
    print("Fine-tuned candidate on curated store-grouped test:", candidate, flush=True)
    OUTPUT.mkdir(parents=True)
    model.save(OUTPUT / "store_classifier.keras")
    info = {
        "preprocessing": "legacy_0_1",
        "class_indices": train_data.class_indices,
        "dataset": "dataset_curated_v2",
        "split_unit": "store",
        "candidate_on_same_test": candidate,
        "epochs": len(history.history["loss"]),
        "train_images": train_data.samples,
        "validation_images": validation_data.samples,
        "test_images": test_data.samples,
    }
    (OUTPUT / "model_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
