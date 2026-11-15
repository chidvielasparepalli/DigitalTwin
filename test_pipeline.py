"""
Runnable self-checks for the digital twin sensing pipeline.
No camera/mic needed - uses synthetic inputs where possible.

Run:  python test_pipeline.py
"""
import numpy as np


def test_voice_pitch():
    from src.voice.voice_analysis import VoiceAnalysisModule

    va = VoiceAnalysisModule()
    sr = va.SAMPLE_RATE
    t = np.arange(int(sr * 2)) / sr
    for f in [100, 200, 300]:
        tone = (0.5 * np.sin(2 * np.pi * f * t)).astype(np.float32)
        chars = va.analyze_voice(tone)
        assert abs(chars["f0_median"] - f) < 5.0, \
            f"f0 {chars['f0_median']:.1f} != {f}Hz"
    print("test_voice_pitch OK")


def test_face_metrics():
    """EAR/MAR helpers on synthetic landmark geometry."""
    from src.vision.face_analysis import FaceAnalysisModule

    fa = FaceAnalysisModule
    # Open eye: wide, low height ratio.
    # 159 and 153 share x (top/bottom lid pair), 158 and 145 share x.
    open_eye = np.array([
        [0.0, 0.0, 0.0],   # 33 outer
        [0.4, -0.1, 0.0],  # 159 top
        [0.6, -0.1, 0.0],  # 158 top
        [1.0, 0.0, 0.0],   # 133 inner
        [0.4, 0.1, 0.0],   # 153 bottom
        [0.6, 0.1, 0.0],   # 145 bottom
    ])
    # Closed eye: flat, near-zero height
    closed_eye = open_eye.copy()
    closed_eye[1][1] = 0.0
    closed_eye[2][1] = 0.0
    closed_eye[4][1] = 0.0
    closed_eye[5][1] = 0.0
    closed_eye[1][0] = 0.4
    closed_eye[4][0] = 0.4
    closed_eye[2][0] = 0.6
    closed_eye[5][0] = 0.6

    ear_open = fa._eye_aspect_ratio(open_eye)
    ear_closed = fa._eye_aspect_ratio(closed_eye)
    assert ear_open > ear_closed, f"EAR open {ear_open} !> closed {ear_closed}"
    assert 0.0 <= ear_closed < 0.1, f"closed eye EAR {ear_closed} too high"

    # Mouth open vs closed
    closed_mouth = np.array([[0, 0, 0], [0.5, 0.05, 0], [0.5, -0.05, 0], [1, 0, 0]])
    open_mouth = np.array([[0, 0, 0], [0.5, 0.4, 0], [0.5, -0.4, 0], [1, 0, 0]])
    mar_closed = fa._mouth_aspect_ratio(closed_mouth)
    mar_open = fa._mouth_aspect_ratio(open_mouth)
    assert mar_open > mar_closed * 2, \
        f"MAR open {mar_open} not > 2x closed {mar_closed}"
    print("test_face_metrics OK")


def test_body_pose_heuristic():
    from src.vision.body_tracking import BodyTrackingModule
    from src.vision.body_tracking import (NOSE, LEFT_HIP, RIGHT_HIP,
                                          LEFT_KNEE, LEFT_ANKLE)

    bt = BodyTrackingModule
    kp = np.zeros((33, 4), dtype=np.float32)
    kp[:, 3] = 1.0
    kp[NOSE] = [0.5, 0.1, 0, 1]
    kp[LEFT_HIP] = [0.5, 0.5, 0, 1]
    kp[RIGHT_HIP] = [0.55, 0.5, 0, 1]
    kp[LEFT_KNEE] = [0.5, 0.8, 0, 1]
    kp[LEFT_ANKLE] = [0.5, 0.9, 0, 1]
    pose = bt._estimate_pose(kp)
    assert pose["posture"] == "standing", f"got {pose['posture']}"
    print("test_body_pose_heuristic OK")


def test_emotion_heuristic():
    from src.orb.bridge import emotion_from_blendshapes

    assert emotion_from_blendshapes({}) == "neutral"
    assert emotion_from_blendshapes(
        {"mouthSmileLeft": 0.9, "mouthSmileRight": 0.9}) == "happy"
    print("test_emotion_heuristic OK")


def test_behavioral_model():
    from src.orb.bridge import BehavioralModel

    m = BehavioralModel()
    for _ in range(10):
        m.observe(
            {"blink": 0.3, "mouth_open": 0.2,
             "head_pose": {"yaw": 0.1, "pitch": 0.0},
             "blendshapes": {"mouthSmileLeft": 0.5}},
            None,
            {"energy": 0.01, "speaking": True},
        )
    p = m.profile()
    assert p["samples"] == 10
    assert abs(p["avg_blink"] - 0.3) < 0.001
    assert abs(p["avg_smile"] - 0.5) < 0.001
    print("test_behavioral_model OK")


def test_voice_clone_text_strip():
    from src.voice.voice_clone import _strip_non_supported

    out = _strip_non_supported("Hello, world! [test] — 123.")
    assert out == "Hello, world! 123."
    print("test_voice_clone_text_strip OK")


if __name__ == "__main__":
    test_voice_pitch()
    test_face_metrics()
    test_body_pose_heuristic()
    test_emotion_heuristic()
    test_behavioral_model()
    print("\nALL PIPELINE TESTS PASSED")
