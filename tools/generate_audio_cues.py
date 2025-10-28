"""Utility script for regenerating notification audio cues.

This script synthesizes short waveforms for the UI notification and HP/SP
feedback sounds.  Running it will emit a JSON blob mapping cue names to their
base64-encoded WAV payloads so the values can be pasted into
`scripts/notifications.js` when tweaks are required.
"""
from __future__ import annotations

import base64
import io
import json
import sys
import math
import wave
from dataclasses import dataclass
from typing import Iterable, Sequence

SAMPLE_RATE = 44_100


@dataclass(frozen=True)
class Segment:
    """Represents a single section within an audio cue."""

    freqs: Sequence[float] | None
    duration: float
    volume: float = 0.4
    wave: str = "sine"
    attack: float = 0.008
    release: float = 0.04

    @classmethod
    def tone(
        cls,
        freq: float,
        duration: float,
        *,
        volume: float = 0.4,
        wave: str = "sine",
        attack: float = 0.008,
        release: float = 0.04,
    ) -> "Segment":
        return cls((freq,), duration, volume, wave, attack, release)

    @classmethod
    def chord(
        cls,
        freqs: Sequence[float],
        duration: float,
        *,
        volume: float = 0.4,
        wave: str = "sine",
        attack: float = 0.008,
        release: float = 0.04,
    ) -> "Segment":
        return cls(tuple(freqs), duration, volume, wave, attack, release)

    @classmethod
    def silence(cls, duration: float) -> "Segment":
        return cls((), duration, 0.0, "sine", 0.0, 0.0)


CUE_LAYOUTS: dict[str, Sequence[Segment]] = {
    "success": (
        Segment.tone(622.25, 0.12, volume=0.36),
        Segment.tone(783.99, 0.12, volume=0.36),
        Segment.chord((783.99, 987.77), 0.18, volume=0.34),
    ),
    "info": (
        Segment.tone(698.46, 0.22, volume=0.28),
        Segment.silence(0.04),
        Segment.tone(932.33, 0.16, volume=0.22),
    ),
    "warn": (
        Segment.tone(493.88, 0.16, volume=0.32),
        Segment.silence(0.05),
        Segment.tone(440.00, 0.18, volume=0.32, wave="triangle"),
    ),
    "warning": (
        Segment.tone(349.23, 0.20, volume=0.34, wave="saw"),
        Segment.silence(0.08),
        Segment.tone(311.13, 0.28, volume=0.32, wave="saw"),
    ),
    "error": (
        Segment.tone(523.25, 0.16, volume=0.33, wave="square"),
        Segment.tone(392.00, 0.18, volume=0.33, wave="square"),
        Segment.tone(233.08, 0.20, volume=0.30, wave="square"),
    ),
    "danger": (
        Segment.chord((220.00, 277.18), 0.22, volume=0.36, wave="saw"),
        Segment.silence(0.06),
        Segment.chord((207.65, 311.13), 0.32, volume=0.36, wave="saw"),
    ),
    "failure": (
        Segment.chord((392.00, 523.25), 0.20, volume=0.30),
        Segment.tone(329.63, 0.18, volume=0.30),
        Segment.tone(246.94, 0.22, volume=0.28),
    ),
    "hp-damage": (
        Segment.chord((300.0, 180.0), 0.18, volume=0.34, wave="saw"),
        Segment.chord((180.0, 120.0), 0.22, volume=0.32, wave="triangle"),
    ),
    "hp-heal": (
        Segment.tone(523.25, 0.16, volume=0.32),
        Segment.tone(659.25, 0.16, volume=0.32),
        Segment.chord((784.0, 988.0), 0.20, volume=0.28),
    ),
    "hp-down": (
        Segment.tone(233.08, 0.20, volume=0.33),
        Segment.tone(196.00, 0.22, volume=0.30),
        Segment.tone(155.56, 0.22, volume=0.30),
    ),
    "sp-gain": (
        Segment.tone(659.25, 0.16, volume=0.30, wave="triangle"),
        Segment.chord((783.99, 987.77), 0.18, volume=0.30, wave="triangle"),
        Segment.tone(1174.66, 0.18, volume=0.26),
    ),
    "sp-spend": (
        Segment.tone(392.00, 0.16, volume=0.32),
        Segment.tone(311.13, 0.16, volume=0.32),
        Segment.tone(261.63, 0.18, volume=0.30),
    ),
    "sp-empty": (
        Segment.tone(260.0, 0.14, volume=0.32, wave="square"),
        Segment.silence(0.08),
        Segment.tone(220.0, 0.18, volume=0.32, wave="square"),
        Segment.silence(0.08),
        Segment.tone(185.0, 0.22, volume=0.28, wave="square"),
    ),
}


def render_sample(freq: float, t: float, wave_type: str) -> float:
    phase = 2 * math.pi * freq * t
    if wave_type == "square":
        return 1.0 if math.sin(phase) >= 0 else -1.0
    if wave_type == "triangle":
        return 2 * math.asin(math.sin(phase)) / math.pi
    if wave_type == "saw":
        return 2 * (freq * t - math.floor(0.5 + freq * t))
    return math.sin(phase)


def render_segment(segment: Segment) -> list[float]:
    if segment.freqs == ():
        length = max(1, int(segment.duration * SAMPLE_RATE))
        return [0.0] * length
    freqs = segment.freqs or (440.0,)
    n = max(1, int(segment.duration * SAMPLE_RATE))
    data: list[float] = []
    for i in range(n):
        t = i / SAMPLE_RATE
        sample = sum(render_sample(freq, t, segment.wave) for freq in freqs)
        sample /= max(len(freqs), 1)
        env = 1.0
        if segment.attack and t < segment.attack:
            env *= t / segment.attack
        if segment.release and (segment.duration - t) < segment.release:
            tail = segment.duration - t
            env *= max(tail / segment.release, 0.0)
        data.append(sample * env * segment.volume)
    return data


def combine_segments(segments: Sequence[Segment]) -> list[float]:
    samples: list[float] = []
    for segment in segments:
        samples.extend(render_segment(segment))
    fade = min(len(samples) // 2, int(0.01 * SAMPLE_RATE))
    if fade:
        for i in range(fade):
            ramp = i / fade
            samples[i] *= ramp
            samples[-(i + 1)] *= ramp
    peak = max((abs(value) for value in samples), default=1.0)
    if peak > 0.95:
        scale = 0.95 / peak
        samples = [value * scale for value in samples]
    return samples


def samples_to_wav_bytes(samples: Iterable[float]) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for sample in samples:
            clamped = max(-1.0, min(1.0, sample))
            frames.extend(int(clamped * 32767).to_bytes(2, "little", signed=True))
        wf.writeframes(frames)
    return buffer.getvalue()


def main() -> None:
    encoded: dict[str, str] = {}
    for name, layout in CUE_LAYOUTS.items():
        samples = combine_segments(layout)
        wav_bytes = samples_to_wav_bytes(samples)
        encoded[name] = base64.b64encode(wav_bytes).decode("ascii")
    json.dump(encoded, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
