import io
import wave
from pathlib import Path

import numpy as np
import pytest

from radio.core.config import Settings
from radio.signals.audio import DIM, EffnetEmbedder, ModelError, check_model, from_blob, to_blob

MODEL = Settings(_env_file=None).effnet_model
needs_model = pytest.mark.skipif(not MODEL.exists(), reason="modèle EffNet absent")


def test_check_model(tmp_path: Path) -> None:
    with pytest.raises(ModelError, match="absent"):
        check_model(tmp_path / "none.pb")
    p = tmp_path / "m.pb"
    p.write_bytes(b"x")
    with pytest.raises(ModelError, match="somme de contrôle"):
        check_model(p)
    with pytest.raises(ModelError):
        EffnetEmbedder(p)


def test_blob_round_trip() -> None:
    v = np.arange(DIM, dtype=np.float32) / DIM
    b = to_blob(v)
    assert len(b) == 5120
    assert np.array_equal(from_blob(b), v)


class _FakeLoader:
    def configure(self, **kwargs: object) -> None:
        pass

    def __call__(self) -> np.ndarray:
        return np.ones(32000, dtype=np.float32)


class _FakeNetRaising:
    def __call__(self, audio: np.ndarray) -> np.ndarray:
        raise RuntimeError("boom")


def test_effnet_returns_none_when_net_raises_runtime_error() -> None:
    # Réseau EffNet factice (aucun modèle réel requis) : une RuntimeError du graphe TensorFlow
    # doit être comptée « empreinte ratée », pas bloquer `signals` (F3).
    emb = object.__new__(EffnetEmbedder)
    emb._loader = _FakeLoader()  # type: ignore[attr-defined]
    emb._net = _FakeNetRaising()  # type: ignore[attr-defined]
    assert emb.embed(b"whatever bytes") is None


@pytest.fixture(scope="module")
def effnet() -> EffnetEmbedder:
    return EffnetEmbedder(MODEL)


def sine_wav(seconds: float = 5.0, sr: int = 44100) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    pcm = (0.3 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


@needs_model
def test_effnet_embeds_audio(effnet: EffnetEmbedder) -> None:
    v = effnet.embed(sine_wav(), suffix=".wav")
    assert v is not None and v.shape == (DIM,) and v.dtype == np.float32
    assert abs(float(np.linalg.norm(v)) - 1.0) < 1e-5


@needs_model
def test_effnet_rejects_garbage(effnet: EffnetEmbedder) -> None:
    assert effnet.embed(b"not audio at all") is None


@needs_model
def test_effnet_rejects_too_short(effnet: EffnetEmbedder) -> None:
    assert effnet.embed(sine_wav(seconds=1.0), suffix=".wav") is None
