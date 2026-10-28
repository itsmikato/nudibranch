import os
import numpy as np
from svgpathtools import svg2paths
import torch
import torch.nn as nn
import torch.optim as optim


# --------------------------------------------------
# 1. Sample ALL paths in an SVG
#    (returns points and number of paths)
# --------------------------------------------------
def sample_all_paths(svg_file, n_points_per_path=200):
    """
    Loads all paths from an SVG and samples n_points_per_path along each.
    Returns:
        pts: (total_points, 2) array
        num_paths: number of paths in the SVG
    """
    paths, attrs = svg2paths(svg_file)

    if len(paths) == 0:
        raise ValueError(f"No paths found in SVG: {svg_file}")

    all_pts = []

    for path in paths:
        ts = np.linspace(0.0, 1.0, n_points_per_path)
        pts = [path.point(t) for t in ts]  # complex numbers

        xs = np.array([p.real for p in pts], dtype=np.float32)
        ys = np.array([p.imag for p in pts], dtype=np.float32)

        coords = np.stack([xs, ys], axis=1)  # (n_points_per_path, 2)
        all_pts.append(coords)

    pts = np.vstack(all_pts).astype(np.float32)  # (num_paths * n_points_per_path, 2)
    return pts, len(paths)


# --------------------------------------------------
# 2. Tiny NN that maps (x, y) -> (x', y') pointwise
# --------------------------------------------------
class PointDeformNet(nn.Module):
    def __init__(self, hidden_dim=64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(2, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 2)
        )

    def forward(self, x):
        # x: (N, 2)
        return self.net(x)


# --------------------------------------------------
# 3. Save predicted points as an SVG made of paths
# --------------------------------------------------
def save_points_as_svg(pts, out_file, n_paths, n_points_per_path):
    """
    pts: (N, 2) array of predicted points, ordered as:
         [path_0_points, path_1_points, ..., path_{n_paths-1}_points]
    n_paths: number of distinct paths
    n_points_per_path: samples per path (same as used for sampling)

    Writes an SVG with each path represented as a polyline-like <path>.
    """
    N = pts.shape[0]
    expected = n_paths * n_points_per_path
    if N != expected:
        raise ValueError(
            f"Point count mismatch: got {N}, expected {expected} "
            f"(n_paths={n_paths}, n_points_per_path={n_points_per_path})"
        )

    xs = pts[:, 0]
    ys = pts[:, 1]

    min_x, max_x = float(xs.min()), float(xs.max())
    min_y, max_y = float(ys.min()), float(ys.max())
    width = max_x - min_x if max_x > min_x else 1.0
    height = max_y - min_y if max_y > min_y else 1.0

    header = (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{min_x} {min_y} {width} {height}" '
        f'width="{width}" height="{height}">\n'
    )

    path_elems = []
    for i in range(n_paths):
        start = i * n_points_per_path
        end = (i + 1) * n_points_per_path
        path_pts = pts[start:end]  # (n_points_per_path, 2)

        # Build a path: "M x0 y0 L x1 y1 L x2 y2 ..."
        x0, y0 = path_pts[0]
        d_cmds = [f"M {x0} {y0}"]
        for (x, y) in path_pts[1:]:
            d_cmds.append(f"L {x} {y}")
        d_str = " ".join(d_cmds)

        path_elem = f'  <path d="{d_str}" stroke="black" stroke-width="1" fill="none" />\n'
        path_elems.append(path_elem)

    footer = "</svg>\n"

    with open(out_file, "w", encoding="utf-8") as f:
        f.write(header)
        for p in path_elems:
            f.write(p)
        f.write(footer)

    print(f"Saved SVG: {out_file}")


# --------------------------------------------------
# 4. Generate interpolated SVG frames into a folder
# --------------------------------------------------
def generate_flap_svgs(
    pts_src,
    pts_pred,
    n_paths,
    n_points_per_path,
    n_frames=24,
    folder="wing_flap_frames",
    basename="wing_flap"
):
    """
    Generate n_frames SVGs that linearly interpolate between
    the source pose and the NN-deformed pose.

    All SVGs are saved into `folder` with names like:
        folder/basename_00.svg, folder/basename_01.svg, ...
    """
    os.makedirs(folder, exist_ok=True)

    disp = pts_pred - pts_src  # (N, 2)

    for i in range(n_frames):
        t = i / (n_frames - 1)  # goes from 0 to 1
        pts_t = pts_src + t * disp

        filename = f"{basename}_{i:02d}.svg"
        out_path = os.path.join(folder, filename)

        save_points_as_svg(
            pts_t,
            out_path,
            n_paths=n_paths,
            n_points_per_path=n_points_per_path
        )
        print(f"Frame {i} (t={t:.2f}) -> {out_path}")


# --------------------------------------------------
# 5. Main: learn deformation wing_up -> wing_down, export SVGs
# --------------------------------------------------
def main():
    # ------------------------------------------------------------
    # Load and sample BOTH poses
    # ------------------------------------------------------------
    svg_src = "wing_up.svg"     # pose A
    svg_tgt = "wing_down.svg"   # pose B
    n_points_per_path = 500     # must be the same for both

    pts_src, n_paths_src = sample_all_paths(svg_src, n_points_per_path=n_points_per_path)
    pts_tgt, n_paths_tgt = sample_all_paths(svg_tgt, n_points_per_path=n_points_per_path)

    if pts_src.shape != pts_tgt.shape:
        raise ValueError(
            f"Source and target point clouds must match in shape, "
            f"got {pts_src.shape} vs {pts_tgt.shape}. "
            f"Check that both SVGs have the same path structure and sampling."
        )
    if n_paths_src != n_paths_tgt:
        raise ValueError(
            f"Number of paths mismatch: {n_paths_src} (src) vs {n_paths_tgt} (tgt)"
        )

    n_paths = n_paths_src  # common

    # ------------------------------------------------------------
    # Normalize both using shared statistics (for training only)
    # ------------------------------------------------------------
    all_pts = np.vstack([pts_src, pts_tgt])  # (2N, 2)
    pts_mean = all_pts.mean(axis=0, keepdims=True)
    pts_std = all_pts.std(axis=0, keepdims=True) + 1e-6

    pts_src_norm = (pts_src - pts_mean) / pts_std
    pts_tgt_norm = (pts_tgt - pts_mean) / pts_std

    # Turn into torch tensors
    X = torch.from_numpy(pts_src_norm.astype(np.float32))  # (N, 2)
    Y = torch.from_numpy(pts_tgt_norm.astype(np.float32))  # (N, 2)

    # ------------------------------------------------------------
    # Build and train the network
    # ------------------------------------------------------------
    model = PointDeformNet(hidden_dim=64)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()

    n_epochs = 3000
    for epoch in range(n_epochs):
        model.train()
        optimizer.zero_grad()
        pred = model(X)
        loss = criterion(pred, Y)
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 500 == 0:
            print(f"Epoch {epoch+1}/{n_epochs}, loss = {loss.item():.6f}")

    # ------------------------------------------------------------
    # Apply trained NN to the source points
    # ------------------------------------------------------------
    model.eval()
    with torch.no_grad():
        pred_norm = model(X).cpu().numpy()  # (N, 2)

    # Map back from normalized space to original coordinate space
    pts_pred = pred_norm * pts_std + pts_mean

    # ------------------------------------------------------------
    # Save NN output as single SVG (full down pose)
    # ------------------------------------------------------------
    save_points_as_svg(
        pts_pred,
        out_file="wing_nn_down.svg",
        n_paths=n_paths,
        n_points_per_path=n_points_per_path
    )

    # ------------------------------------------------------------
    # Generate interpolated SVG frames into a folder
    # ------------------------------------------------------------
    generate_flap_svgs(
        pts_src=pts_src,
        pts_pred=pts_pred,
        n_paths=n_paths,
        n_points_per_path=n_points_per_path,
        n_frames=24,                  # tweak for more/less frames
        folder="wing_flap_frames",    # folder inside your project
        basename="wing_flap"          # file name prefix
    )


if __name__ == "__main__":
    main()
