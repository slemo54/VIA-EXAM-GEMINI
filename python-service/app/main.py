from fastapi import FastAPI, BackgroundTasks, HTTPException
from app.models import ProcessingRequest, ProcessingResponse, BubbleResult, ProcessingMetrics
from app.preprocessor import preprocess_image
from app.grid_mapper import map_bubbles
from app.bubble_evaluator import evaluate_bubble, interpret_results
import cv2
import numpy as np
import time
import requests

app = FastAPI(title="Exam Checker CV Service")

def process_submission(request: ProcessingRequest):
    start_time = time.time()

    # 1. Download image (simplified)
    # response = requests.get(request.file_url)
    # image_array = np.asarray(bytearray(response.content), dtype=np.uint8)
    # image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    # Placeholder for local testing
    # Create a dummy image
    image = np.zeros((1000, 1000, 3), dtype=np.uint8)

    # 2. Preprocess
    binary_image, deskew_angle = preprocess_image(image)

    # 3. Map Grid
    mapped_bubbles = map_bubbles(binary_image, request.config.num_questions, request.config.options)

    # 4. Evaluate Bubbles
    # Group bounding boxes by question
    questions_map = {}
    for q_id, opt_letter, bbox in mapped_bubbles:
        if q_id not in questions_map:
            questions_map[q_id] = {}
        questions_map[q_id][opt_letter] = bbox

    results = []

    # Calculate fill percentages and interpret results
    for q_id, options_bboxes in questions_map.items():
        fill_percentages = {}
        for opt_letter, bbox in options_bboxes.items():
            fill_percentage = evaluate_bubble(binary_image, bbox)
            fill_percentages[opt_letter] = fill_percentage

        detected_ans, status, conf, reason = interpret_results(q_id, request.config.options, fill_percentages)

        results.append(BubbleResult(
            question=q_id,
            detected_answer=detected_ans,
            status=status,
            confidence=conf,
            reason=reason
        ))

    processing_time = int((time.time() - start_time) * 1000)

    metrics = ProcessingMetrics(
        deskew_angle=deskew_angle,
        processing_time_ms=processing_time
    )

    # 5. Return JSON
    # In a real app, this would send a webhook to the Node.js API Gateway
    return ProcessingResponse(
        submission_id=request.submission_id,
        status="success",
        annotated_image_urls=[request.file_url], # Placeholder
        metrics=metrics,
        results=results
    )

@app.post("/process", response_model=ProcessingResponse)
async def process_exam(request: ProcessingRequest, background_tasks: BackgroundTasks):
    # For MVP, synchronous processing. In prod, use background_tasks or a queue (Celery).
    try:
        response = process_submission(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
