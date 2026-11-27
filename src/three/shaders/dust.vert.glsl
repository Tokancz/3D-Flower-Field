uniform float uTime;
uniform float uSize;        // velikost tečky
uniform float uPixelRatio;  // Retina displej → 2× víc pixelů → tečky musí být 2× větší
uniform float uSpeed;       // rychlost vznášení
uniform float uBottom;      // spodní hranice oblasti (y)
uniform float uHeight;      // výška oblasti

attribute float aRandom;    // náhodné číslo 0–1 pro každou tečku → každá se hýbe jinak
attribute float aScale;     // náhodná velikost

varying float vAlpha;
varying float vFogDepth;

void main() {
  vec3 p = position;

  // ── Pomalé stoupání se smyčkou ──
  // mod(x, h) = zbytek po dělení → když tečka vyletí nahoru, objeví se zase dole
  float rise = uTime * uSpeed * (0.3 + aRandom * 0.7);
  float y = mod(position.y - uBottom + rise, uHeight);
  p.y = uBottom + y;

  // ── Pomalé kroužení do stran ── (každá tečka jiná fáze díky aRandom)
  float t = uTime * uSpeed;
  p.x += sin(t * 0.8 + aRandom * 6.28) * 0.6;
  p.z += cos(t * 0.6 + aRandom * 12.0) * 0.6;

  // ── Průhlednost ──
  // U spodního a horního okraje zeslábnout → "teleport" ze shora dolů není vidět
  float edgeFade = smoothstep(0.0, 1.5, y) * smoothstep(uHeight, uHeight - 1.5, y);
  // Třpyt: pomalé pulzování, každá tečka v jiném rytmu
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + aRandom * 1.5) + aRandom * 50.0);
  vAlpha = edgeFade * twinkle;

  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  vFogDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;

  // Velikost v pixelech: čím dál od kamery, tím menší (perspektiva)
  gl_PointSize = uSize * aScale * uPixelRatio / vFogDepth;
}
