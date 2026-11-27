varying vec2 vUv;
varying float vFogDepth;
varying vec3 vPetalColor;   // nahoru
uniform float uTime;          // čas v sekundách (posílá JS každý snímek)
uniform float uFlowerHeight;  // výška kytky (2), abychom věděli, kde je vršek
uniform vec3 uMouse;          // bod na kopci pod kurzorem
uniform float uMouseRadius;   // jak daleko od kurzoru kytky uhýbají
uniform float uMouseStrength; // 0 = myš mimo, 1 = myš na kopci (plynule)
uniform float uWindStrength;  // jak moc se kývá (v metrech)
uniform float uWindSpeed;     // jak rychle se kývá
uniform float uPushAmount;    // jak moc se ohnou pryč od myši
uniform float uShakeAmount;   // jak moc se u myši třesou

void main() {
  vUv = uv; // pošli UV dál do fragment shaderu
  vPetalColor = instanceColor; // někam do main()

  // Pozice vrcholu ve světě:
  // position       = vrchol v rámci jedné kytky
  // instanceMatrix = kde stojí TAHLE kytka (to, co jsi nastavil přes setMatrixAt)
  // modelMatrix    = kde stojí celý InstancedMesh
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);

    // ── Vítr ──

  // Kde stojí tahle kytka? Poslední sloupec instanceMatrix = posun (pozice).
  // Bereme pozici kytky, ne vrcholu – aby se celá kytka hýbala v jedné fázi.
  vec3 flowerOrigin = (modelMatrix * instanceMatrix[3]).xyz;

  // 0 u paty, 1 nahoře (position je vrchol v rámci jedné kytky, pata je y = 0)
  float bend = position.y / uFlowerHeight;
  bend = bend * bend; // ohyb jako prut

  // Dvě vlny s jinou rychlostí a směrem → pohyb není jen sem a tam
  float windTime = uTime * uWindSpeed;
  float windX = sin(windTime * 1.0 + flowerOrigin.x * 0.5);
  float windZ = sin(windTime * 0.7 + flowerOrigin.z * 0.4);

  worldPosition.x += windX * uWindStrength * bend;
  worldPosition.z += windZ * uWindStrength * bend;

    // ── Myš ──

  // Vektor od myši ke kytce, jen vodorovně (výšku ignorujeme)
  vec2 toFlower = flowerOrigin.xz - uMouse.xz;
  float dist = length(toFlower);

  // 1 přímo pod myší → 0 na okraji poloměru a dál
  float push = 1.0 - smoothstep(0.0, uMouseRadius, dist);

  // Směr "pryč od myši" (délky 1). max() chrání před dělením nulou
  vec2 pushDir = toFlower / max(dist, 0.0001);

    // Rychlé chvění: vysoká frekvence (uTime * 25) → třes, ne houpání.
  // Pozice kytky v sinu → každá se třese v jiné fázi, ne všechny naráz.
  float shake = sin(uTime * 25.0 + flowerOrigin.x * 3.0 + flowerOrigin.z * 2.0);

  worldPosition.xz += pushDir * push * bend * uMouseStrength * (uPushAmount + shake * uShakeAmount);

  // Ze světa do kamery a pak na obrazovku
  vec4 viewPosition = viewMatrix * worldPosition;
    // viewPosition je pozice vrcholu z pohledu kamery.
  // Kamera se dívá do mínus Z → čím dál, tím zápornější z.
  // Mínusem z toho uděláme kladnou vzdálenost.
  vFogDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}