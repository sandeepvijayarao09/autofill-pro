// Run once: node generate-icons.js
const { createCanvas } = require("canvas");
const fs = require("fs");

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#6366f1");
  grad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, size, size, size * 0.22);
  ctx.fill();

  // Pen icon
  ctx.strokeStyle = "white";
  ctx.lineWidth = size * 0.085;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const s = size / 24;
  ctx.beginPath();
  ctx.moveTo(16.5 * s, 3.5 * s);
  ctx.lineTo(19.5 * s, 6.5 * s);
  ctx.lineTo(7 * s, 19 * s);
  ctx.lineTo(3 * s, 20 * s);
  ctx.lineTo(4 * s, 16 * s);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(12 * s, 20 * s);
  ctx.lineTo(21 * s, 20 * s);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

fs.writeFileSync("icons/icon16.png", makeIcon(16));
fs.writeFileSync("icons/icon48.png", makeIcon(48));
fs.writeFileSync("icons/icon128.png", makeIcon(128));
console.log("Icons generated.");
