import os
from pathlib import Path

import cairosvg
import imageio.v2 as imageio
import numpy as np
from PIL import Image


def batch_svg_to_png(
    input_folder: str,
    output_folder: str,
    scale: float = 2.0,
):
    """
    Convert all .svg files from input_folder to .png files in output_folder
    using Cairo via cairosvg.

    - input_folder: folder containing the SVG frames (e.g. "wing_flap_frames")
    - output_folder: folder where PNGs will be written (e.g. "wing_flap_png")
    - scale: resolution multiplier (1.0 = original SVG size, 2.0 = 2x, etc.)
    """
    in_dir = Path(input_folder)
    out_dir = Path(output_folder)

    if not in_dir.exists():
        raise FileNotFoundError(f"Input folder does not exist: {in_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    svg_files = sorted(in_dir.glob("*.svg"))
    if not svg_files:
        print(f"No .svg files found in {in_dir}")
        return

    print(f"Found {len(svg_files)} SVG files in {in_dir}")
    print(f"Saving PNGs to {out_dir} (scale={scale})")

    for i, svg_path in enumerate(svg_files, start=1):
        png_path = out_dir / f"{svg_path.stem}.png"

        # Using url=... lets cairosvg handle reading the file itself
        cairosvg.svg2png(
            url=str(svg_path),
            write_to=str(png_path),
            scale=scale,
        )

        print(f"[{i}/{len(svg_files)}] {svg_path.name} -> {png_path.name}")

    print("PNG export done.")


def pngs_to_boomerang_gif(
    input_folder: str,
    output_gif: str,
    fps: int = 20,
):
    """
    Take all PNGs in input_folder, sort them by name, and create a GIF that
    plays forward then backward (boomerang effect).

    Ensures all frames have the same shape by resizing to the first frame's size.
    """
    in_dir = Path(input_folder)
    png_files = sorted(in_dir.glob("*.png"))

    if not png_files:
        print(f"No .png files found in {in_dir}")
        return

    print(f"Found {len(png_files)} PNG files in {in_dir}")
    print(f"Creating boomerang GIF: {output_gif}")

    # Read all frames
    raw_frames = [imageio.imread(p) for p in png_files]

    # Use the first frame's size as the reference
    h0, w0 = raw_frames[0].shape[:2]
    frames = []

    for i, arr in enumerate(raw_frames):
        h, w = arr.shape[:2]
        if (h, w) != (h0, w0):
            # Resize this frame to match the first one
            img = Image.fromarray(arr)
            img = img.resize((w0, h0), Image.LANCZOS)
            arr = np.array(img)
            print(f"Resized frame {i} from {(w, h)} to {(w0, h0)}")

        frames.append(arr)

    # Build boomerang: forward + backward (without repeating endpoints)
    if len(frames) > 1:
        boomerang_frames = frames + frames[-2:0:-1]
    else:
        boomerang_frames = frames

    duration = 1.0 / fps  # seconds per frame
    imageio.mimsave(output_gif, boomerang_frames, duration=duration)
    print("GIF saved:", output_gif)


if __name__ == "__main__":
    # 1) Where your interpolated SVGs are
    input_folder = "wing_flap_frames"   # adjust if needed

    # 2) Where to put the PNGs
    png_output_folder = "wing_flap_png"

    # Convert SVG → PNG
    batch_svg_to_png(
        input_folder=input_folder,
        output_folder=png_output_folder,
        scale=2.0,      # tweak for resolution
    )

    # 3) Create boomerang GIF from PNGs
    gif_path = "wing_flap_boomerang.gif"
    pngs_to_boomerang_gif(
        input_folder=png_output_folder,
        output_gif=gif_path,
        fps=20,
    )
