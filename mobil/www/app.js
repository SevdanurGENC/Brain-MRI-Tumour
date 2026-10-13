/* Beyin MR · YZ Asistanı — ön işleme (beyin_on_isleme.py ile birebir) + model + CAM */
(function () {
  "use strict";
  const BOYUT = 128, ESIK_PARLAK = 45, KENAR = 0.02;
  const M = window.TUMOR_MODEL, KARAR_ESIGI = (M.meta && M.meta.esik) || 0.5;
  const $ = (id) => document.getElementById(id);

  // ---------- Ön işleme (Python: beyin_on_isleme.py) ----------
  function griYap(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data, g = new Float32Array(c.width * c.height);
    for (let i = 0; i < g.length; i++) g[i] = d[4 * i] * 0.299 + d[4 * i + 1] * 0.587 + d[4 * i + 2] * 0.114;
    return { g: g, H: c.height, W: c.width };
  }

  function bulaniklastir(a, H, W) {
    const o = new Float32Array(H * W);
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
      let s = 0;
      for (let di = -1; di <= 1; di++) { const ii = Math.min(H - 1, Math.max(0, i + di));
        for (let dj = -1; dj <= 1; dj++) { const jj = Math.min(W - 1, Math.max(0, j + dj)); s += a[ii * W + jj]; } }
      o[i * W + j] = s / 9;
    }
    return o;
  }

  function beyinKutusu(g, H, W) {
    const b = bulaniklastir(bulaniklastir(g, H, W), H, W);
    const m = new Uint8Array(H * W), ky = Math.floor(H * KENAR), kx = Math.floor(W * KENAR);
    for (let i = ky; i < H - ky; i++) for (let j = kx; j < W - kx; j++) m[i * W + j] = b[i * W + j] > ESIK_PARLAK ? 1 : 0;
    // En büyük 4-komşuluklu bağlı bölge
    const etiket = new Int32Array(H * W), yigin = new Int32Array(H * W);
    let enIyi = null, enBuyuk = 0, no = 0;
    for (let s = 0; s < H * W; s++) {
      if (!m[s] || etiket[s]) continue;
      no++; let ust = 0, adet = 0, y0 = H, y1 = 0, x0 = W, x1 = 0;
      yigin[ust++] = s; etiket[s] = no;
      while (ust) {
        const p = yigin[--ust], i = (p / W) | 0, j = p - i * W; adet++;
        if (i < y0) y0 = i; if (i > y1) y1 = i; if (j < x0) x0 = j; if (j > x1) x1 = j;
        if (i > 0 && m[p - W] && !etiket[p - W]) { etiket[p - W] = no; yigin[ust++] = p - W; }
        if (i < H - 1 && m[p + W] && !etiket[p + W]) { etiket[p + W] = no; yigin[ust++] = p + W; }
        if (j > 0 && m[p - 1] && !etiket[p - 1]) { etiket[p - 1] = no; yigin[ust++] = p - 1; }
        if (j < W - 1 && m[p + 1] && !etiket[p + 1]) { etiket[p + 1] = no; yigin[ust++] = p + 1; }
      }
      if (adet > enBuyuk) { enBuyuk = adet; enIyi = [y0, y1 + 1, x0, x1 + 1]; }
    }
    return enIyi || [0, H, 0, W];
  }

  function alanBoyutla(g, W, kutu, n) {
    const [y0, y1, x0, x1] = kutu, h = y1 - y0, w = x1 - x0;
    const S = new Float64Array((h + 1) * (w + 1));
    for (let i = 0; i < h; i++) { let satir = 0; for (let j = 0; j < w; j++) { satir += g[(y0 + i) * W + x0 + j]; S[(i + 1) * (w + 1) + j + 1] = S[i * (w + 1) + j + 1] + satir; } }
    const o = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      const a0 = Math.floor(i * h / n), a1 = Math.max(a0 + 1, Math.floor((i + 1) * h / n));
      for (let j = 0; j < n; j++) {
        const b0 = Math.floor(j * w / n), b1 = Math.max(b0 + 1, Math.floor((j + 1) * w / n));
        const t = S[a1 * (w + 1) + b1] - S[a0 * (w + 1) + b1] - S[a1 * (w + 1) + b0] + S[a0 * (w + 1) + b0];
        o[i * n + j] = t / ((a1 - a0) * (b1 - b0)) / 255;
      }
    }
    return o;
  }

  function onIsle(img) {
    const { g, H, W } = griYap(img);
    return alanBoyutla(g, W, beyinKutusu(g, H, W), BOYUT);
  }

  // ---------- Çizim ----------
  function jet(v) {
    const r = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 3))), gg = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 2))), b = Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 1)));
    return [r * 255, gg * 255, b * 255];
  }

  function griCiz(cv, x) {
    const k = document.createElement("canvas"); k.width = k.height = BOYUT;
    const id = k.getContext("2d").createImageData(BOYUT, BOYUT);
    for (let i = 0; i < x.length; i++) { const v = x[i] * 255; id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v; id.data[4 * i + 3] = 255; }
    k.getContext("2d").putImageData(id, 0, 0);
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.drawImage(k, 0, 0, cv.width, cv.height);
  }

  function camCiz(cv, x, cam, goster) {
    griCiz(cv, x);
    if (!goster || !cam) return;
    let mx = 0; for (const v of cam.data) mx = Math.max(mx, v);
    const k = document.createElement("canvas"); k.width = cam.w; k.height = cam.h;
    const id = k.getContext("2d").createImageData(cam.w, cam.h);
    for (let i = 0; i < cam.data.length; i++) {
      const v = mx > 0 ? Math.max(0, cam.data[i]) / mx : 0, [r, g, b] = jet(v);
      id.data[4 * i] = r; id.data[4 * i + 1] = g; id.data[4 * i + 2] = b; id.data[4 * i + 3] = 40 + 150 * v;
    }
    k.getContext("2d").putImageData(id, 0, 0);
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(k, 0, 0, cv.width, cv.height);
  }

  // ---------- Akış ----------
  let son = null;
  function analizEt(img, bilgi) {
    $("sonucKart").classList.remove("gizli"); $("yukleniyor").classList.remove("gizli"); $("sonucIc").classList.add("gizli");
    $("sonucKart").scrollIntoView({ behavior: "smooth" });
    setTimeout(function () {
      const t0 = performance.now();
      const x = onIsle(img);
      const t1 = performance.now();
      const r = YZMotor.predict(M, x, 0);
      const t2 = performance.now();
      const p = r.out[0], tumor = p >= KARAR_ESIGI;
      son = { x: x, cam: r.cam, tumor: tumor };
      $("sonucYazi").textContent = (tumor ? "Tümör lehine bulgu" : "Tümör saptanmadı") + "  ·  %" + Math.round(p * 100);
      $("sonucYazi").style.color = tumor ? "var(--kirmizi)" : "var(--yesil)";
      $("imlec").style.left = (p * 100) + "%";
      $("esikCizgi").style.left = (KARAR_ESIGI * 100) + "%";
      $("esikYazi").textContent = "eşik %" + Math.round(KARAR_ESIGI * 100);
      $("durum").innerHTML = '<span class="etiket">Ön işleme ' + Math.round(t1 - t0) + ' ms</span><span class="etiket">Model ' + Math.round(t2 - t1) +
        ' ms</span><span class="etiket">İnternet: kullanılmadı</span>';
      $("ornekBilgi").textContent = bilgi || "";
      $("camYazi").textContent = tumor ? "Modelin dikkat haritası (CAM)" : "Isı haritası yalnızca 'tümör' kararında anlamlıdır";
      camCiz($("cvGirdi"), x, null, false);
      camCiz($("cvCam"), x, r.cam, $("camAc").checked && tumor);
      $("yukleniyor").classList.add("gizli"); $("sonucIc").classList.remove("gizli");
    }, 30);
  }

  $("camAc").addEventListener("change", function () { if (son) camCiz($("cvCam"), son.x, son.cam, this.checked && son.tumor); });
  $("secBtn").addEventListener("click", function () { $("dosya").click(); });
  $("dosya").addEventListener("change", function () {
    const f = this.files && this.files[0]; if (!f) return;
    const okuyucu = new FileReader();
    okuyucu.onload = function () { const img = new Image(); img.onload = function () { secimTemizle(); analizEt(img, "Seçilen dosya: " + f.name); }; img.src = okuyucu.result; };
    okuyucu.readAsDataURL(f);
    this.value = "";
  });

  function secimTemizle() { document.querySelectorAll(".ornekler img").forEach(function (e) { e.classList.remove("sec"); }); }
  (window.ORNEKLER || []).forEach(function (o) {
    const im = document.createElement("img"); im.src = o.src; im.alt = o.etiket;
    im.addEventListener("click", function () { secimTemizle(); im.classList.add("sec"); analizEt(im, "Örnek: " + o.ad + " — gerçek etiket: " + o.etiket); });
    $("ornekler").appendChild(im);
  });

  // Test kancası (otomatik doğrulama için)
  window.__test = { onIsle: onIsle, analizEt: analizEt };
})();
