varying vec2 vUv;
varying float vFogDepth;
varying vec3 vPetalColor;   // nahoru
uniform float uTime;          // čas v sekundách (posílá JS každý snímek)
uniform float uFlowerHeight;  // výška kytky (2), abychom věděli, kde je vršek
uniform float uGrow;          // intro: 0 = nic nevyrostlo, 1 = všechno vyrostlé
uniform float uGrowSpread;    // jak moc je růst rozložený od středu k okraji
uniform float uGrowRadius;    // poloměr kopce (pro přepočet vzdálenosti na 0–1)
uniform float uWindStrength;  // jak moc se kývá (v metrech)
uniform float uWindSpeed;     // jak rychle se kývá

// Stopa myši. TRAIL_SIZE doplní TypeScript přes `defines` (musí být konstanta kvůli cyklu)
uniform vec4 uTrail[TRAIL_SIZE];
uniform float uTrailTime[TRAIL_SIZE];
uniform float uMouseRadius;   // jak daleko od stopy kytky reagují
uniform float uWaveStrength;  // jak moc se ohnou (v metrech)
uniform float uWaveFreq;      // jak rychle kmitají
uniform float uWaveDamping;   // jak rychle se uklidní
uniform float uWaveDelay;     // zpoždění podle vzdálenosti (šíření vlny)
uniform float uWaveSpread;    // kolik do stran (0 = jen ve směru myši)

void main() {
  vUv = uv; // pošli UV dál do fragment shaderu
  vPetalColor = instanceColor; // někam do main()

  // Kde stojí tahle kytka? Poslední sloupec instanceMatrix = posun (pozice).
  // Bereme pozici kytky, ne vrcholu – aby se celá kytka hýbala v jedné fázi.
  vec3 flowerOrigin = (modelMatrix * instanceMatrix[3]).xyz;

  // "Náhodné" číslo 0–1 podle pozice kytky (hash) → každá kytka trochu jiná
  float flowerRandom = fract(sin(dot(flowerOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);

    // ── Intro: vyrůstání ──

  // uGrow jede 0 → 1 (animuje Anime.js). Každá kytka ale vyroste jindy:
  // vršek kopce první, okraj poslední → vlna růstu od středu ven.
  float distFromCenter = length(flowerOrigin.xz) / uGrowRadius + flowerRandom * 0.15;
  float grow = clamp(uGrow * (1.0 + uGrowSpread) - distFromCenter * uGrowSpread, 0.0, 1.0);
  // "Back out" easing: kytka trochu přeroste a pak se usadí → pružný, živý dojem
  float g1 = grow - 1.0;
  grow = 1.0 + 2.70158 * g1 * g1 * g1 + 1.70158 * g1 * g1;

  // Zmenšit kytku k její patě (pata je y = 0, takže roste ze země)
  vec3 grownPosition = position * grow;

  // Pozice vrcholu ve světě:
  // position       = vrchol v rámci jedné kytky
  // instanceMatrix = kde stojí TAHLE kytka (to, co jsi nastavil přes setMatrixAt)
  // modelMatrix    = kde stojí celý InstancedMesh
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(grownPosition, 1.0);

    // ── Vítr ──

  // 0 u paty, 1 nahoře (position je vrchol v rámci jedné kytky, pata je y = 0)
  float bend = position.y / uFlowerHeight;
  bend = bend * bend * grow; // ohyb jako prut (× grow: nevyrostlá kytka se nekývá)

  // Dvě vlny s jinou rychlostí a směrem → pohyb není jen sem a tam
  float windTime = uTime * uWindSpeed;
  float windX = sin(windTime * 1.0 + flowerOrigin.x * 0.5);
  float windZ = sin(windTime * 0.7 + flowerOrigin.z * 0.4);

  worldPosition.x += windX * uWindStrength * bend;
  worldPosition.z += windZ * uWindStrength * bend;

    // ── Myš ──

  // Myš za sebou nechává stopu: TRAIL_SIZE bodů, kudy projela.
  // Každý bod si pamatuje, KDY tam byla a KAM a JAK RYCHLE jela.
  // Kytka u stopy se ohne ve směru pohybu a pak dokmitá jako pružina.

  // Každá kytka kmitá trochu jinou frekvencí (flowerRandom spočítaný nahoře)
  float freq = uWaveFreq * (0.8 + 0.4 * flowerRandom);

  vec2 wave = vec2(0.0);

  for (int i = 0; i < TRAIL_SIZE; i++) {
    vec4 point = uTrail[i];            // xy = kde byla myš (svět xz), zw = směr × síla
    float age = uTime - uTrailTime[i]; // jak dávno tam byla (s)
    if (age > 4.0) continue;          // starý bod už nic nedělá → přeskočit (šetří výkon)

    vec2 toFlower = flowerOrigin.xz - point.xy;
    float dist = length(toFlower);
    float influence = 1.0 - smoothstep(0.0, uMouseRadius, dist);
    if (influence <= 0.0) continue;

    // Vzdálenější kytky reagují o kousek později → vlna se šíří do stran
    float t = max(age - dist * uWaveDelay, 0.0);

    // Tlumený kmit: sin = houpání tam a zpět, exp = postupně utichá.
    // sin(0) = 0 → kytka se ohýbá plynule, ne skokem.
    float spring = sin(t * freq) * exp(-t * uWaveDamping);

    // Směr: hlavně ve směru pohybu myši + trochu do stran (rozhrnutí jako v trávě)
    float speed = length(point.zw);
    vec2 outward = toFlower / max(dist, 0.0001);
    vec2 dir = point.zw + outward * speed * uWaveSpread;

    wave += dir * influence * spring;
  }

  // Víc bodů stopy u sebe by se sčítalo → omezit, ať se kytka "nezlomí"
  float waveLength = length(wave);
  if (waveLength > 1.0) wave /= waveLength;

  worldPosition.xz += wave * uWaveStrength * bend;

  // Ze světa do kamery a pak na obrazovku
  vec4 viewPosition = viewMatrix * worldPosition;
    // viewPosition je pozice vrcholu z pohledu kamery.
  // Kamera se dívá do mínus Z → čím dál, tím zápornější z.
  // Mínusem z toho uděláme kladnou vzdálenost.
  vFogDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}