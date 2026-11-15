import numpy as np
import torch
import torchaudio

# Optional heavy imports, lazy-loaded in methods so module import stays cheap
_whisper_model = None
_pyin_torch = None


class VoiceAnalysisModule:
    """
    Voice capture and analysis:
      - Record from mic (sounddevice) or accept raw audio
      - Speech-to-text via faster-whisper (CUDA)
      - Pitch/tone analysis via torchaudio pyin
      - Speaking-rate + energy + silence-ratio stats

    Characteristics feed the behavioral model and drive the digital twin.
    """

    SAMPLE_RATE = 16000

    def __init__(self, device="cuda", mic_device=None):
        import sounddevice as sd

        self.sd = sd
        self.mic_device = mic_device
        if self.mic_device is not None:
            sd.default.device = (mic_device, None)
        self.device = device if torch.cuda.is_available() else "cpu"
        self._sr = self.SAMPLE_RATE

    # ---------- capture ----------
    def record(self, seconds=6.0):
        """Record N seconds from the mic, return float32 mono audio [N]."""
        import sounddevice as sd

        n = int(self._sr * seconds)
        rec = sd.rec(n, samplerate=self._sr, channels=1, dtype="float32")
        sd.wait()
        return rec[:, 0]

    # ---------- transcription ----------
    def transcribe(self, audio):
        """Speech-to-text. Returns dict with text, language, segments."""
        global _whisper_model
        from faster_whisper import WhisperModel

        if _whisper_model is None:
            # Base model: good accuracy / speed tradeoff on RTX 4060
            _whisper_model = WhisperModel(
                "base", device=self.device, compute_type="float16"
            )
        audio_f32 = self._ensure_float32(audio)
        segments, info = _whisper_model.transcribe(
            audio_f32,
            beam_size=5,
            language=None,
            vad_filter=True,
        )
        segs = list(segments)
        text = " ".join(s.text.strip() for s in segs)
        duration = len(audio_f32) / self._sr
        return {
            "text": text,
            "language": info.language,
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text.strip()}
                for s in segs
            ],
            "duration": duration,
            "speaking_rate_wpm": self._speaking_rate(text, duration),
        }

    # ---------- characteristics ----------
    def analyze_voice(self, audio):
        """Pitch, energy, and speaking-characteristics from raw audio.

        Returns dict: f0_median, f0_std, energy_rms, silence_ratio,
        voiced_ratio, formant-ish spectral centroid.
        """
        audio = self._ensure_float32(audio)
        if audio.size == 0:
            return self._empty_stats()

        # Energy / silence
        frame = 1024
        hop = 512
        rms = torch.tensor(audio).unfold(0, frame, hop).pow(2).mean(dim=1).sqrt()
        energy_rms = float(rms.mean())
        threshold = max(0.01, energy_rms * 0.3)
        silence_ratio = float((rms < threshold).float().mean())

        # Pitch via librosa pyin (accurate YIN-based)
        try:
            import librosa

            f0, voiced, _ = librosa.pyin(
                audio, fmin=60, fmax=400, sr=self._sr, frame_length=frame
            )
            voiced_f0 = f0[voiced]
            f0_median = float(np.median(voiced_f0)) if voiced_f0.size else 0.0
            f0_std = float(np.std(voiced_f0)) if voiced_f0.size else 0.0
            voiced_ratio = float(voiced.mean())
        except Exception:
            f0_median = f0_std = 0.0
            voiced_ratio = 0.0

        # Spectral centroid (vocal tract brightness) via torch.stft
        win = torch.hann_window(1024)
        stft = torch.stft(
            torch.tensor(audio), n_fft=1024, hop_length=hop,
            win_length=1024, window=win, return_complex=True,
        )
        power_spec = stft.abs().pow(2)  # [freq, time]
        freqs = torch.linspace(0, self._sr / 2, power_spec.shape[0])
        frame_centroids = ((power_spec * freqs.unsqueeze(1)).sum(dim=0) /
                           (power_spec.sum(dim=0) + 1e-6))
        centroid = float(frame_centroids.mean())

        return {
            "energy_rms": energy_rms,
            "silence_ratio": silence_ratio,
            "f0_median": f0_median,
            "f0_std": f0_std,
            "voiced_ratio": voiced_ratio,
            "spectral_centroid": centroid,
        }

    def _speaking_rate(self, text, duration):
        if duration <= 0 or not text:
            return 0.0
        words = len(text.split())
        return float(words / (duration / 60.0))

    @staticmethod
    def _ensure_float32(audio):
        a = np.asarray(audio, dtype=np.float32)
        if a.ndim > 1:
            a = a.mean(axis=1)
        return a

    @staticmethod
    def _empty_stats():
        return {
            "energy_rms": 0.0, "silence_ratio": 1.0,
            "f0_median": 0.0, "f0_std": 0.0, "voiced_ratio": 0.0,
            "spectral_centroid": 0.0,
        }

    def full_analysis(self, audio):
        """Transcribe + analyze characteristics in one call."""
        audio = self._ensure_float32(audio)
        transcript = self.transcribe(audio)
        chars = self.analyze_voice(audio)
        chars.update(transcript)
        return chars
