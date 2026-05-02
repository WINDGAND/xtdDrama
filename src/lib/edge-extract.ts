/**
 * edge-extract.ts — 客户端 Canvas Sobel 边缘提取
 *
 * 职责：
 *   接收图片 dataURL，通过 Canvas 2D 进行灰度化 + Sobel 滤波，
 *   输出半透明结构骨架 dataURL，用于在 workspace 中可视化展示
 *   "ControlNet-Lite 结构锁定"效果。
 *
 * 技术细节：
 *   - 纯浏览器 Canvas API，无外部依赖
 *   - Gx/Gy Sobel 算子 → 梯度强度 → 阈值化
 *   - 输出为带透明背景的 PNG，叠加在原图上不遮挡主体
 *   - 典型执行时间 < 50ms（1280px 图）
 */

export interface EdgeExtractOptions {
  /** 梯度阈值（0-255），越低线条越多，越高越少，默认 45 */
  threshold?: number;
  /** 骨架线条 RGB 颜色，默认蓝色系 [59, 130, 246] */
  lineColor?: [number, number, number];
  /** 骨架线条不透明度（0-1），默认 0.7 */
  lineOpacity?: number;
  /** 输出缩放比（0-1），默认 1.0 */
  scale?: number;
}

/**
 * 从图片 dataURL 提取 Sobel 边缘骨架，返回骨架图 dataURL。
 * 仅在浏览器环境有效（依赖 Canvas API）。
 */
export async function extractEdgeMap(
  imageDataUrl: string,
  options: EdgeExtractOptions = {}
): Promise<string> {
  const {
    threshold = 45,
    lineColor = [59, 130, 246],
    lineOpacity = 0.7,
    scale = 1.0,
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;
        const outW = Math.round(srcW * scale);
        const outH = Math.round(srcH * scale);

        // 1. 将原图画到 canvas 并读取像素
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = outW;
        srcCanvas.height = outH;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
        if (!srcCtx) { resolve(imageDataUrl); return; }
        srcCtx.drawImage(img, 0, 0, outW, outH);
        const srcData = srcCtx.getImageData(0, 0, outW, outH);
        const src = srcData.data;

        // 2. 灰度化
        const gray = new Uint8ClampedArray(outW * outH);
        for (let i = 0; i < outW * outH; i++) {
          const r = src[i * 4];
          const g = src[i * 4 + 1];
          const b = src[i * 4 + 2];
          gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }

        // 3. Sobel 滤波
        const edge = new Uint8ClampedArray(outW * outH);
        for (let y = 1; y < outH - 1; y++) {
          for (let x = 1; x < outW - 1; x++) {
            const idx = y * outW + x;
            // Gx
            const gx =
              -gray[(y - 1) * outW + (x - 1)] - 2 * gray[y * outW + (x - 1)] - gray[(y + 1) * outW + (x - 1)] +
               gray[(y - 1) * outW + (x + 1)] + 2 * gray[y * outW + (x + 1)] + gray[(y + 1) * outW + (x + 1)];
            // Gy
            const gy =
              -gray[(y - 1) * outW + (x - 1)] - 2 * gray[(y - 1) * outW + x] - gray[(y - 1) * outW + (x + 1)] +
               gray[(y + 1) * outW + (x - 1)] + 2 * gray[(y + 1) * outW + x] + gray[(y + 1) * outW + (x + 1)];
            edge[idx] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
          }
        }

        // 4. 阈值化 + 写入输出 canvas（透明背景 + 蓝色线条）
        const outCanvas = document.createElement("canvas");
        outCanvas.width = outW;
        outCanvas.height = outH;
        const outCtx = outCanvas.getContext("2d");
        if (!outCtx) { resolve(imageDataUrl); return; }
        const outData = outCtx.createImageData(outW, outH);
        const out = outData.data;

        const [lr, lg, lb] = lineColor;
        for (let i = 0; i < outW * outH; i++) {
          if (edge[i] > threshold) {
            out[i * 4]     = lr;
            out[i * 4 + 1] = lg;
            out[i * 4 + 2] = lb;
            out[i * 4 + 3] = Math.round(lineOpacity * 255);
          } else {
            out[i * 4 + 3] = 0; // 透明
          }
        }

        outCtx.putImageData(outData, 0, 0);
        resolve(outCanvas.toDataURL("image/png"));
      } catch {
        resolve(imageDataUrl); // 降级：原图
      }
    };
    img.onerror = () => resolve(imageDataUrl);
    img.src = imageDataUrl;
  });
}
