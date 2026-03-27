import cv2
import numpy as np
from typing import List, Tuple

def map_bubbles(binary_image: np.ndarray, num_questions: int, options: List[str]) -> List[Tuple[int, str, Tuple[int, int, int, int]]]:
    """
    Finds bubble contours in the binary image and maps them to questions and options.
    Returns a list of tuples containing:
    (question_number, option_letter, (x, y, w, h))
    """
    # 1. Find contours in the binary image
    contours, _ = cv2.findContours(binary_image.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    question_bubbles = []

    # 2. Filter contours based on size and shape (aspect ratio close to 1 for circles)
    for c in contours:
        (x, y, w, h) = cv2.boundingRect(c)
        aspect_ratio = w / float(h)
        area = cv2.contourArea(c)

        # We assume bubbles are roughly circular and have a specific area range
        if w >= 20 and h >= 20 and aspect_ratio >= 0.8 and aspect_ratio <= 1.2 and area >= 300:
            question_bubbles.append((x, y, w, h))

    # 3. Sort contours to map to grid structure
    # Sort bubbles top-to-bottom
    question_bubbles = sorted(question_bubbles, key=lambda b: b[1])

    mapped_bubbles = []

    # Sort rows horizontally and assign questions/options
    row_bubbles = []
    current_y = -1
    threshold_y = 15 # pixels difference to group in the same row

    for b in question_bubbles:
        x, y, w, h = b

        if current_y == -1 or abs(y - current_y) <= threshold_y:
            row_bubbles.append(b)
            if current_y == -1:
                current_y = y
            else:
                current_y = min(y, current_y)
        else:
            # New row found. Sort the previous row horizontally.
            row_bubbles = sorted(row_bubbles, key=lambda cb: cb[0])
            mapped_bubbles.extend(row_bubbles)
            row_bubbles = [b]
            current_y = y

    if row_bubbles:
        row_bubbles = sorted(row_bubbles, key=lambda cb: cb[0])
        mapped_bubbles.extend(row_bubbles)


    results = []

    # Simplified grid mapping logic for a 1-column layout
    # Assuming options are ordered A, B, C, D, E for each question
    question_idx = 1
    option_idx = 0

    # Example logic - refine based on actual exam sheet template
    for i, bbox in enumerate(mapped_bubbles):
        if option_idx >= len(options):
            option_idx = 0
            question_idx += 1

        if question_idx > num_questions:
            break

        results.append((question_idx, options[option_idx], bbox))
        option_idx += 1

    return results
