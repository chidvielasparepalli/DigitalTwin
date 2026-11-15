"""
Digital Twin system orchestrator.

Full pipeline:
    START -> orb boots (open web app /orb) -> camera+mic initialized
    -> person detected -> face/body/voice measured -> live sync to orb
    -> (optional) voice-clone profile captured from your speech

Commands:
    python -m src.main bridge      # stream sensors to orb (WebSocket :8765)
    python -m src.main profile     # capture voice profile -> voice clone ref
    python -m src.main run         # bridge + open orb browser
"""
import argparse
import asyncio
import json
import os
import sys
import webbrowser


def cmd_bridge(args):
    from src.orb.bridge import Bridge

    print("Starting sensor bridge on ws://localhost:8765 ...")
    print("Open the orb in a browser: http://localhost:5173/orb")
    asyncio.run(Bridge().run())


def cmd_profile(args):
    """Capture the user's voice, build voice-clone reference + style profile."""
    from src.voice.voice_analysis import VoiceAnalysisModule
    from src.vision.face_analysis import FaceAnalysisModule
    from src.vision.body_tracking import BodyTrackingModule

    print("=" * 60)
    print("DIGITAL TWIN - VOICE PROFILE CAPTURE")
    print("=" * 60)
    print("Speak naturally for 10 seconds. This captures your voice,")
    print("tone, and speaking style to build your clone.")
    print("(silence is OK - the system samples ambient too)\n")

    va = VoiceAnalysisModule()
    audio = va.record(10.0)
    print(f"Captured {len(audio)/va.SAMPLE_RATE:.1f}s of audio")

    chars = va.analyze_voice(audio)
    transcript = va.transcribe(audio)
    print(f"\nVoice characteristics: {json.dumps(chars, indent=2)}")
    print(f"Transcribed: {transcript['text'] or '(no speech detected)'}")

    # Save reference for cloning
    import soundfile as sf

    os.makedirs("profiles", exist_ok=True)
    ref_path = "profiles/voice_ref.wav"
    sf.write(ref_path, audio, va.SAMPLE_RATE)
    print(f"\nVoice reference saved: {ref_path}")

    # Face/body baseline
    import cv2

    fa = FaceAnalysisModule()
    bt = BodyTrackingModule()
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    print("\nScanning face/body baseline (3s)...")
    for _ in range(15):
        ret, frame = cap.read()
        if not ret:
            continue
        fa.analyze(frame)
        bt.analyze(frame)
    cap.release()
    fa.release()
    bt.release()
    print("Profile capture complete.")


def cmd_run(args):
    import threading
    import subprocess

    def start_bridge():
        from src.orb.bridge import Bridge

        asyncio.run(Bridge().run())

    t = threading.Thread(target=start_bridge, daemon=True)
    t.start()
    print("Bridge started.")
    print("Open http://localhost:5173/orb for the orb interface.")
    print("Press Ctrl+C to stop.")
    try:
        while True:
            import time

            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down.")


def main():
    p = argparse.ArgumentParser(description="Digital Twin system")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bridge", help="stream sensors to orb")
    sub.add_parser("profile", help="capture voice/face/body profile")
    sub.add_parser("run", help="bridge + orb")
    args = p.parse_args()
    if args.cmd == "bridge":
        cmd_bridge(args)
    elif args.cmd == "profile":
        cmd_profile(args)
    elif args.cmd == "run":
        cmd_run(args)


if __name__ == "__main__":
    main()
