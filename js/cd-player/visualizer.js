// SPDX-License-Identifier: AGPL-3.0-only
// SPDX-FileCopyrightText: 2025-2026 The 25-ji-code-de Team

/**
 * Audio Visualizer Module
 * Handles the circular audio visualization around the album cover
 */

import { state, elements } from './constants.js';
import { saveVisualizationPreference, loadVisualizationPreference } from './storage.js';

/**
 * Toggle visualization visibility
 */
export function toggleVisualization() {
  state.visualizationEnabled = !state.visualizationEnabled;
  
  if (elements.visualizerCanvas) {
    elements.visualizerCanvas.classList.toggle('hidden', !state.visualizationEnabled);
  }
  
  if (elements.toggleVisualizationBtn) {
    elements.toggleVisualizationBtn.classList.toggle('active', state.visualizationEnabled);
  }
  
  // Stop animation when disabled
  if (!state.visualizationEnabled && state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
    if (elements.canvasCtx && elements.visualizerCanvas) {
      elements.canvasCtx.clearRect(0, 0, elements.visualizerCanvas.width, elements.visualizerCanvas.height);
    }
  } else if (state.visualizationEnabled && state.isPlaying && state.analyser) {
    drawVisualizer();
  }
  
  saveVisualizationPreference();
}

/**
 * Initialize visualization state from saved preference
 */
export function initVisualizationState() {
  const enabled = loadVisualizationPreference();
  
  if (elements.visualizerCanvas) {
    elements.visualizerCanvas.classList.toggle('hidden', !enabled);
  }
  if (elements.toggleVisualizationBtn) {
    elements.toggleVisualizationBtn.classList.toggle('active', enabled);
  }
}

/**
 * Extract dominant colors from album cover
 * @returns {Array} Array of color objects with h, s, l properties
 */
export function extractColorsFromCover() {
  try {
    const img = elements.albumCover;
    if (!img || !img.complete) return [];

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    const size = 50;
    tempCanvas.width = size;
    tempCanvas.height = size;
    tempCtx.drawImage(img, 0, 0, size, size);

    const imageData = tempCtx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    const colorMap = {};
    const lowSatColors = [];
    let totalSaturation = 0;
    let sampleCount = 0;

    for (let i = 0; i < pixels.length; i += 40) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      if (a < 128) continue;
      if ((r < 15 && g < 15 && b < 15) || (r > 240 && g > 240 && b > 240)) continue;

      const hsl = AppHelpers.rgbToHsl(r, g, b);
      totalSaturation += hsl.s;
      sampleCount++;

      if (hsl.s >= 20) {
        const hueKey = Math.round(hsl.h / 30) * 30;

        if (!colorMap[hueKey]) {
          colorMap[hueKey] = { h: hsl.h, s: hsl.s, l: hsl.l, count: 0 };
        }
        colorMap[hueKey].count++;
        colorMap[hueKey].h = (colorMap[hueKey].h * colorMap[hueKey].count + hsl.h) / (colorMap[hueKey].count + 1);
        colorMap[hueKey].s = (colorMap[hueKey].s * colorMap[hueKey].count + hsl.s) / (colorMap[hueKey].count + 1);
        colorMap[hueKey].l = (colorMap[hueKey].l * colorMap[hueKey].count + hsl.l) / (colorMap[hueKey].count + 1);
      } else {
        lowSatColors.push({ h: hsl.h, s: hsl.s, l: hsl.l });
      }
    }

    const avgSaturation = sampleCount > 0 ? totalSaturation / sampleCount : 0;
    const isMonochrome = avgSaturation < 15;

    let colors;

    if (isMonochrome) {
      colors = [
        { h: 0, s: 0, l: 30 },
        { h: 0, s: 0, l: 45 },
        { h: 0, s: 0, l: 60 },
        { h: 0, s: 0, l: 75 }
      ];
    } else {
      const colorList = Object.values(colorMap).sort((a, b) => b.count - a.count);
      const dominantColor = colorList[0];
      
      if (!dominantColor) {
        return [];
      }
      
      const hueVariance = colorList.reduce((acc, c) => {
        const hueDiff = Math.abs(c.h - dominantColor.h);
        const wrappedDiff = Math.min(hueDiff, 360 - hueDiff);
        return acc + wrappedDiff * c.count;
      }, 0) / colorList.reduce((acc, c) => acc + c.count, 0);

      if (hueVariance < 30) {
        colors = [
          { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 35 },
          { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 50 },
          { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 65 },
          { h: dominantColor.h, s: Math.max(dominantColor.s, 60), l: 75 }
        ];
      } else {
        colors = colorList
          .slice(0, 8)
          .map(c => ({
            h: c.h,
            s: Math.max(c.s, 50),
            l: Math.min(Math.max(c.l, 40), 70)
          }));

        colors = sortColorsForGradient(colors);
      }
    }

    return colors;
  } catch (e) {
    console.warn('Failed to extract colors from cover:', e);
    return [];
  }
}

/**
 * Sort colors by hue for smooth gradient
 */
function sortColorsForGradient(colors) {
  if (colors.length <= 1) return colors;

  const sorted = [...colors].sort((a, b) => a.h - b.h);

  let maxGap = 0;
  let maxGapIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i].h;
    const next = sorted[(i + 1) % sorted.length].h;
    const gap = i === sorted.length - 1
      ? (360 - current + next)
      : (next - current);

    if (gap > maxGap) {
      maxGap = gap;
      maxGapIndex = i;
    }
  }

  if (maxGap > 60) {
    return [
      ...sorted.slice(maxGapIndex + 1),
      ...sorted.slice(0, maxGapIndex + 1)
    ];
  }

  return sorted;
}

/**
 * Initialize audio visualizer
 */
export function initAudioVisualizer() {
  if (!elements.visualizerCanvas || state.audioContext) return;

  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();

    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;

    elements.cdAudioPlayer.crossOrigin = "anonymous";
    state.source = state.audioContext.createMediaElementSource(elements.cdAudioPlayer);
    state.source.connect(state.analyser);
    state.analyser.connect(state.audioContext.destination);

    drawVisualizer();
  } catch (e) {
    console.warn('Web Audio API setup failed:', e);
  }
}

/**
 * Draw visualizer animation
 */
export function drawVisualizer() {
  if (!state.analyser || !elements.visualizerCanvas || !state.visualizationEnabled) return;

  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const width = elements.visualizerCanvas.width;
  const height = elements.visualizerCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const coverRadius = 125;
  const minBarHeight = 5;
  const maxBarHeight = 80;

  const draw = () => {
    if (!state.visualizationEnabled) {
      state.animationId = null;
      return;
    }
    
    state.animationId = requestAnimationFrame(draw);

    state.analyser.getByteFrequencyData(dataArray);
    elements.canvasCtx.clearRect(0, 0, width, height);

    const useExtractedColors = state.dominantColors.length > 0;
    const overlap = Math.max(2, Math.floor(bufferLength * 0.06));
    const overlapThreshold = bufferLength - overlap;
    const startValues = new Float32Array(overlap);
    const invBufferLength = 1 / bufferLength;

    for (let i = 0; i < bufferLength; i++) {
      const ratio = i * invBufferLength;
      let transformedValue = dataArray[i] / 255 * (0.5 + Math.pow(ratio, 1.5));

      if (transformedValue < 0.25) {
        transformedValue = 0;
      } else if (transformedValue < 0.65) {
        transformedValue = (transformedValue - 0.25) * 2.0;
      } else {
        transformedValue = 0.8 + (transformedValue - 0.65) * 0.6;
      }

      if (i < overlap) {
        startValues[i] = transformedValue;
      }

      if (i >= overlapThreshold) {
        const pos = i - overlapThreshold;
        const dvStart = startValues[pos];
        const tRaw = overlap > 1 ? pos / (overlap - 1) : 1;
        const t = tRaw * tRaw * (3 - 2 * tRaw);
        transformedValue = transformedValue * (1 - t) + dvStart * t * (0.7 + 0.3 * Math.random());
      }

      const barHeight = minBarHeight + transformedValue * (maxBarHeight - minBarHeight);
      const angle = (i / bufferLength) * 2 * Math.PI - Math.PI / 2;

      const x1 = centerX + Math.cos(angle) * coverRadius;
      const y1 = centerY + Math.sin(angle) * coverRadius;
      const x2 = centerX + Math.cos(angle) * (coverRadius + barHeight);
      const y2 = centerY + Math.sin(angle) * (coverRadius + barHeight);

      elements.canvasCtx.beginPath();
      elements.canvasCtx.moveTo(x1, y1);
      elements.canvasCtx.lineTo(x2, y2);
      elements.canvasCtx.lineWidth = 4;

      const gradient = elements.canvasCtx.createLinearGradient(x1, y1, x2, y2);

      if (useExtractedColors) {
        const rotationSpeed = 0.0005;
        const rotationOffset = (Date.now() * rotationSpeed) % state.dominantColors.length;
        const basePosition = (i / bufferLength) * state.dominantColors.length;
        const position = (basePosition + rotationOffset) % state.dominantColors.length;
        const colorIndex = Math.floor(position);
        const nextColorIndex = (colorIndex + 1) % state.dominantColors.length;
        const blend = position - colorIndex;

        const color1 = state.dominantColors[colorIndex];
        const color2 = state.dominantColors[nextColorIndex];

        const h = color1.h + (color2.h - color1.h) * blend;
        const s = color1.s + (color2.s - color1.s) * blend;
        const l = color1.l + (color2.l - color1.l) * blend;

        const intensity = dataArray[i] / 255;
        const lightness1 = Math.max(25, l - 15);
        const lightness2 = Math.min(75, l + 15 + 15 * intensity);

        gradient.addColorStop(0, `hsla(${h}, ${s}%, ${lightness1}%, 0.6)`);
        gradient.addColorStop(1, `hsla(${h}, ${s}%, ${lightness2}%, 0.95)`);
      } else {
        const hue = (i * 360 / bufferLength + Date.now() * 0.05) % 360;
        gradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.4)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.8)`);
      }

      elements.canvasCtx.strokeStyle = gradient;
      elements.canvasCtx.lineCap = 'round';
      elements.canvasCtx.stroke();
    }
  };

  draw();
}
