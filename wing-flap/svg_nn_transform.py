import numpy as np
import matplotlib.pyplot as plt

from svgpathtools import svg2paths
import torch
import torch.nn as nn
import torch.optim as optim


# --------------------------------------------------
# 1. Sample ALL paths in the SVG
# --------------------------------------------------
def sample_all_paths(svg_file, n_points_per_path=20):
    """
    Loads all paths from an SVG and samples n_points_per_path along each.
    Returns a single array of shape (total_points, 2).
    """
    paths, attrs = svg2paths(svg_file)

    if len(paths) == 0:
        raise ValueError("No paths found in SVG.")

    all_pts = []

    for path in paths:
        ts = np.linspace(0.0, 1.0, n_points_per_path)
        pts = [path.point(t) for t in ts]  # complex numbers

        xs = np.array([p.real for p in pts], dtype=np.float32)
        ys = np.array([p.imag for p in pts], dtype=np.float32)

        coords = np.stack([xs, ys], axis=1)  # (n_points_per_path, 2)
        all_pts.append(coords)

    # Stack all sampled points into one big point cloud
    return np.vstack(all_pts)  # (num_paths * n_points_per_path, 2)


# --------------------------------------------------
# 2. A simple geometric transform (ground truth)
#    We'll make a little "swirl" around the origin
# --------------------------------------------------
def swirl_transform(points, strength=0.5):
    """
    points: (N, 2) array
    strength: swirl intensity
    Swirls points around the origin with angle proportional to radius.
    """
    x = points[:, 0]
    y = points[:, 1]
    r = np.sqrt(x**2 + y**2)
    theta = np.arctan2(y, x)

    # angle offset proportional to radius
    theta_new = theta + strength * r

    x_new = r * np.cos(theta_new)
    y_new = r * np.sin(theta_new)

    return np.stack([x_new, y_new], axis=1).astype(np.float32)


# --------------------------------------------------
# 3. Tiny NN that maps (x,y) -> (x',y') pointwise
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


def main():
    # ----------------------------------------------------------------
    # Load SVG and sample points from ALL paths
    # ----------------------------------------------------------------
    svg_file = "wing_up.svg"  # <-- put your SVG filename here
    n_points_per_path = 500

    pts = sample_all_paths(svg_file, n_points_per_path=n_points_per_path)  # (N, 2)

    # Optional: center and scale (helps training)
    pts_mean = pts.mean(axis=0, keepdims=True)
    pts_std = pts.std(axis=0, keepdims=True) + 1e-6
    pts_norm = (pts - pts_mean) / pts_std

    # Ground truth transformed points (using our swirl)
    target_pts_norm = swirl_transform(pts_norm, strength=0.7)

    # Turn into torch tensors
    X = torch.from_numpy(pts_norm)          # (N, 2)
    Y = torch.from_numpy(target_pts_norm)   # (N, 2)

    # ----------------------------------------------------------------
    # Build and train the network
    # ----------------------------------------------------------------
    model = PointDeformNet(hidden_dim=64)
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()

    n_epochs = 3000

    for epoch in range(n_epochs):
        optimizer.zero_grad()
        pred = model(X)
        loss = criterion(pred, Y)
        loss.backward()
        optimizer.step()

        if (epoch + 1) % 500 == 0:
            print(f"Epoch {epoch+1}/{n_epochs}, loss = {loss.item():.6f}")

    # ----------------------------------------------------------------
    # Apply trained NN to the original points
    # ----------------------------------------------------------------
    with torch.no_grad():
        pred_norm = model(X).numpy()  # (N, 2)

    # Map back from normalized space to original coordinate space
    pts_pred = pred_norm * pts_std + pts_mean
    pts_target = target_pts_norm * pts_std + pts_mean

    # ----------------------------------------------------------------
    # Plot: original vs target transform vs NN output
    # ----------------------------------------------------------------
    plt.figure(figsize=(6, 6))

    # Original points (scatter)
    plt.scatter(pts[:, 0], pts[:, 1], s=1, label="Original", alpha=0.7)

    # True transformed (swirl)
    plt.scatter(pts_target[:, 0], pts_target[:, 1], s=1, label="Target swirl", alpha=0.7)

    # NN output
    plt.scatter(pts_pred[:, 0], pts_pred[:, 1], s=1, label="NN output", marker="x", alpha=0.7)

    plt.gca().set_aspect("equal", "box")
    plt.legend()
    plt.title("NN learning a deformation of ALL SVG paths")
    plt.grid(True)
    plt.show()


if __name__ == "__main__":
    main()
