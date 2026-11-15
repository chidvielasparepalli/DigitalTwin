import os

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "pose_landmarker/pose_landmarker_lite/float16/latest/"
    "pose_landmarker_lite.task"
)

# PoseLandmarker keypoint indices (33 total)
NOSE = 0
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_ELBOW, RIGHT_ELBOW = 13, 14
LEFT_WRIST, RIGHT_WRIST = 15, 16
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28


class BodyTrackingModule:
    """
    Real-time full-body pose tracking via MediaPipe Pose Landmarker
    (Tasks API, lite model). Tracks 33 keypoints, posture stats,
    movement velocity, and basic gesture detection.
    """

    def __init__(self, model_dir="models"):
        model = self._ensure_model(model_dir)
        base = mp_python.BaseOptions(model_asset_path=model)
        opts = mp_vision.PoseLandmarkerOptions(
            base_options=base,
            running_mode=mp_vision.RunningMode.VIDEO,
            num_poses=1,
            # Lower thresholds: laptop webcam typically shows upper body only
            min_pose_detection_confidence=0.3,
            min_pose_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
        self.landmarker = mp_vision.PoseLandmarker.create_from_options(opts)
        self._frame_ts = 0
        self._prev = None  # previous keypoints for velocity

    @staticmethod
    def _ensure_model(model_dir):
        os.makedirs(model_dir, exist_ok=True)
        path = os.path.join(model_dir, "pose_landmarker_lite.task")
        if os.path.exists(path):
            return path
        import urllib.request

        print("Downloading pose_landmarker_lite.task ...")
        urllib.request.urlretrieve(MODEL_URL, path)
        return path

    def analyze(self, frame_bgr):
        self._frame_ts += 1
        img = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB),
        )
        result = self.landmarker.detect_for_video(img, self._frame_ts)

        if not result.pose_landmarks:
            self._prev = None
            return {
                "keypoints": None,
                "posture": None, "lean": 0.0,
                "velocity": {"dx": 0.0, "dy": 0.0},
                "gesture": [], "height_px": 0.0,
            }

        kp = np.array(
            [[p.x, p.y, p.z, p.visibility]
             for p in result.pose_landmarks[0]],
            dtype=np.float32,
        )

        posture = self._estimate_pose(kp)
        self._prev = kp
        return {
            "keypoints": kp,
            "posture": posture["posture"],
            "lean": posture["lean"],
            "velocity": self._velocity(kp),
            "gesture": self._detect_gesture(kp),
            "height_px": self._person_height_px(kp),
        }

    @staticmethod
    def _estimate_pose(kp):
        """Classify standing vs sitting + torso lean.

        ponytail: naive geometry heuristic; swap for a classifier fed with
        keypoint sequences if accuracy matters. Hips/legs often out of
        frame on a laptop webcam -> falls back to 'upper_body'.
        """
        hips_visible = (kp[LEFT_HIP][3] > 0.5 and kp[RIGHT_HIP][3] > 0.5)
        nose, hip = kp[NOSE], kp[LEFT_HIP]
        lean = float(nose[0] - hip[0]) if hips_visible else 0.0

        if not hips_visible:
            return {"posture": "upper_body", "lean": lean}

        knee_y, ankle_y, hip_y = (
            kp[LEFT_KNEE][1], kp[LEFT_ANKLE][1], kp[LEFT_HIP][1],
        )
        sitting = bool(ankle_y < knee_y < hip_y)
        return {
            "posture": "sitting" if sitting else "standing",
            "lean": lean,
        }

    def _velocity(self, kp):
        if self._prev is None:
            return {"dx": 0.0, "dy": 0.0}
        d = kp[:, :2] - self._prev[:, :2]
        # Mean displacement of visible keypoints (movement magnitude)
        vis = kp[:, 3] > 0.5
        if not vis.any():
            return {"dx": 0.0, "dy": 0.0}
        mean = np.mean(d[vis], axis=0)
        return {"dx": float(mean[0]), "dy": float(mean[1])}

    @staticmethod
    def _detect_gesture(kp):
        """Simple gesture rules: raise hand, both hands up, lean in."""
        gesture = []
        # Left hand raised: wrist above shoulder and elbow above shoulder
        if (kp[LEFT_WRIST][3] > 0.5 and kp[LEFT_SHOULDER][3] > 0.5
                and kp[LEFT_WRIST][1] < kp[LEFT_SHOULDER][1] - 0.15
                and kp[LEFT_ELBOW][1] < kp[LEFT_SHOULDER][1] + 0.05):
            gesture.append("left_raised")
        if (kp[RIGHT_WRIST][3] > 0.5 and kp[RIGHT_SHOULDER][3] > 0.5
                and kp[RIGHT_WRIST][1] < kp[RIGHT_SHOULDER][1] - 0.15
                and kp[RIGHT_ELBOW][1] < kp[RIGHT_SHOULDER][1] + 0.05):
            gesture.append("right_raised")
        return gesture

    @staticmethod
    def _person_height_px(kp):
        """Approximate person height in normalized units (nose->ankle)."""
        if kp[NOSE][3] < 0.5 or kp[LEFT_ANKLE][3] < 0.5:
            return 0.0
        return float(np.linalg.norm(kp[NOSE][:2] - kp[LEFT_ANKLE][:2]))

    def release(self):
        self.landmarker.close()
