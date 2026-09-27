"use client";

import * as React from "react";
import {
  WebGLErrorBoundary,
  WebGLFallback,
} from "@/components/ui/silk-aurora-utils/webgl-error-boundary";
import { markIntroReady } from "@/lib/intro/director";

const VERTEX_SHADER = `
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_speed;
uniform float u_intensity;
uniform float u_grain;
uniform float u_vignette;
uniform float u_mouseInfluence;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_sheen;
uniform vec3 u_accent;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.93, 289.17))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.82, 0.57, -0.57, 0.82);

  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }

  return value;
}

float ribbon(vec2 p, float offset, float width, float softness) {
  float y = p.y + sin(p.x * 1.8 + offset) * 0.18;
  y += sin(p.x * 4.2 - offset * 0.7) * 0.045;
  return smoothstep(width + softness, width, abs(y));
}

/**
 * A continuous pastel spectrum, cosine-based.
 *
 * The full-saturation cosine palette is far too strong to sit behind body text,
 * so it is pulled most of the way to white: what survives is the *hue rotation*,
 * which is the part that reads as light splitting through glass. Driving the
 * phase from the warped noise field rather than from screen position is what
 * keeps neighbouring hues adjacent — the ordering is what makes it look
 * refracted rather than like three coloured lights overlapping.
 */
vec3 spectralTint(float x, float saturation) {
  vec3 hue = 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(1.0), hue, saturation);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  vec2 mouse = (u_mouse - 0.5) * vec2(aspect, 1.0);
  float t = u_time * 0.12 * u_speed;
  float pointerFalloff = smoothstep(0.72, 0.0, length(p - mouse));
  p += (mouse - p) * pointerFalloff * 0.05 * u_mouseInfluence;

  vec2 silk = p;
  silk.x += fbm(p * 1.6 + vec2(t * 0.8, -t * 0.35)) * 0.16;
  silk.y += fbm(p * 2.2 + vec2(-t * 0.25, t * 0.7)) * 0.10;

  // Broader and softer than the dark treatment's ribbons. On a near-white ground
  // a tight band reads as a drawn stroke; only a wide, low-contrast wash reads as
  // light passing through something.
  float veilA = ribbon(silk + vec2(-0.18, 0.08), t * 2.1, 0.10, 0.42);
  float veilB = ribbon(silk * vec2(0.86, 1.18) + vec2(0.2, -0.14), -t * 2.8 + 1.7, 0.08, 0.36);
  float veilC = ribbon(silk * vec2(1.18, 0.9) + vec2(-0.08, 0.24), t * 1.4 - 2.1, 0.07, 0.30);

  float atmosphere = fbm(p * 1.35 + vec2(t * 0.22, -t * 0.1));

  // ── Paper ──
  //
  // A gentle vertical drift between two off-whites, warped by the same noise the
  // veils ride on, so the ground is never a flat fill.
  vec3 col = u_base;
  col = mix(col, u_mid, smoothstep(-0.55, 0.85, p.y + atmosphere * 0.7) * 0.85);

  // ── Refraction ──
  //
  // This is the one structural difference from the dark treatment, and it is not a
  // colour choice: that shader *added* light to a near-black ground, which is how
  // a glow works. Adding to a near-white ground has nowhere to go — every channel
  // clips at 1 and the veils vanish into the paper. Tinting *toward* a pale hue
  // subtracts instead, so the wash is visible as colour rather than as brightness,
  // which is also what refraction physically is.
  float phase = atmosphere * 0.55 + (p.x - p.y) * 0.30 + t * 0.20;
  float veil = clamp(veilA + veilB * 0.85 + veilC * 0.65, 0.0, 1.4);

  col = mix(col, spectralTint(phase, 0.30), veilA * 0.50 * u_intensity);
  col = mix(col, spectralTint(phase + 0.22, 0.26), veilB * 0.42 * u_intensity);
  col = mix(col, mix(u_sheen, u_accent, 0.4), veilC * 0.13 * u_intensity);

  // Where the veils pile up the paper goes luminous rather than saturated — the
  // blown highlight that keeps the whole field feeling lit from behind.
  col = mix(col, vec3(1.0), pow(clamp(veil - 0.55, 0.0, 1.0), 2.0) * 0.55 * u_intensity);

  // A cool cast in the corners. Kept as a tint rather than a multiply: darkening a
  // white ground at the edges reads as a photographic vignette, which is exactly
  // the heavy look this palette is moving away from.
  float vignette = smoothstep(1.30, 0.28, length(p));
  col = mix(col, u_mid * 0.94, (1.0 - vignette) * u_vignette * 0.30);

  // The pointer lifts the paper very slightly, no colour of its own.
  col = mix(col, vec3(1.0), pointerFalloff * 0.05 * u_mouseInfluence);

  // Half the amplitude of the dark treatment's, and biased to darken: grain on a
  // light ground is print texture, and lifting it just fogs the page.
  float grain = (hash(gl_FragCoord.xy + t * 90.0) - 0.62) * 0.035 * u_grain;
  col += grain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;

/**
 * Light palette, taken off the reference frames.
 *
 * `base` and `mid` are the two off-whites the ground drifts between — warm at the
 * bottom, a touch cooler and greyer toward the top, which is what stops a flat
 * fill. `sheen` and `accent` no longer *emit*; they are the pale tints the paper
 * is pulled toward, and they carry what remains of the purple identity through a
 * field that is otherwise a full pastel spectrum.
 */
const DEFAULT_BASE = "#F5F3F2";
const DEFAULT_MID = "#EBE9EE";
const DEFAULT_SHEEN = "#D8D2F2";
const DEFAULT_ACCENT = "#CFE0F2";

function sanitizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return fallback;
  }

  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function hexToRgb01(hex: string, fallback: string): [number, number, number] {
  const normalized = sanitizeHexColor(hex, fallback).replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  return [r, g, b];
}

export interface SilkAuroraBackgroundProps {
  baseColor?: string;
  midColor?: string;
  sheenColor?: string;
  accentColor?: string;
  speed?: number;
  intensity?: number;
  grain?: number;
  vignette?: number;
  mouseInfluence?: number;
  interactive?: boolean;
}

/**
 * SilkAuroraBackground — a fixed, full-viewport WebGL background layer.
 * Renders behind all page content via `position: fixed; z-index: 0`.
 * All other content should have `position: relative; z-index: >=1` to sit on top.
 */
export default function SilkAuroraBackground({
  baseColor = DEFAULT_BASE,
  midColor = DEFAULT_MID,
  sheenColor = DEFAULT_SHEEN,
  accentColor = DEFAULT_ACCENT,
  speed = 1,
  intensity = 1,
  grain = 0.85,
  vignette = 1,
  mouseInfluence = 1,
  interactive = true,
}: SilkAuroraBackgroundProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mouseRef = React.useRef({ x: 0.5, y: 0.5 });
  const targetMouseRef = React.useRef({ x: 0.5, y: 0.5 });
  const [hasWebGLError, setHasWebGLError] = React.useState(false);

  const settings = React.useMemo(
    () => ({
      baseColor,
      midColor,
      sheenColor,
      accentColor,
      speed,
      intensity,
      grain,
      vignette,
      mouseInfluence,
      interactive,
    }),
    [
      baseColor,
      midColor,
      sheenColor,
      accentColor,
      speed,
      intensity,
      grain,
      vignette,
      mouseInfluence,
      interactive,
    ],
  );

  /**
   * Release the intro's `aurora` readiness gate when this canvas has failed.
   *
   * There are five separate ways the setup below can bail — no context, either
   * shader failing to compile, the program failing to create or failing to
   * link — and all five land here. Keyed off the state rather than called at each
   * site so a sixth failure path added later cannot forget to do it.
   *
   * The director's ceiling would eventually lift the curtain regardless, but
   * holding a device that has no WebGL behind the curtain for the full six
   * seconds, waiting on a canvas that is never coming, is a poor trade — the
   * static fallback ground is already correct and already painted.
   */
  React.useEffect(() => {
    if (hasWebGLError) markIntroReady("aurora");
  }, [hasWebGLError]);

  React.useEffect(() => {
    if (hasWebGLError) {
      return;
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handlePointerMove = (event: PointerEvent) => {
      if (!settings.interactive) {
        return;
      }

      targetMouseRef.current = {
        x: event.clientX / window.innerWidth,
        y: 1 - event.clientY / window.innerHeight,
      };
    };

    const handlePointerLeave = () => {
      targetMouseRef.current = { x: 0.5, y: 0.5 };
    };

    // Listen on window for global mouse tracking since this is a fixed bg
    window.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerleave", handlePointerLeave);

    try {
      const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
      if (!gl) {
        setHasWebGLError(true);
        return () => {
          window.removeEventListener("pointermove", handlePointerMove);
          document.removeEventListener("pointerleave", handlePointerLeave);
        };
      }

      const compileShader = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) {
          return null;
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          return null;
        }

        return shader;
      };

      const vertexShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      if (!vertexShader || !fragmentShader) {
        setHasWebGLError(true);
        return;
      }

      const program = gl.createProgram();
      if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      gl.useProgram(program);

      const position = gl.getAttribLocation(program, "position");
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(program, "u_res");
      const uMouse = gl.getUniformLocation(program, "u_mouse");
      const uTime = gl.getUniformLocation(program, "u_time");
      const uSpeed = gl.getUniformLocation(program, "u_speed");
      const uIntensity = gl.getUniformLocation(program, "u_intensity");
      const uGrain = gl.getUniformLocation(program, "u_grain");
      const uVignette = gl.getUniformLocation(program, "u_vignette");
      const uMouseInfluence = gl.getUniformLocation(program, "u_mouseInfluence");
      const uBase = gl.getUniformLocation(program, "u_base");
      const uMid = gl.getUniformLocation(program, "u_mid");
      const uSheen = gl.getUniformLocation(program, "u_sheen");
      const uAccent = gl.getUniformLocation(program, "u_accent");

      if (
        !uRes ||
        !uMouse ||
        !uTime ||
        !uSpeed ||
        !uIntensity ||
        !uGrain ||
        !uVignette ||
        !uMouseInfluence ||
        !uBase ||
        !uMid ||
        !uSheen ||
        !uAccent
      ) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        setHasWebGLError(true);
        return;
      }

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = Math.max(1, Math.floor(width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
      };

      resize();
      window.addEventListener("resize", resize);

      const base = hexToRgb01(settings.baseColor, DEFAULT_BASE);
      const mid = hexToRgb01(settings.midColor, DEFAULT_MID);
      const sheen = hexToRgb01(settings.sheenColor, DEFAULT_SHEEN);
      const accent = hexToRgb01(settings.accentColor, DEFAULT_ACCENT);

      gl.uniform3f(uBase, base[0], base[1], base[2]);
      gl.uniform3f(uMid, mid[0], mid[1], mid[2]);
      gl.uniform3f(uSheen, sheen[0], sheen[1], sheen[2]);
      gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);

      let rafId = 0;
      let hasPainted = false;
      const start = performance.now();

      const render = (now: number) => {
        mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.045;
        mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.045;

        const elapsed = reducedMotion ? 8 : (now - start) / 1000;

        gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
        gl.uniform1f(uTime, elapsed);
        gl.uniform1f(uSpeed, reducedMotion ? 0 : settings.speed);
        gl.uniform1f(uIntensity, settings.intensity);
        gl.uniform1f(uGrain, settings.grain);
        gl.uniform1f(uVignette, settings.vignette);
        gl.uniform1f(
          uMouseInfluence,
          settings.interactive && !reducedMotion ? settings.mouseInfluence : 0,
        );
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // The intro's `aurora` readiness gate. This is an independent WebGL
        // context from the fluid pipeline's, with its own program to compile and
        // its own first paint, so the curtain has to wait for both — otherwise
        // whichever one is slower pops in behind the other after the reveal has
        // already started.
        if (!hasPainted) {
          hasPainted = true;
          markIntroReady("aurora");
        }

        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);

      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerleave", handlePointerLeave);
        window.removeEventListener("resize", resize);
        cancelAnimationFrame(rafId);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      };
    } catch {
      setHasWebGLError(true);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerleave", handlePointerLeave);
      };
    }
  }, [hasWebGLError, settings]);

  const fallbackContent = (
    <div
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
    >
      <WebGLFallback className="absolute inset-0 h-full w-full" />
    </div>
  );

  if (hasWebGLError) {
    return fallbackContent;
  }

  return (
    <WebGLErrorBoundary fallback={fallbackContent}>
      <div
        ref={containerRef}
        className="fixed inset-0 z-0"
        style={{ pointerEvents: "none" }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>
    </WebGLErrorBoundary>
  );
}
