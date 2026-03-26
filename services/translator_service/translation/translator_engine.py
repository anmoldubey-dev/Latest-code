# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +------------------------------------+
# | __init__()                         |
# | * load M2M-100 tokenizer and model |
# +------------------------------------+
#     |
#     |----> _best_device()
#     |        * detect CUDA or CPU
#     |
#     |----> <M2M100Tokenizer> -> from_pretrained()
#     |        * load tokenizer
#     |
#     |----> <M2M100ForConditionalGeneration> -> from_pretrained()
#     |        * load translation model
#     |
#     v
# +------------------------------------+
# | translate()                        |
# | * tokenize beam search decode text |
# +------------------------------------+
#     |
#     |----> <M2M100Tokenizer> -> __call__()
#     |        * tokenize source text
#     |
#     |----> <M2M100ForConditionalGeneration> -> generate()
#     |        * beam search translation
#     |
#     |----> <M2M100Tokenizer> -> batch_decode()
#     |        * decode token ids to text
#     |
#     v
# +------------------------------+
# | is_pair_supported()          |
# | * check language in vocab    |
# +------------------------------+
#     |
#     v
# +------------------------------+
# | _best_device()               |
# | * return cuda or cpu string  |
# +------------------------------+
#
# ================================================================

import logging
import os

from transformers import M2M100ForConditionalGeneration, M2M100Tokenizer

logger = logging.getLogger(__name__)

MODEL_NAME = "facebook/m2m100_418M"

# Resolved snapshot path — avoids any HuggingFace network call on startup
_HF_CACHE = os.path.join(
    os.path.expanduser("~"), ".cache", "huggingface", "hub",
    "models--facebook--m2m100_418M", "snapshots",
    "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636",
)
# Fallback to hub identifier if snapshot not present (first run)
_MODEL_PATH = _HF_CACHE if os.path.isdir(_HF_CACHE) else MODEL_NAME


class TranslatorEngine:

    def __init__(self):
        self._device = self._best_device()
        logger.info("Loading M2M-100 from: %s", _MODEL_PATH)
        self._tokenizer = M2M100Tokenizer.from_pretrained(
            _MODEL_PATH, local_files_only=os.path.isdir(_HF_CACHE)
        )
        self._model = M2M100ForConditionalGeneration.from_pretrained(
            _MODEL_PATH, local_files_only=os.path.isdir(_HF_CACHE)
        )
        if self._device == "cuda":
            self._model = self._model.cuda()
        self._model.eval()
        logger.info("M2M-100 translation model ready (%s).", self._device)

    def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        if not text or not text.strip():
            return ""

        try:
            self._tokenizer.src_lang = src_lang
            encoded = self._tokenizer(
                text.strip(),
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512,
            )
            if self._device == "cuda":
                encoded = {k: v.cuda() for k, v in encoded.items()}

            generated = self._model.generate(
                **encoded,
                forced_bos_token_id=self._tokenizer.get_lang_id(tgt_lang),
                num_beams=4,
                max_new_tokens=256,
                early_stopping=True,
            )
            return self._tokenizer.batch_decode(
                generated, skip_special_tokens=True
            )[0]

        except Exception:
            logger.exception(
                "Translation failed [%s→%s]: %r", src_lang, tgt_lang, text[:80]
            )
            return ""

    def is_pair_supported(self, src_lang: str, tgt_lang: str) -> bool:
        try:
            self._tokenizer.get_lang_id(tgt_lang)
            return True
        except KeyError:
            return False

    @staticmethod
    def _best_device() -> str:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass
        return "cpu"
