# Face models

Cutline matches faces against roster headshots on the photographer's own computer, with the three
models below. Nothing is sent anywhere. **These files are not covered by Cutline's MIT license**;
each keeps its own license, stated here.

## face_detection_yunet_2026may.onnx

YuNet face detector (finds the faces), unmodified.
Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
License: MIT. Copyright (c) 2020 Shiqi Yu <shiqi.yu@gmail.com>.
SHA-256: ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0

## scrfd_500m.onnx

SCRFD-500M face detector from InsightFace (sharper eye, nose and mouth points on the face YuNet
found), unmodified: `det_500m.onnx` from the buffalo_sc model pack,
https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip
SHA-256: 5e4447f50245bbd7966bd6c0fa52938c61474a04ec7def48753668a9d8b4ea3a

## arcface_w600k_r50_int8_cutline.onnx

ArcFace ResNet-50 trained on WebFace600K, from InsightFace: `w600k_r50.onnx` from the buffalo_l
model pack, https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
(SHA-256 4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43).

Modified for Cutline: opset raised from 11 to 13 (no operator changed), then quantized with
onnxruntime's `quantize_dynamic` (uint8 weights, per tensor) so it downloads at a quarter of the
size and runs faster in the browser.
SHA-256 of the modified file: 5a2c5ab78f147f207c5455f6d984b164980cea9d02727c01d73582f58e2e9f94

## License of the InsightFace models (SCRFD and ArcFace)

InsightFace's code is MIT-licensed, but its pretrained models are not: "The training data
containing the annotation (and the models trained with these data) are available for
non-commercial research purposes only." (https://github.com/deepinsight/insightface#license)

Cutline uses them for non-commercial research. Anyone using Cutline's face matching, or these
files, commercially needs a license from InsightFace (recognition-oss-pack@insightface.ai) or
must turn face matching off.
