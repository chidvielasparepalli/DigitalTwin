"""
WebSocket bridge: streams live sensing signals (face, body, voice) to the
three.js orb in apps/web.

Flow:
  camera+mic -> FaceAnalysisModule + BodyTrackingModule + VoiceAnalysisModule
             -> JSON {person_present, face, body, voice, emotion}
             -> ws://localhost:8765

Run:
    python -m src.orb.bridge
"""
import asyncio
import json
import time

import numpy as np
import websockets

from src.vision.face_analysis import FaceAnalysisModule
from src.vision.body_tracking import BodyTrackingModule

# Lazy import of voice analysis (heavy deps) on first speech
_voice = None


def get_voice():
    global _voice
    if _voice is None:
        from src.voice.voice_analysis import VoiceAnalysisModule
        _voice = VoiceAnalysisModule()
    return _voice


# Simple emotion heuristic from blendshapes
def emotion_from_blendshapes(bs: dict) -> str:
    if not bs:
        return "neutral"
    score = {
        "happy": bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0),
        "surprised": bs.get("jawOpen", 0) + bs.get("eyeWide", 0),
        "angry": bs.get("browInnerUpDown", 0) + bs.get("mouthFrownLeft", 0)
        + bs.get("mouthFrownRight", 0),
        "sad": bs.get("browInnerUp", 0) + bs.get("mouthFrownLeft", 0),
        "fearful": bs.get("browInnerUp", 0) + bs.get("eyeSquint", 0),
    }
    best = max(score, key=score.get)
    return best if score[best] > 0.1 else "neutral"


class BehavioralModel:
    """Accumulates observed signals into a behavioral/talking-style profile.

    ponytail: simple running stats; a learned sequence model could predict
    micro-gestures, but running stats capture the clone's core identity
    (blink rate, smile bias, expressiveness) cheaply.
    """

    def __init__(self):
        self.n = 0
        self.blink_sum = 0.0
        self.smile_sum = 0.0
        self.mouth_sum = 0.0
        self.head_motion_sum = 0.0
        self.energy_sum = 0.0
        self.emotion_counts = {}
        self._prev_head = None

    def observe(self, face, body, voice):
        if face:
            bs = face["blendshapes"]
            smile = bs.get("mouthSmileLeft", 0) + bs.get("mouthSmileRight", 0)
            self.blink_sum += face["blink"]
            self.mouth_sum += face["mouth_open"]
            self.smile_sum += smile
            hp = face["head_pose"]
            if self._prev_head is not None:
                self.head_motion_sum += (
                    abs(hp["yaw"] - self._prev_head["yaw"])
                    + abs(hp["pitch"] - self._prev_head["pitch"])
                )
            self._prev_head = hp
        if voice:
            self.energy_sum += voice["energy"]
        self.n += 1

    def profile(self):
        if self.n == 0:
            return {}
        total = max(self.n, 1)
        dominant = max(self.emotion_counts,
                       key=self.emotion_counts.get) if self.emotion_counts \
            else "neutral"
        return {
            "samples": self.n,
            "avg_blink": round(self.blink_sum / total, 3),
            "avg_smile": round(self.smile_sum / total, 3),
            "avg_mouth_open": round(self.mouth_sum / total, 3),
            "head_motion": round(self.head_motion_sum / total, 4),
            "avg_voice_energy": round(self.energy_sum / total, 4),
            "dominant_emotion": dominant,
            "blink_rate_per_min": round(self.blink_sum / total * 60, 1),
        }


class Bridge:
    def __init__(self, host="localhost", port=8765, fps=20):
        self.host = host
        self.port = port
        self.interval = 1.0 / fps
        self.face = FaceAnalysisModule()
        self.body = BodyTrackingModule()
        self.voice_energy = 0.0
        self.behavior = BehavioralModel()
        self._cap = None

    def _camera(self):
        """Lazily open camera once, keep it open across snapshots."""
        import cv2

        if self._cap is None:
            self._cap = cv2.VideoCapture(0)
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        return self._cap

    def read_voice(self):
        """Sample mic briefly for voice activity (cheap, background thread)."""
        global _voice
        if _voice is None:
            try:
                from src.voice.voice_analysis import VoiceAnalysisModule
                _voice = VoiceAnalysisModule()
            except Exception:
                return
        try:
            rec = _voice.record(0.1)
            rms = float(np.sqrt(np.mean(rec ** 2)))
            self.voice_energy = 0.8 * self.voice_energy + 0.2 * rms
        except Exception:
            pass

    def snapshot(self):
        cap = self._camera()
        ret, frame = cap.read()
        if not ret:
            return None

        face = self.face.analyze(frame)
        body = self.body.analyze(frame)
        if self.behavior.n % 5 == 0:  # mic every 5th frame (~250ms)
            self.read_voice()

        person_present = bool(face["faces"] or body["keypoints"] is not None)
        # Sensor lifecycle: booting -> observing (person seen) -> cloning
        # (after enough observation)
        if not person_present:
            status = "booting"
        elif self.behavior.n < 30:
            status = "observing"
        else:
            status = "cloning"
        data = {"person_present": person_present, "status": status}

        face_payload = None
        emotion = "neutral"
        if face["faces"]:
            f = face["faces"][0]
            face_payload = {
                "blink": f["blink"],
                "mouth_open": f["mouth_open"],
                **f["head_pose"],
            }
            emotion = emotion_from_blendshapes(f["blendshapes"])
            data["face"] = face_payload
            data["emotion"] = emotion
        if body["keypoints"] is not None:
            data["body"] = {
                "posture": body["posture"],
                "gesture": body["gesture"],
            }
        voice_payload = {"energy": self.voice_energy,
                         "speaking": self.voice_energy > 0.01}
        data["voice"] = voice_payload

        # Behavioral model accumulation
        if face_payload and emotion != "neutral":
            self.behavior.emotion_counts[emotion] = \
                self.behavior.emotion_counts.get(emotion, 0) + 1
        self.behavior.observe(
            face["faces"][0] if face_payload else None,
            body["keypoints"],
            voice_payload,
        )
        if self.behavior.n % 60 == 0:  # every ~3s
            data["style"] = self.behavior.profile()
        return data

    async def run(self):
        async with websockets.serve(self.handler, self.host, self.port):
            print(f"Bridge on ws://{self.host}:{self.port}")
            await asyncio.Future()

    async def handler(self, ws):
        while True:
            data = self.snapshot()
            if data:
                await ws.send(json.dumps(data))
            await asyncio.sleep(self.interval)


if __name__ == "__main__":
    asyncio.run(Bridge().run())
