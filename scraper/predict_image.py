"""
predict_image.py — Predict a single image (from file or URL)

Usage:
    python predict_image.py <path_or_url>
    
Examples:
    python predict_image.py ./test_toko.jpg
    python predict_image.py "https://lh5.googleusercontent.com/p/AF1Qip..."
"""

import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import sys
import tensorflow as tf
import numpy as np
from pathlib import Path
import urllib.request
import ssl

MODEL_PATH = "./trained_model/store_classifier.keras"
IMG_SIZE = (224, 224)
LABELS = {0: "NON POTENSIAL", 1: "POTENSIAL"}


def download_image(url, save_path="temp_predict.jpg"):
    """Download image from URL."""
    print(f"Downloading from URL...")
    
    # Skip SSL verification for Google CDN
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    
    with urllib.request.urlopen(req, context=ctx) as response:
        with open(save_path, "wb") as f:
            f.write(response.read())
    
    size_kb = os.path.getsize(save_path) / 1024
    print(f"Downloaded: {save_path} ({size_kb:.1f} KB)")
    return save_path


def predict(image_path):
    """Run prediction on an image."""
    # Load model
    print("Loading model...")
    model = tf.keras.models.load_model(MODEL_PATH)
    
    # Load and preprocess image
    img = tf.keras.utils.load_img(image_path, target_size=IMG_SIZE)
    img_array = tf.keras.utils.img_to_array(img) / 255.0
    
    # Predict
    pred = model.predict(np.expand_dims(img_array, 0), verbose=0)[0][0]
    
    label = LABELS[1] if pred > 0.5 else LABELS[0]
    confidence = pred if pred > 0.5 else 1 - pred
    
    print("\n" + "=" * 50)
    print(f"  File:       {image_path}")
    print(f"  Prediksi:   {label}")
    print(f"  Confidence: {confidence:.1%}")
    print(f"  Raw score:  {pred:.4f}")
    print("=" * 50)
    
    if label == "POTENSIAL":
        print("\n  >> TOKO INI POTENSIAL untuk dijadikan agen BNI!")
    else:
        print("\n  >> TOKO INI TIDAK POTENSIAL.")
    
    return label, confidence


def extract_image_url_from_maps(maps_url):
    """Extract the googleusercontent image URL from a Google Maps page URL."""
    import re
    import urllib.parse
    
    # Decode the URL first
    decoded = urllib.parse.unquote(maps_url)
    
    # Find googleusercontent.com image URL
    match = re.search(r'(https://lh[0-9]*\.googleusercontent\.com/[^\s!#]+)', decoded)
    if match:
        img_url = match.group(1)
        # Replace small size with high res
        img_url = re.sub(r'=w\d+-h\d+.*', '=w800-h600', img_url)
        if '=' not in img_url.split('/')[-1]:
            img_url += '=w800-h600'
        print(f"Extracted image URL from Google Maps link")
        return img_url
    
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python predict_image.py <path_or_url>")
        print()
        print("Contoh:")
        print('  python predict_image.py ./foto_toko.jpg')
        print('  python predict_image.py "https://lh5.googleusercontent.com/p/..."')
        print('  python predict_image.py "https://www.google.com/maps/place/..."')
        sys.exit(1)
    
    input_path = sys.argv[1]
    
    # Check if it's a Google Maps page URL (extract image URL)
    if "google.com/maps" in input_path:
        extracted = extract_image_url_from_maps(input_path)
        if extracted:
            image_path = download_image(extracted)
        else:
            print("Tidak bisa extract URL gambar dari link Google Maps ini.")
            print("Coba klik kanan gambar -> 'Copy image address' lalu paste URL-nya.")
            sys.exit(1)
    elif input_path.startswith("http"):
        image_path = download_image(input_path)
    else:
        image_path = input_path
        if not os.path.exists(image_path):
            print(f"File not found: {image_path}")
            sys.exit(1)
    
    predict(image_path)


if __name__ == "__main__":
    main()
