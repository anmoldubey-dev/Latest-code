# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | __init__()                    |
# | * set device and init fields  |
# +-------------------------------+
#    |
#    v
# +-------------------------------+
# | load()                        |
# | * download and init models    |
# +-------------------------------+
#    |
#    |----> <ParlerTTSForConditionalGeneration> -> from_pretrained()
#    |        * load Indic Parler TTS model
#    |
#    |----> <AutoTokenizer> -> from_pretrained()
#    |        * load Indic prompt tokenizer
#    |
#    |----> <AutoTokenizer> -> from_pretrained()
#    |        * load T5 description tokenizer
#    |
#    v
# +-------------------------------+
# | generate()                    |
# | * full TTS synthesis pipeline |
# +-------------------------------+
#    |
#    |----> <PersonaManager> -> guard()
#    |        * enforce language voice guardrail
#    |
#    |----> <PersonaManager> -> get_or_encode()
#    |        * get or cache speaker tensor
#    |
#    |----> _split_sentences()
#    |        * chunk long input text
#    |
#    |----> _generate_chunk()
#    |        * run single sentence inference
#    |
#    |----> concatenate()
#    |        * stitch all audio chunks
#    |
#    v
# [ RETURN float32 audio ndarray ]
#
# ================================================================

import os
import re
import logging
import numpy as np
import torch

from core.persona_manager import PersonaManager, INFERENCE_SEED

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
SILENCE_200MS = np.zeros(int(SAMPLE_RATE * 0.2), dtype=np.float32)


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?।|])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


class TTSEngine:
    def __init__(self, model_name: str, device: str = "cuda"):
        self.model_name = model_name
        self.device = device if torch.cuda.is_available() and device == "cuda" else "cpu"
        self.model = None
        self.description_tokenizer = None
        self.prompt_tokenizer = None
        self.persona = PersonaManager()
        self.ready = False
        self.sample_rate = SAMPLE_RATE

    def load(self):
        from transformers import AutoTokenizer
        from parler_tts import ParlerTTSForConditionalGeneration

        # ── Model resolution: project models/ → HF cache → HF download ────
        _PROJ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
        _LOCAL = os.path.join(_PROJ, "models")
        _HF = os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")
        _CACHE_MAP = {
            "ai4bharat/indic-parler-tts": [
                os.path.join(_LOCAL, "indic-parler-tts"),
                os.path.join(_HF, "models--ai4bharat--indic-parler-tts", "snapshots", "7b527af5ee8ed1f9a28d80b19703ed9bb8ba10ca"),
            ],
            "google/flan-t5-large": [
                os.path.join(_LOCAL, "flan-t5-large"),
                os.path.join(_HF, "models--google--flan-t5-large", "snapshots", "0613663d0d48ea86ba8cb3d7a44f0f65dc596a2a"),
            ],
            "google/flan-t5-base": [
                os.path.join(_LOCAL, "flan-t5-base"),
                os.path.join(_HF, "models--google--flan-t5-base", "snapshots", "7bcac572ce56db69c1ea7c8af255c5d7c9672fc2"),
            ],
        }

        def _resolve(name: str):
            for p in _CACHE_MAP.get(name, []):
                if os.path.isdir(p):
                    return (p, True)
            return (name, False)

        model_path, model_local = _resolve(self.model_name)
        logger.info("Loading model: %s (local=%s) on %s", model_path, model_local, self.device)

        self.model = ParlerTTSForConditionalGeneration.from_pretrained(
            model_path, local_files_only=model_local
        ).to(self.device)
        self.model.eval()

        self.prompt_tokenizer = AutoTokenizer.from_pretrained(
            model_path, local_files_only=model_local
        )

        try:
            desc_name = self.model.config.text_encoder._name_or_path
            desc_path, desc_local = _resolve(desc_name)
            logger.info("Description tokenizer: %s (local=%s)", desc_path, desc_local)
            self.description_tokenizer = AutoTokenizer.from_pretrained(
                desc_path, local_files_only=desc_local
            )
        except Exception as e:
            logger.warning("Falling back to single tokenizer (%s)", e)
            self.description_tokenizer = self.prompt_tokenizer

        logger.info(
            "Tokenizers — description: %s | prompt: %s",
            type(self.description_tokenizer).__name__,
            type(self.prompt_tokenizer).__name__,
        )

        global SAMPLE_RATE, SILENCE_200MS
        SAMPLE_RATE = self.model.audio_encoder.config.sampling_rate
        SILENCE_200MS = np.zeros(int(SAMPLE_RATE * 0.2), dtype=np.float32)
        self.sample_rate = SAMPLE_RATE
        logger.info("Audio sample rate: %d Hz", SAMPLE_RATE)

        self.ready = True
        logger.info("Model ready.")

    def _generate_chunk(
        self,
        text: str,
        input_ids: torch.Tensor,
        attention_mask: torch.Tensor,
    ) -> np.ndarray:
        prompt_inputs = self.prompt_tokenizer(
            text, return_tensors="pt"
        ).to(self.device)

        torch.manual_seed(INFERENCE_SEED)

        with torch.no_grad():
            generation = self.model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                prompt_input_ids=prompt_inputs.input_ids,
                prompt_attention_mask=prompt_inputs.attention_mask,
                do_sample=True,
                temperature=1.1,
                min_new_tokens=10,
                max_new_tokens=5200,
            )

        audio = generation.cpu().numpy().squeeze().astype(np.float32)
        peak = np.abs(audio).max()
        if peak > 0:
            audio = audio / peak * 0.95
        return audio

    def generate(
        self,
        text: str,
        voice_name: str,
        emotion: str,
        language: str = "",
        max_length: int = 300,
    ) -> np.ndarray:
        voice_name = self.persona.guard(voice_name, language)

        input_ids, attention_mask, description = self.persona.get_or_encode(
            voice_name, emotion, language,
            self.description_tokenizer, self.device,
        )
        logger.info("Description: %s", description)

        chunks = [text] if len(text) <= max_length else (_split_sentences(text) or [text])

        audio_parts: list[np.ndarray] = []
        for chunk in chunks:
            try:
                part = self._generate_chunk(chunk, input_ids, attention_mask)
            except RuntimeError as exc:
                if "out of memory" in str(exc).lower() and self.device == "cuda":
                    logger.warning("CUDA OOM — falling back to CPU.")
                    torch.cuda.empty_cache()
                    self.model = self.model.cpu()
                    self.persona.clear_cache()
                    self.device = "cpu"
                    input_ids = input_ids.cpu()
                    attention_mask = attention_mask.cpu()
                    part = self._generate_chunk(chunk, input_ids, attention_mask)
                else:
                    raise
            audio_parts.append(part)
            if len(chunks) > 1:
                audio_parts.append(SILENCE_200MS.copy())

        if audio_parts:
            if len(chunks) > 1:
                audio_parts = audio_parts[:-1]
            return np.concatenate(audio_parts)
        return np.zeros(SAMPLE_RATE, dtype=np.float32)
