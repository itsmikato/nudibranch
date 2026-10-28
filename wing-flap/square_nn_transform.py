import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt

# -----------------------
# 1. Define a square in 2D
# -----------------------
# Let's use the 4 corners of a unit square
# (you can add more points if you like)
square = torch.tensor([
    [0.0, 0.0],
    [1.0, 0.0],
    [1.0, 1.0],
    [0.0, 1.0],
])

# ----------------------------------------
# 2. Define a target geometric transform
#    (rotation + scaling)
# ----------------------------------------
angle = torch.tensor(45.0 * 3.14159265 / 180.0)  # 45 degrees in radians
scale = 1.2

R = torch.tensor([
    [torch.cos(angle), -torch.sin(angle)],
    [torch.sin(angle),  torch.cos(angle)]
])

# Target transformation: rotate and scale
target_square = scale * (square @ R.T)  # shape (4, 2)

# ----------------------------------------
# 3. Define a tiny neural network f(x) -> y
# ----------------------------------------
# This network takes 2D input and outputs 2D transformed coordinates.
# You can think of it as "neural geometry transformer".
class GeoNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(2, 16),
            nn.Tanh(),
            nn.Linear(16, 2)
        )

    def forward(self, x):
        return self.net(x)

model = GeoNet()

# ----------------------------------------
# 4. Train the NN to learn the transformation
# ----------------------------------------
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.01)

X = square.clone()         # input points
Y = target_square.clone()  # desired transformed points

for epoch in range(2000):
    optimizer.zero_grad()
    y_pred = model(X)
    loss = criterion(y_pred, Y)
    loss.backward()
    optimizer.step()

    if (epoch + 1) % 200 == 0:
        print(f"Epoch {epoch+1:4d}, loss = {loss.item():.6f}")

# ----------------------------------------
# 5. Use the trained NN to transform the square
# ----------------------------------------
with torch.no_grad():
    square_nn = model(square)  # NN's version of the transformed square

# ----------------------------------------
# 6. Plot original, target, and NN output
# ----------------------------------------
plt.figure(figsize=(6, 6))

# Original square (blue)
xs, ys = square[:, 0], square[:, 1]
plt.plot(
    list(xs.numpy()) + [xs[0].item()],
    list(ys.numpy()) + [ys[0].item()],
    marker="o",
    label="Original square"
)

# Target transformed square (green)
xt, yt = target_square[:, 0], target_square[:, 1]
plt.plot(
    list(xt.numpy()) + [xt[0].item()],
    list(yt.numpy()) + [yt[0].item()],
    marker="o",
    label="Target transform (rotate+scale)"
)

# NN-transformed square (red, dashed)
xn, yn = square_nn[:, 0], square_nn[:, 1]
plt.plot(
    list(xn.numpy()) + [xn[0].item()],
    list(yn.numpy()) + [yn[0].item()],
    marker="x",
    linestyle="--",
    label="NN output"
)

plt.axhline(0, linewidth=0.5)
plt.axvline(0, linewidth=0.5)
plt.gca().set_aspect("equal", "box")
plt.legend()
plt.title("Neural Network Learning a Geometric Transformation")
plt.show()
