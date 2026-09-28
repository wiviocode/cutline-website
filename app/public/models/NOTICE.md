# Face models

Cutline matches faces against roster headshots on the photographer's own computer, with these two
models from the OpenCV model zoo (https://github.com/opencv/opencv_zoo). Nothing is sent anywhere.

## face_detection_yunet_2026may.onnx

YuNet face detector, unmodified.
Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
License: MIT. Copyright (c) 2020 Shiqi Yu <shiqi.yu@gmail.com>.
SHA-256: ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0

## face_recognition_sface_2021dec_int8bq_cutline.onnx

SFace face recognizer, block-quantized int8 build (face_recognition_sface_2021dec_int8bq.onnx,
SHA-256 fb143eea07838aa532d1c95df5f69899974ea0140e1fba05e94204be13ed74ee).
Source: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0).

Modified for Cutline: the 174 graph inputs that are also initialisers (weights such as
`conv_1_conv2d_weight`, and two scalars) were removed from the graph's input list so
onnxruntime-web will run it. No weight or operator was changed.
SHA-256 of the modified file: 487a139eb85ccd5ff30aef7d0add7f12d2bb7abb90c5f08a7f481b452a660e00
