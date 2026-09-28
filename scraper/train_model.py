"""
train_model.py — Train store classification model using Transfer Learning

Usage:
    python train_model.py

This script:
1. Loads the split dataset (train/validation/test)
2. Uses MobileNetV2 as base model (transfer learning)
3. Trains a binary classifier (potensial vs non_potensial)
4. Saves the model for conversion to TensorFlow.js
"""

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TF warnings

import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras import layers, Model
import json
from pathlib import Path

# ============================================================
# CONFIGURATION
# ============================================================

DATASET_DIR = "./dataset_split"
MODEL_OUTPUT_DIR = "./trained_model"
TFJS_OUTPUT_DIR = "./tfjs_model"

IMG_SIZE = (224, 224)
BATCH_SIZE = 32
INITIAL_EPOCHS = 15       # Phase 1: train only new layers
FINE_TUNE_EPOCHS = 10     # Phase 2: fine-tune top layers
FINE_TUNE_AT_LAYER = -30  # Unfreeze last 30 layers of MobileNetV2

# ============================================================
# DATA LOADING
# ============================================================

def create_data_generators():
    """Create train/validation/test data generators with augmentation."""
    
    # Training data: apply augmentation for better generalization
    train_datagen = ImageDataGenerator(
        rescale=1.0 / 255,
        rotation_range=20,
        width_shift_range=0.2,
        height_shift_range=0.2,
        horizontal_flip=True,
        zoom_range=0.2,
        brightness_range=[0.8, 1.2],
        shear_range=0.1,
        fill_mode="nearest",
    )
    
    # Validation/test: only rescale (no augmentation)
    eval_datagen = ImageDataGenerator(rescale=1.0 / 255)
    
    print("📁 Loading datasets...")
    
    train_generator = train_datagen.flow_from_directory(
        os.path.join(DATASET_DIR, "train"),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="binary",
        shuffle=True,
    )
    
    val_generator = eval_datagen.flow_from_directory(
        os.path.join(DATASET_DIR, "validation"),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="binary",
        shuffle=False,
    )
    
    test_generator = eval_datagen.flow_from_directory(
        os.path.join(DATASET_DIR, "test"),
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode="binary",
        shuffle=False,
    )
    
    print(f"   Train:      {train_generator.samples} images")
    print(f"   Validation: {val_generator.samples} images")
    print(f"   Test:       {test_generator.samples} images")
    print(f"   Classes:    {train_generator.class_indices}")
    
    return train_generator, val_generator, test_generator

# ============================================================
# MODEL BUILDING
# ============================================================

def build_model():
    """Build transfer learning model based on MobileNetV2."""
    
    print("\n🧠 Building model...")
    
    # Load pre-trained MobileNetV2 (without top classification layers)
    base_model = MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_shape=(224, 224, 3),
    )
    
    # Freeze all base model layers (Phase 1)
    base_model.trainable = False
    
    # Build our classification head
    inputs = tf.keras.Input(shape=(224, 224, 3))
    x = base_model(inputs, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.3)(x)
    x = layers.Dense(128, activation="relu")(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.2)(x)
    outputs = layers.Dense(1, activation="sigmoid")(x)
    
    model = Model(inputs, outputs)
    
    print(f"   Base model: MobileNetV2 ({len(base_model.layers)} layers, frozen)")
    print(f"   Total params: {model.count_params():,}")
    
    return model, base_model

# ============================================================
# TRAINING
# ============================================================

def train_model():
    """Main training pipeline."""
    
    print("=" * 60)
    print("🏦 BNI Canvas Pro — Store Classification Model Training")
    print("=" * 60)
    
    # Load data
    train_gen, val_gen, test_gen = create_data_generators()
    
    # Build model
    model, base_model = build_model()
    
    # ── Phase 1: Train only the classification head ──────────
    print("\n" + "=" * 60)
    print("📈 PHASE 1: Training classification head")
    print("=" * 60)
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    
    # Callbacks
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            patience=5,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-6,
        ),
    ]
    
    history1 = model.fit(
        train_gen,
        epochs=INITIAL_EPOCHS,
        validation_data=val_gen,
        callbacks=callbacks,
        verbose=1,
    )
    
    phase1_val_acc = max(history1.history["val_accuracy"])
    print(f"\n✅ Phase 1 complete — Best val accuracy: {phase1_val_acc:.4f}")
    
    # ── Phase 2: Fine-tune top layers of base model ──────────
    print("\n" + "=" * 60)
    print("📈 PHASE 2: Fine-tuning base model (top layers)")
    print("=" * 60)
    
    # Unfreeze the last N layers of the base model
    base_model.trainable = True
    for layer in base_model.layers[:FINE_TUNE_AT_LAYER]:
        layer.trainable = False
    
    trainable_count = sum(1 for l in base_model.layers if l.trainable)
    print(f"   Unfroze {trainable_count} layers for fine-tuning")
    
    # Use a lower learning rate for fine-tuning
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.0001),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    
    history2 = model.fit(
        train_gen,
        epochs=FINE_TUNE_EPOCHS,
        validation_data=val_gen,
        callbacks=callbacks,
        verbose=1,
    )
    
    phase2_val_acc = max(history2.history["val_accuracy"])
    print(f"\n✅ Phase 2 complete — Best val accuracy: {phase2_val_acc:.4f}")
    
    # ── Evaluation on test set ───────────────────────────────
    print("\n" + "=" * 60)
    print("📊 EVALUATION ON TEST SET")
    print("=" * 60)
    
    test_loss, test_accuracy = model.evaluate(test_gen, verbose=1)
    print(f"\n   Test Loss:     {test_loss:.4f}")
    print(f"   Test Accuracy: {test_accuracy:.4f}")
    
    # ── Save model ───────────────────────────────────────────
    print("\n" + "=" * 60)
    print("💾 SAVING MODEL")
    print("=" * 60)
    
    # Save as .keras format (native Keras 3.x format)
    model_path = Path(MODEL_OUTPUT_DIR)
    model_path.mkdir(parents=True, exist_ok=True)
    model.save(str(model_path / "store_classifier.keras"))
    print(f"   Keras file → {model_path / 'store_classifier.keras'}")
    
    # Export as TF SavedModel format (for TFLite/TFServing/TFJS conversion)
    model.export(str(model_path / "store_classifier_saved_model"))
    print(f"   SavedModel → {model_path / 'store_classifier_saved_model'}")
    
    # Save class mapping
    class_mapping = {
        "class_indices": train_gen.class_indices,
        "labels": {str(v): k for k, v in train_gen.class_indices.items()},
        "metrics": {
            "phase1_val_accuracy": float(phase1_val_acc),
            "phase2_val_accuracy": float(phase2_val_acc),
            "test_accuracy": float(test_accuracy),
            "test_loss": float(test_loss),
            "total_train_images": train_gen.samples,
            "total_val_images": val_gen.samples,
            "total_test_images": test_gen.samples,
        },
    }
    
    with open(str(model_path / "model_info.json"), "w") as f:
        json.dump(class_mapping, f, indent=2)
    print(f"   Model info → {model_path / 'model_info.json'}")
    
    # ── Final Summary ────────────────────────────────────────
    print("\n" + "=" * 60)
    print("🎉 TRAINING COMPLETE!")
    print("=" * 60)
    print(f"   Phase 1 val accuracy: {phase1_val_acc:.4f}")
    print(f"   Phase 2 val accuracy: {phase2_val_acc:.4f}")
    print(f"   Test accuracy:        {test_accuracy:.4f}")
    print(f"   Model saved to:       {model_path}")
    print()
    print("   Next step: Convert to TensorFlow.js")
    print("   Run: tensorflowjs_converter \\")
    print(f"     --input_format=tf_saved_model \\")
    print(f"     {model_path / 'store_classifier'} \\")
    print(f"     {TFJS_OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    train_model()
