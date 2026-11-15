# Digital Twin Project Architecture

## Goal
Develop a real-time, high-fidelity digital clone system that captures facial characteristics, body posture, voice patterns, and expressions from a person via webcam and projects them onto a synchronized digital human or orb visualization. Optimized for local GPU acceleration (NVIDIA RTX 4060).

## Core Modules and Technologies

### 1. Video Capture & Preprocessing
*   **Purpose:** Capture high-resolution video feed from the camera and prepare it for real-time analysis.
*   **Technology:** `OpenCV` (Python/C++ bindings). Leveraging `CUDA` for GPU-accelerated video decoding and basic image processing (resizing, color conversion).
*   **Output:** Synchronized video frames, potentially cropped or pre-processed for specific downstream modules.

### 2. Facial Analysis
*   **Purpose:** Detect facial landmarks, recognize expressions, and analyze facial characteristics in real-time.
*   **Technologies:**
    *   **Facial Landmarks & Mesh:** `MediaPipe Face Mesh` (GPU-accelerated via `CUDA` where available, highly optimized for real-time). Provides 3D facial landmarks crucial for expression mapping.
    *   **Expression Recognition:** Custom model (e.g., `ResNet` or `EfficientNet` based) trained on expressive datasets, integrated with `PyTorch` or `TensorFlow` and optimized for `TensorRT` for inference on RTX 4060. Alternatively, explore pre-trained `OpenVINO` models for Intel integration.
    *   **Identity Recognition:** (Optional, for later stage) `FaceNet` or similar embeddings, with `Faiss` for fast similarity search if needed.
*   **Output:** 3D facial landmark coordinates, blendshape coefficients for expressions, identity embeddings (if applicable).

### 3. Body & Posture Tracking
*   **Purpose:** Track full-body pose, detect gestures, and analyze movement patterns in real-time.
*   **Technologies:**
    *   **2D/3D Pose Estimation:** `MediaPipe Holistic` (integrates pose, face, hand tracking, GPU-accelerated). For higher accuracy or specific needs, `OpenPose` or `AlphaPose` with `CUDA` acceleration.
    *   **Gesture Recognition:** Rule-based system for simple gestures; for complex gestures, `LSTM` or `Transformer` networks fed with pose keypoints, optimized with `TensorRT`.
*   **Output:** 2D/3D skeletal keypoints, detected gestures, movement vectors.

### 4. Voice Analysis & Synthesis
*   **Purpose:** Analyze vocal characteristics, speech patterns, and perform real-time voice cloning/synthesis.
*   **Technologies:**
    *   **Speech-to-Text (STT) & Speaker Diarization:** `NVIDIA Riva` (highly optimized for GPU, low-latency STT, speaker recognition). `OpenAI Whisper` (for robust STT, can run locally on GPU).
    *   **Voice Characteristics Analysis:** Custom `Deep Learning` models (e.g., `Transformer` based) to extract pitch, tone, rhythm, and speaking style.
    *   **Text-to-Speech (TTS) & Voice Cloning:** `NVIDIA Riva` (provides high-quality, customizable TTS and potential for voice cloning from short audio samples). `Coqui TTS` or `VITS` (open-source alternatives, can be GPU-accelerated).
*   **Output:** Transcribed text, speech characteristics (pitch, tempo, emotional tone), cloned voice model.

### 5. Digital Human / Orb Visualization
*   **Purpose:** Render the synchronized digital human or dynamic orb visualization in real-time.
*   **Technologies:**
    *   **3D Engine:** `Unreal Engine 5` (for photorealistic digital humans via `MetaHuman` Creator, highly optimized for NVIDIA GPUs). `Unity` (alternative, good for real-time interactive applications).
    *   **Orb Visualization:** Custom shader development within `Unreal Engine` or `Unity` to create dynamic, responsive light/particle effects driven by behavioral data.
    *   **Web-based (Alternative/Companion):** `Three.js` / `WebGL` (for lightweight, browser-based orb or simplified avatar display, not the primary high-fidelity clone).
*   **Input:** Facial blendshape coefficients, skeletal animation data, voice emotional tone, detected gestures, speech patterns.
*   **Output:** Real-time rendered digital human/orb.

### 6. Integration & Performance Optimization
*   **Purpose:** Connect all modules, ensure efficient data flow, and optimize for real-time performance on RTX 4060.
*   **Technologies:**
    *   **Inter-Process Communication (IPC):** `ZeroMQ`, `gRPC`, or `Shared Memory` for high-throughput, low-latency data exchange between modules (e.g., Python ML models and C++/Unreal Engine rendering).
    *   **GPU Optimization:** `NVIDIA TensorRT` for optimizing deep learning inference models. `CUDA` Toolkit for low-level GPU programming.
    *   **Programming Languages:** Python (for rapid ML prototyping and orchestration), C++ (for performance-critical components like video processing, custom GPU kernels, and Unreal Engine integrations).
    *   **Orchestration:** Custom Python scripts to manage module lifecycle, data pipelines, and synchronization.

## Orb Initialization & Observation Flow

1.  **System Start:** Orb remains dormant.
2.  **User Presence Detected:** Via video feed, initial face/body detection triggers orb initialization.
3.  **Orb "Wakes Up":** Orb lights illuminate, dynamic particle effects indicate activation.
4.  **Initial Scan:** System passively observes user's face, body, and listens to ambient speech (if any).
5.  **Progressive Cloning:**
    *   **Facial Style:** Capture micro-expressions, facial muscle movements, key landmarks. Build blendshape mapping.
    *   **Body Posture:** Track skeletal movements, idle poses, typical gestures.
    *   **Voice/Talking Style:** Record voice samples, analyze pitch, timbre, rhythm. Build voice model.
    *   **Behavioral:** Synthesize observed patterns from all inputs (e.g., how often they smile, typical head movements during speech).
6.  **Synchronized Output:** The digital human/orb reflects the captured characteristics in real-time.

## Development Considerations

*   **Modularity:** Each component should be as independent as possible for ease of development, testing, and scaling.
*   **Latency:** Minimize end-to-end latency for a truly real-time experience.
*   **Scalability:** While local-first, design for potential future cloud integration for more demanding models or wider access.
*   **Ethical AI:** Implement safeguards and transparent communication regarding data usage and the nature of the digital twin.
---

## Implemented Status (as-built)

**Working end-to-end (RTX 4060):**
- Camera capture: OpenCV 5.0, live frame read
- Face analysis: MediaPipe Face Landmarker — 478 landmarks, 52 blendshapes, head pose (yaw/pitch/roll), blink + mouth-open ratios
- Body tracking: MediaPipe Pose Landmarker — 33 keypoints, posture (standing/sitting/upper-body), gestures, velocity
- Voice analysis: faster-whisper (CUDA) STT, librosa pyin pitch, energy, speaking rate, spectral centroid
- Voice cloning: Coqui XTTS-v2 (CUDA) — reference-speaker cloning
- Behavioral model: blink rate, smile bias, head motion, dominant emotion → style profile
- Orb: three.js in apps/web (`/orb`) — wake/idle/observing/cloning phases, hue by emotion, tilt by head pose, pulse by speech; WebSocket bridge `ws://localhost:8765`
- Orchestrator: `python -m src.main bridge|profile|run`
- Self-check: `python test_pipeline.py` (all pass)

**Dependencies installed:** torch+cu128, torchaudio, mediapipe, faster-whisper, coqui-tts (with languages/codec extras, transformers pinned 4.53.3), librosa, sounddevice, websockets, three.js
