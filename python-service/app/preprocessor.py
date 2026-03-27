import cv2
import numpy as np
from typing import Tuple

def deskew(image: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Detects the main lines in the image using Hough transform
    and rotates the image to correct the skew.
    Returns the rotated image and the deskew angle.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image.copy()

    # Invert the image, blur it, and find edges
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)

    # Use HoughlinesP to get line segments
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, minLineLength=100, maxLineGap=10)

    if lines is None:
        return image, 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # We only care about lines that are roughly horizontal or vertical
        if -45 < angle < 45:
            angles.append(angle)
        elif angle > 45:
            angles.append(angle - 90)
        elif angle < -45:
            angles.append(angle + 90)

    if not angles:
        return image, 0.0

    # Get median angle to avoid outliers
    median_angle = np.median(angles)

    # Rotate the image
    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    rotated = cv2.warpAffine(image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    return rotated, float(median_angle)

def preprocess_image(image: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Applies the full preprocessing pipeline: deskew, grayscale, denoise, and thresholding.
    Returns the binary image and the deskew angle.
    """
    # 1. Deskew
    rotated, angle = deskew(image)

    # 2. Convert to grayscale if necessary
    gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY) if len(rotated.shape) == 3 else rotated.copy()

    # 3. Gaussian Blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # 4. Adaptive Thresholding
    # We want dark marks to become white pixels (255) and background black (0) for easier contour detection and area summing
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )

    return binary, angle
