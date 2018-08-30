"""
Applies OpenCV's Laplacian filter and flattens the archive (preserving only .png and .jpg images)
"""

import os
import cv2

def process(src, dst):
    for (path, dirs, files) in os.walk(src):
        for f in files:
            if f.endswith(".jpg") or f.endswith(".png"):
                ProcessImage(os.path.join(path, f), os.path.join(dst, f))

        for d in dirs:
            process(d, dst)

def ProcessImage(src, dst):
    img = cv2.imread(src, 0)
    img = cv2.Laplacian(img, cv2.CV_64F)
    cv2.imwrite(dst, img)