`face-antispoof-minifasnet.onnx` is the quantized MiniFAS model from
https://github.com/facenox/face-antispoof-onnx (Apache-2.0).
The server uses it for experimental screening of submitted login and attendance frames.
The score is not proof that frames came from a trusted camera; the browser supplies
both frames and face boxes, so a modified client can bypass this screening.
The upstream model expects a 1.5x face crop, RGB values scaled to [0, 1],
and produces real and spoof logits. See the upstream repository for its license
and model evaluation limitations.
