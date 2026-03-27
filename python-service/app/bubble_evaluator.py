import cv2
import numpy as np
from typing import Dict, List, Tuple

def evaluate_bubble(binary_image: np.ndarray, bbox: Tuple[int, int, int, int]) -> float:
    """
    Evaluates a single bubble's fill percentage.
    """
    x, y, w, h = bbox
    # Define a smaller central region of the bubble to avoid edge noise
    cx = int(x + w * 0.1)
    cy = int(y + h * 0.1)
    cw = int(w * 0.8)
    ch = int(h * 0.8)

    # Extract the ROI from the binary image
    roi = binary_image[cy:cy+ch, cx:cx+cw]

    # Count non-zero pixels (white pixels representing marks)
    filled_pixels = cv2.countNonZero(roi)
    total_pixels = cw * ch

    # Calculate fill percentage
    fill_percentage = filled_pixels / total_pixels if total_pixels > 0 else 0.0

    return float(fill_percentage)

def interpret_results(question_id: int, options: List[str], fill_percentages: Dict[str, float]) -> Tuple[str, str, float, str]:
    """
    Interprets fill percentages to determine the answer, status, confidence, and reason.
    Returns: (detected_answer, status, confidence, reason)
    """
    # Thresholds
    ANSWERED_THRESHOLD = 0.50 # > 50% filled is a solid answer
    BLANK_THRESHOLD = 0.15    # < 15% filled is an empty bubble
    AMBIGUOUS_MARGIN = 0.20   # If the top two answers are within 20% of each other, it's ambiguous

    # Sort options by fill percentage descending
    sorted_options = sorted(fill_percentages.items(), key=lambda item: item[1], reverse=True)

    top_option, top_fill = sorted_options[0]
    second_option, second_fill = sorted_options[1] if len(sorted_options) > 1 else (None, 0.0)

    # Logic 1: Blank
    if top_fill < BLANK_THRESHOLD:
        return (None, "blank", 1.0 - top_fill, f"Max density across all options is {top_fill:.0%} (threshold is {BLANK_THRESHOLD:.0%})")

    # Logic 2: Ambiguous (Multiple answers or erasures)
    if top_fill > ANSWERED_THRESHOLD and second_fill > ANSWERED_THRESHOLD:
        return ([top_option, second_option], "ambiguous", 1.0 - (top_fill - second_fill), f"Options {top_option} ({top_fill:.0%}) and {second_option} ({second_fill:.0%}) both exceed threshold. Erasure mark likely.")

    if (top_fill - second_fill) < AMBIGUOUS_MARGIN and top_fill > BLANK_THRESHOLD:
         return ([top_option, second_option], "ambiguous", (top_fill - second_fill) / AMBIGUOUS_MARGIN, f"Options {top_option} ({top_fill:.0%}) and {second_option} ({second_fill:.0%}) are too close in density.")

    # Logic 3: Answered
    if top_fill >= ANSWERED_THRESHOLD and second_fill <= BLANK_THRESHOLD:
        confidence = top_fill - second_fill
        return (top_option, "answered", min(1.0, confidence), f"Single mark detected ({top_option} density: {top_fill:.0%}, next highest {second_option}: {second_fill:.0%})")

    # Fallback
    return (top_option, "ambiguous", top_fill, f"Uncertain mark. {top_option} density: {top_fill:.0%}, {second_option} density: {second_fill:.0%}")
