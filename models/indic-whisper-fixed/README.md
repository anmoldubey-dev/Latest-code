---
language:
- hi
metrics:
- wer
pipeline_tag: automatic-speech-recognition
tags:
- music
license: mit
---

# IndicWhisper With JAX (more faster)

IndicWhisper is a state-of-the-art speech recognition model fine-tuned on Indian languages. This repository contains the code for training and evaluating the model, as well as pre-trained checkpoints for immediate use.

## Overview

IndicWhisper achieves impressive Word Error Rates (WERs) on various benchmarks for Indian languages. It outperforms other publicly available models, making it a valuable asset for speech recognition tasks in Indian languages.

### Performance on Vistaar Benchmark (Hindi Subset)

| Model         | Kathbath | Kathbath-Hard | FLEURS   | CommonVoice | IndicTTS | MUCS         | Gramvaani | Average   |
|---------------|----------|---------------|----------|-------------|----------|--------------|-----------|-----------|
| Google STT    | 14.3     | 16.7          | 19.4     | 20.8        | 18.3     | 17.8         | 59.9      | 23.9      |
| IndicWav2vec  | 12.2     | 16.2          | 18.3     | 20.2        | 15       | 22.9         | 42.1      | 21        |
| Azure STT     | 13.6     | 15.1          | 24.3     | 14.6        | 15.2     | 15.1         | 42.3      | 20        |
| Nvidia-medium | 14       | 15.6          | 19.4     | 20.4        | 12.3     | 12.4         | 41.3      | 19.4      |
| Nvidia-large  | 12.7     | 14.2          | 15.7     | 21.2        | 12.2     | **11.8**     | 42.6      | 18.6      |
| IndicWhisper  | **10.3** | **12.0**      | **11.4** | **15.0**    | **7.6**  | 12           | **26.8**  | **13.6**  |



## Usage



## New Feature: JAX Mode

We have recently added support for JAX mode, which significantly enhances performance on both TPUs and GPUs. This feature is particularly useful for high-performance computing environments and is optimized for speed and efficiency.

This repository provides an optimized JAX model for the Indic Whisper Model, built upon the foundation of the 🤗 Indic Whisper implementation by AI4 Bharat. The JAX implementation significantly enhances performance, running over 70x compared to the original Indic Whisper PyTorch code. This makes it the fastest Whisper implementation available.

```python
from whisper_jax import FlaxWhisperForConditionalGeneration, FlaxWhisperPipline
import jax.numpy as jnp

pipeline = FlaxWhisperPipline('parthiv11/indic_whisper_nodcil', dtype=jnp.bfloat16)
transcript= pipeline('sample.mp3')

```

### Acknowledgements

We would like to express our gratitude to the following organizations for their support:

- EkStep Foundation for their generous grant, which facilitated the establishment of the Centre for AI4Bharat at IIT Madras.
- The Ministry of Electronics and Information Technology (NLTM) for its grant to support the creation of datasets and models for Indian languages under the Bhashini project.
- The Centre for Development of Advanced Computing, India (C-DAC), for providing access to the Param Siddhi supercomputer for training our models.
- Microsoft for its grant to create datasets, tools, and resources for Indian languages.
- For JAX guide on [github](https://github.com/sanchit-gandhi/whisper-jax)


### License

IndicWhisper and the associated Vistaar benchmark are MIT-licensed. This license applies to all the fine-tuned language models included in this repository.

### Contributors

- Kaushal Bhogale (AI4Bharat)
- Sai Narayan Sundaresan (IITKGP, AI4Bharat)
- Abhigyan Raman (AI4Bharat)
- Tahir Javed (IITM, AI4Bharat)
- Mitesh Khapra (IITM, AI4Bharat, RBCDSAI)
- Pratyush Kumar (Microsoft, AI4Bharat)


## Contributing

We welcome contributions from the community to further improve IndicWhisper. If you have any ideas, bug fixes, or enhancements, please feel free to submit a pull request.

Thank you for your interest in IndicWhisper! We hope it proves to be a valuable tool for your speech recognition needs in Indian languages.