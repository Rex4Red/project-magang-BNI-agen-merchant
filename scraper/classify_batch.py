"""Classify Google Maps store photos for the webapp. Reads and writes JSON on stdio."""

import io
import json
import os
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"


def allowed_image_url(value):
    try:
        parsed = urllib.parse.urlparse(value)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and (
            host == "googleusercontent.com"
            or host.endswith(".googleusercontent.com")
            or host == "gstatic.com"
            or host.endswith(".gstatic.com")
        )
    except (TypeError, ValueError):
        return False


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if not allowed_image_url(newurl):
            raise ValueError("Image redirect is not allowed")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def load_photo(url, preprocessing):
    if not allowed_image_url(url):
        raise ValueError("Image URL is not allowed")

    opener = urllib.request.build_opener(SafeRedirectHandler)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with opener.open(request, timeout=12) as response:
        if not (response.headers.get("Content-Type") or "").lower().startswith("image/"):
            raise ValueError("URL did not return an image")
        data = response.read(5_000_001)
        if len(data) > 5_000_000:
            raise ValueError("Image is too large")

    import numpy as np
    from PIL import Image

    with Image.open(io.BytesIO(data)) as image:
        image = image.convert("RGB").resize((224, 224))
        pixels = np.asarray(image, dtype="float32")
        if preprocessing == "mobilenet_v2":
            return pixels / 127.5 - 1.0
        return pixels / 255.0


def image_decision(probability, threshold):
    cutoff = max(0.7, threshold)
    if probability >= cutoff:
        return "potensial"
    if 1 - probability >= cutoff:
        return "non_potensial"
    return "unavailable"


def main():
    import numpy as np
    import tensorflow as tf

    items = json.load(sys.stdin)["items"]
    project_dir = Path(__file__).resolve().parent
    model_dir_name = os.environ.get("BNI_MODEL_DIR") or (
        "trained_model_v3" if (project_dir / "trained_model_v3/approved.json").exists()
        else "trained_model"
    )
    model_dir = project_dir / model_dir_name
    model_path = model_dir / "store_classifier.keras"
    model_info = json.loads((model_dir / "model_info.json").read_text(encoding="utf-8"))
    preprocessing = model_info.get("preprocessing", "legacy_0_1")
    threshold = float(model_info.get("decision_threshold", 0.5))
    model = tf.keras.models.load_model(model_path)

    results = [{
        "id": item["id"], "label": "unavailable", "confidence": None,
        "reason": "no_photo" if not item.get("photoUrl") else "image_error",
    } for item in items]
    images_by_index = {}
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(load_photo, item["photoUrl"], preprocessing): index
            for index, item in enumerate(items) if item.get("photoUrl")
        }
        for future in as_completed(futures):
            index = futures[future]
            try:
                images_by_index[index] = future.result()
            except Exception as exc:
                print(f"Photo {items[index]['id']}: {exc}", file=sys.stderr)

    if images_by_index:
        indexes = sorted(images_by_index)
        scores = model.predict(
            np.stack([images_by_index[index] for index in indexes]),
            batch_size=16, verbose=0,
        ).reshape(-1)
        for index, score in zip(indexes, scores):
            probability = float(score)
            label = image_decision(probability, threshold)
            results[index] = {
                "id": items[index]["id"],
                "label": label,
                "confidence": None if label == "unavailable" else probability if label == "potensial" else 1 - probability,
                "reason": "low_confidence" if label == "unavailable" else None,
            }

    json.dump({"results": results}, sys.stdout)


if __name__ == "__main__":
    main()
