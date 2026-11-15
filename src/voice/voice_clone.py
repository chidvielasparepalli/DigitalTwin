import os

import numpy as np
import torch


class VoiceCloneModule:
    """
    Voice cloning via Coqui XTTS-v2.

    Given a short reference sample (>=6s, ideally 10-15s) of a speaker,
    XTTS-v2 can synthesize new speech in that voice with emotion + speed
    conditioning. Runs on CUDA.

    Model (~1.8GB) downloads on first use.
    """

    MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

    def __init__(self, device="cuda"):
        self.device = device if torch.cuda.is_available() else "cpu"
        self._tts = None

    def _load(self):
        if self._tts is None:
            _auto_accept_tos()
            from TTS.api import TTS

            self._tts = TTS(self.MODEL_NAME).to(self.device)
        return self._tts

    def clone_speech(self, text, reference_wav, output_wav="clone_out.wav",
                     language="en", speed=1.0, emotion=None):
        """
        Synthesize `text` in the voice of `reference_wav`.

        Returns path to output wav.
        """
        tts = self._load()
        text = _strip_non_supported(text)

        # XTTS takes emotion via prompt audio only (speaker ref). For
        # emotional output, prepend emotion words; XTTS follows prompt.
        prompt_audio = reference_wav if isinstance(reference_wav, str) else \
            _save_temp(reference_wav)

        tts.tts_to_file(
            text=text,
            speaker_wav=prompt_audio,
            language=language,
            file_path=output_wav,
            speed=speed,
        )
        return output_wav

    def is_loaded(self):
        return self._tts is not None


def _auto_accept_tos():
    """Coqui blocks model download on a ToS prompt (input()). Auto-accept.

    Non-interactive sessions can't answer; CPML non-commercial terms are
    the default. User with a commercial license: override in config.
    """
    from TTS.utils import manage as m

    m.ModelManager.ask_tos = lambda _self, _path: True


def _strip_non_supported(text):
    """XTTS ignores some chars; keep ASCII + common punctuation."""
    return "".join(ch for ch in text if ch.isalnum()
                   or ch in " .,!?;:'\"-()")


def _save_temp(audio, sr=16000, name="ref_temp.wav"):
    import soundfile as sf

    sf.write(name, np.asarray(audio, dtype=np.float32), sr)
    return name
