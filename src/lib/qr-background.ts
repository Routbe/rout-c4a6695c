/** Restricted CSS gradient grammar shared by persistence and exported QR backgrounds. */
export function gradientLayers(value: string): string[] {
  return value.match(/(?:linear|radial)-gradient\([^()]*\)/g) ?? [];
}

export function validQrGradient(value: string): boolean {
  if (value.length > 2000 || !/^[#%(),.\w\s-]+$/.test(value)) return false;
  const layers = gradientLayers(value);
  return layers.length > 0 && layers.length <= 8 &&
    value.replace(/(?:linear|radial)-gradient\([^()]*\)/g, "").replace(/[\s,]/g, "") === "" &&
    layers.every(layer => /#[a-f\d]{3,6}\b/i.test(layer));
}

/** Embed the background in SVG, rather than applying CSS outside the download. */
export function qrBackgroundSvg(color: string, gradient?: string | null, size = 512): string {
  const layers = gradient && validQrGradient(gradient) ? gradientLayers(gradient) : [];
  const definitions: string[] = [];
  const rectangles = [`<rect width="${size}" height="${size}" fill="${color === "transparent" ? "none" : color}"/>`];
  layers.reverse().forEach((layer, index) => {
    const radial = layer.startsWith("radial");
    const parts = layer.slice(layer.indexOf("(") + 1, -1).split(",").map(s => s.trim());
    const config = parts[0]?.startsWith("#") || parts[0]?.startsWith("transparent") ? "" : parts.shift() ?? "";
    const stops = parts.map((part, i) => {
      const match = /^(#[a-f\d]{3,6}|transparent)(?:\s+(\d+(?:\.\d+)?)%)?$/i.exec(part);
      if (!match) return "";
      // Transparent stops inherit the preceding color, as CSS gradients do.
      const previous = parts.slice(0, i).reverse().find(p => p.startsWith("#"))?.split(/\s/)[0] ?? "#ffffff";
      return `<stop offset="${match[2] ?? (i / Math.max(1, parts.length - 1)) * 100}%" stop-color="${match[1] === "transparent" ? previous : match[1]}" stop-opacity="${match[1] === "transparent" ? 0 : 1}"/>`;
    }).join("");
    const id = `qr-bg-${index}`;
    if (radial) {
      const position = /at\s+(\d+)%\s+(\d+)%/.exec(config);
      const x = Number(position?.[1] ?? 50) / 100 * size;
      const y = Number(position?.[2] ?? 50) / 100 * size;
      const rx = Math.max(x, size - x) * Math.SQRT2;
      const ry = Math.max(y, size - y) * Math.SQRT2;
      definitions.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${x} ${y}) scale(${rx} ${ry})">${stops}</radialGradient>`);
    } else {
      const angle = (Number(/(-?\d+(?:\.\d+)?)deg/.exec(config)?.[1] ?? 180) * Math.PI) / 180;
      const dx = Math.sin(angle), dy = -Math.cos(angle);
      const half = size * (Math.abs(dx) + Math.abs(dy)) / 2;
      definitions.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${size / 2 - dx * half}" y1="${size / 2 - dy * half}" x2="${size / 2 + dx * half}" y2="${size / 2 + dy * half}">${stops}</linearGradient>`);
    }
    rectangles.push(`<rect width="${size}" height="${size}" fill="url(#${id})"/>`);
  });
  return `<defs>${definitions.join("")}</defs>${rectangles.join("")}`;
}