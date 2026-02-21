# EasyReLine

A simple open-source wrapper around [ReLine](https://github.com/rewaifu/reline) with minimal but sufficient functionality for convenient image upscaling.

<img src="EasyReLineScreen.png" style="border-radius: 12px;"/>

---

## Features

### 1. **Folder Read & Save Node**

Accepts:

* **Input Directory** — path to the folder containing images for upscaling
* **Output Directory** — path to the folder where results will be saved
* **Recursive** — enables recursive file reading

When recursion is enabled, the original folder structure is fully preserved in the output directory.

---

### 2. **Upscale Node**

The main image processing node.

* **Model** — path to the model file.
  Supports weights from most popular architectures.
  Supported formats: `safetensors`, `pth`, `pt`.
  If your model is not supported, contact us on Discord: [https://discord.gg/xwZfWWMwBq](https://discord.gg/xwZfWWMwBq)

* **Tile Size** — size of the tiles the image is split into.
  If the tile size is larger than the image, tiling is not applied.
  Tiling reduces memory usage, since computational cost grows quadratically with image size.
  Without tiling, large images may cause OOM errors.
  It is recommended to use the largest tile size that fits into your VRAM.
  Note that tiling may slightly reduce output quality.

* **DType** — data type used for processing.
  If you are unsure, use `F32`.

* **Target Scale Model** — final scaling factor.
  1x models cannot upscale and will return an error if scaling above 1 is selected.
  Fractional values such as `3/4` are supported — the pipeline will correctly compute the final scale.
  Both upscaling and downscaling are supported.

* **Allow CPU Upscale** — if disabled and only CPU drivers are available, processing will not start.

* **Color Fix** — applies slight level adjustments to reduce model artifacts.
  It is recommended to keep this enabled. It does not affect overall brightness.

---

### 3. **Resize Node**

Optional final processing step.

* **Enable Target Scale** — when enabled, the pipeline resizes the final image to the selected size using the chosen filter.

* **Filter** — interpolation method.
  All options starting with `s` followed by a number correspond to SuperSampling:
  [https://docs.rs/fast_image_resize/latest/fast_image_resize/enum.ResizeAlg.html#variant.SuperSampling](https://docs.rs/fast_image_resize/latest/fast_image_resize/enum.ResizeAlg.html#variant.SuperSampling)
  The most stable option in most cases is `linear`.

* **Resize Mode** — determines which side will match the `Target Size` while preserving aspect ratio.
  Example: if width is set to 1000 and the image after upscaling is 1500×2000 (H×W), the final result will be 750×1000.

* **Target Size** — the desired size of the selected side.

---

## Installation

### Linux

1. Download `easy_reline-vx.x.x-x86_64-linux.tar.gz` from Releases
2. Extract it to a convenient directory
3. Make the binary executable:

   ```bash
   chmod +x easy_reline
   ```
4. Run:

   ```bash
   ./easy_reline
   ```

The first launch may take up to an hour, as PyTorch will be installed alongside the binary.

For Wayland users, run:

```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 GDK_BACKEND=x11 ./easy_reline
```

---

### Windows

1. Download from Releases:

   * `easy_reline_x.x.x_x64_en-US.msi`
     or
   * `easy_reline_x.x.x_x64-setup.exe`
2. Install the application to any preferred location.

The first launch may also take up to an hour due to PyTorch installation.

---

## Manual Build

```bash
git clone https://github.com/rewaifu/easy_reline.git
cd easy_reline

# Windows
cargo tauri build

# Linux
cargo tauri build --no-bundle
```
