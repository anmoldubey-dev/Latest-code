# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +-------------------------------------------+
# | merge_transcription_and_diarization()     |
# | * align STT segments with speakers        |
# +-------------------------------------------+
#     |
#     |----> getattr()
#     |        * extract start, end, text
#     |
#     |----> max()
#     |        * compute overlap start
#     |
#     |----> min()
#     |        * compute overlap end
#     |
#     |----> append()
#     |        * build result with speaker label
#     |
#     v
# [ RETURN List[dict] ]
#
# ================================================================

import logging

logger = logging.getLogger(__name__)


def merge_transcription_and_diarization(whisper_segments, diarization_segments):
    final_output = []

    for text_seg in whisper_segments:
        t_start = getattr(text_seg, 'start', getattr(text_seg, 'get', lambda x, y: 0)('start', 0))
        t_end = getattr(text_seg, 'end', getattr(text_seg, 'get', lambda x, y: 0)('end', 0))
        text = getattr(text_seg, 'text', getattr(text_seg, 'get', lambda x, y: "")('text', "")).strip()

        matched_speaker = "UNKNOWN"
        max_overlap = 0

        for dia_seg in diarization_segments:
            overlap_start = max(t_start, dia_seg["start"])
            overlap_end = min(t_end, dia_seg["end"])
            overlap_duration = max(0, overlap_end - overlap_start)

            if overlap_duration > max_overlap:
                max_overlap = overlap_duration
                matched_speaker = dia_seg["speaker"]

        final_output.append({
            "speaker": matched_speaker,
            "start": t_start,
            "end": t_end,
            "text": text
        })

    return final_output
