import os

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

try:
    from mediapipe.tasks.python.vision import FaceLandmarkerResult
except ImportError:  # pragma: no cover
    FaceLandmarkerResult = None


MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)


def _model_path(model_dir):
    os.makedirs(model_dir, exist_ok=True)
    return os.path.join(model_dir, "face_landmarker.task")


def _ensure_model(model_dir):
    """Download FaceLandmarker model if missing."""
    path = _model_path(model_dir)
    if os.path.exists(path):
        return path
    import urllib.request

    print("Downloading face_landmarker.task ...")
    urllib.request.urlretrieve(MODEL_URL, path)
    return path


class FaceAnalysisModule:
    """
    Real-time facial analysis via MediaPipe Face Landmarker (Tasks API).

    Extracts 3D landmarks, head pose (pitch/yaw/roll), blink ratio,
    mouth openness, and blendshape activity per face.

    Runs on CPU tensor ops in mediapipe (lite models); the heavy
    downstream (expression classification) runs on CUDA via torch.
    """

    # Canonical FaceMesh topology (478 points with refine_landmarks)
    # eye order: outer corner, top, top, inner corner, bottom, bottom
    LEFT_EYE_INDICES = [33, 159, 158, 133, 153, 145]
    RIGHT_EYE_INDICES = [362, 386, 385, 263, 374, 380]
    # mouth order: left corner, top lip, bottom lip, right corner
    MOUTH_INDICES = [61, 146, 17, 291]
    NOSE_TIP = 1

    def __init__(self, max_faces=1, model_dir="models"):
        model = _ensure_model(model_dir)
        base_options = mp_python.BaseOptions(model_asset_path=model)
        options = mp_vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=mp_vision.RunningMode.VIDEO,
            num_faces=max_faces,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.landmarker = mp_vision.FaceLandmarker.create_from_options(options)
        self._frame_ts = 0

    def analyze(self, frame_bgr):
        self._frame_ts += 1
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result: FaceLandmarkerResult = self.landmarker.detect_for_video(
            mp_image, self._frame_ts
        )

        if not result.face_landmarks:
            return {"landmarks": [], "faces": []}

        faces = []
        landmarks_list = []
        for i, f_lm in enumerate(result.face_landmarks):
            lm = np.array([[p.x, p.y, p.z] for p in f_lm], dtype=np.float32)
            landmarks_list.append(lm)

            blendshapes = {}
            if result.face_blendshapes and result.face_blendshapes[i]:
                for b in result.face_blendshapes[i]:
                    blendshapes[b.category_name] = b.score

            # Transformation matrix is normalized to a canonical face model,
            # not pixels — solvePnP style scaling not needed.
            matrix = None
            if result.facial_transformation_matrixes:
                matrix = np.array(result.facial_transformation_matrixes[i])

            face = {
                "blink": self._eye_aspect_ratio(lm[self.LEFT_EYE_INDICES]),
                "blink_right": self._eye_aspect_ratio(lm[self.RIGHT_EYE_INDICES]),
                "mouth_open": self._mouth_aspect_ratio(lm[self.MOUTH_INDICES]),
                "head_pose": self._pose_from_matrix(matrix),
                "blendshapes": blendshapes,
            }
            faces.append(face)

        return {"landmarks": landmarks_list, "faces": faces}

    @staticmethod
    def _eye_aspect_ratio(eye_pts):
        # order: outer, top, top, inner, bottom, bottom
        # vertical = top-lid->bottom pairs; horizontal = corner width
        v1 = np.linalg.norm(eye_pts[1][:2] - eye_pts[4][:2])  # 159-153
        v2 = np.linalg.norm(eye_pts[2][:2] - eye_pts[5][:2])  # 158-145
        h = np.linalg.norm(eye_pts[0][:2] - eye_pts[3][:2])   # 33-133
        return float((v1 + v2) / (2.0 * h + 1e-6))

    @staticmethod
    def _mouth_aspect_ratio(mouth_pts):
        # order: left corner, top lip, bottom lip, right corner
        vertical = np.linalg.norm(mouth_pts[1][:2] - mouth_pts[2][:2])
        horizontal = np.linalg.norm(mouth_pts[0][:2] - mouth_pts[3][:2])
        return float(vertical / (horizontal + 1e-6))

    @staticmethod
    def _pose_from_matrix(matrix):
        """Extract pitch/yaw/roll from MediaPipe facial transformation matrix.

        The matrix maps canonical face → observed face. Rotation submatrix
        (3x3) → Euler angles (XYZ convention, degrees).
        """
        if matrix is None:
            return {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}
        r = matrix[:3, :3]
        pitch = np.arctan2(-r[2, 1],
                           np.sqrt(r[0, 1] ** 2 + r[1, 1] ** 2))
        yaw = np.arctan2(r[2, 0], r[2, 2])
        roll = np.arctan2(r[0, 1], r[1, 1])
        return {
            "pitch": float(np.degrees(pitch)),
            "yaw": float(np.degrees(yaw)),
            "roll": float(np.degrees(roll)),
        }

    def release(self):
        self.landmarker.close()
