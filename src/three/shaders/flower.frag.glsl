// Textury poslané z TypeScriptu (přes uniforms)
uniform sampler2D uMap;       // barva
uniform sampler2D uAlphaMap;  // průhlednost (černobílá)
uniform vec3 uFogColor;   // barva mlhy (= pozadí)
uniform float uFogNear;   // kde mlha začíná
uniform float uFogFar;    // kde je mlha úplně hustá

varying float vFogDepth;  // vzdálenost od kamery (z vertex shaderu)
varying vec3 vPetalColor;

// UV souřadnice, které poslal vertex shader
varying vec2 vUv;

void main() {
  // 1) Přečti průhlednost tohohle pixelu.
  //    texture2D(textura, uv) vrátí vec4 (r, g, b, a).
  //    Alfa je černobílá → všechny kanály jsou stejné, stačí .g
  float alpha = texture2D(uAlphaMap, vUv).g;

  // 2) Průhledné pixely vůbec nekresli.
  //    Tohle je přesně to, co dělal alphaTest: 0.5
  if (alpha < 0.5) discard;

  // 3) Přečti barvu. Potřebujeme jen rgb (vec3)
  vec3 color = texture2D(uMap, vUv).rgb;

    // ── Modré lístky ──

  // Nejmenší ze tří kanálů: bílá → vysoko, žlutá/zelená → nízko
  float whiteness = min(color.r, min(color.g, color.b));

  // Převeď na čistou masku 0–1: pod 0.25 = není lístek, nad 0.6 = určitě lístek
  float petal = smoothstep(0., 0.6, whiteness);
  //gl_FragColor = vec4(vec3(petal), 1.0); return;

  // Obarvi: násobení zachová stíny a světla na lístku
  // (bílá × modrá = modrá, šedá × modrá = tmavší modrá)
  color = mix(color, color * vPetalColor, petal);
    // Mlha: 0 = žádná, 1 = úplně barva pozadí
  // smoothstep(a, b, x) → 0 když x < a, 1 když x > b, mezi tím plynulý přechod
  float fog = smoothstep(uFogNear, uFogFar, vFogDepth);

  // mix(a, b, t) → t=0 dá a, t=1 dá b, mezi tím směs
  color = mix(color, uFogColor, fog);

  // 4) Výsledná barva pixelu – vec4(r, g, b, alfa)
  gl_FragColor = vec4(color, 1.0);

  // 5) Převod barev pro monitor. Three.js sem vloží kus svého kódu.
  //    Bez toho by byly barvy moc tmavé.
  #include <colorspace_fragment>
}