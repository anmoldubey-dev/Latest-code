# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * init per-call session state |
# +-------------------------------+
#    |
#    |----> <AudioBuf> -> __init__()
#    |        * create VAD buffer instance
#    |
#    |----> <Lock> -> __init__()
#    |        * create turn serialization lock
#    |
#    v
# +-------------------------------+
# | mark_interrupted()            |
# | * drain TTS set barge flag    |
# +-------------------------------+
#    |
#    |----> <TtsAudioSource> -> clear()
#    |        * drain queued audio frames
#    |
#    |----> _trim_last_ai_turn()
#    |        * tag last AI turn for trim
#    |
#    v
# +-------------------------------+
# | _trim_last_ai_turn()          |
# | * tag AI turn frame count     |
# +-------------------------------+
#    |
#    |----> reversed()
#    |        * scan recording turns in reverse
#    |
#    v
# +-------------------------------+
# | __repr__()                    |
# | * return debug string         |
# +-------------------------------+
#
# ================================================================

import asyncio
from dataclasses import dataclass, field
from typing import Any, List, Optional

from backend.audio.vad import AudioBuf


@dataclass
class LiveKitSession:
    session_id: str
    agent_name: str

    lang:       str
    llm_key:    str
    voice_name: str

    room:         Any = None
    audio_source: Any = None

    history: List[dict] = field(default_factory=list)

    buf: AudioBuf = field(default_factory=AudioBuf)

    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    connected:   bool = False
    closed:      bool = False
    interrupted: bool = False

    ivr_call_id:     Optional[int]  = None
    recording_turns: List[dict]     = field(default_factory=list)

    # ── Extended modules (attached in ai_worker_task) ────────────────
    session_mem:           Any = None  # SessionMemory
    interruption_detector: Any = None  # InterruptionDetector
    lang_router:           Any = None  # LanguageRouter
    smart_suggestions:     Any = None  # SmartSuggestions

    def mark_interrupted(self) -> None:
        self.interrupted = True
        if self.audio_source is not None:
            drained = self.audio_source.clear()
            self._trim_last_ai_turn(drained)

    def _trim_last_ai_turn(self, drained_frames: int) -> None:
        for i in range(len(self.recording_turns) - 1, -1, -1):
            if self.recording_turns[i]["type"] == "ai":
                if "trim_frames" not in self.recording_turns[i]:
                    self.recording_turns[i]["trim_frames"] = drained_frames
                break

    def __repr__(self) -> str:
        return (
            f"<LiveKitSession id={self.session_id[:8]} "
            f"lang={self.lang} llm={self.llm_key} "
            f"agent={self.agent_name} "
            f"connected={self.connected} closed={self.closed}>"
        )
