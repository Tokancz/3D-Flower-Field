uniform vec3 uColor;
uniform float uOpacity;
uniform float uFade;      // intro: 0 → 1 (zvlášť od uOpacity, ať se nepere s GUI)
uniform float uFogNear;
uniform float uFogFar;

varying float vAlpha;
varying float vFogDepth;

void main() {
  // gl_PointCoord = pozice uvnitř čtverečku tečky (0–1). Střed je 0.5, 0.5.
  float d = length(gl_PointCoord - 0.5);

  // Měkké kolečko: střed plný, k okraji plynule do ztracena
  float circle = smoothstep(0.5, 0.0, d);

  // Mlha: vzdálený prach se rozplyne (místo míchání barvy jen ubereme průhlednost)
  float fog = 1.0 - smoothstep(uFogNear, uFogFar, vFogDepth);

  float alpha = circle * vAlpha * uOpacity * uFade * fog;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(uColor, alpha);
  #include <colorspace_fragment>
}
