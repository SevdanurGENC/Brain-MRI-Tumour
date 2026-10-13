"""
Beyin MR görüntüleri için ön işleme fonksiyonları.

Bu adımlar mobil uygulamadaki JavaScript koduyla (mobil/www/app.js) BİREBİR aynıdır;
böylece telefonda çalışan model, Python'da eğitildiği koşulları görür.

Adımlar:
 1) Gri tonlamaya çevir           (renkli piksel -> tek parlaklık değeri)
 2) Hafif bulanıklaştır            (gürültüyü azalt)
 3) Eşikle                         (kafa = parlak, arka plan = karanlık)
 4) En büyük bağlı bölgeyi bul     (kafatası/beyin bölgesi)
 5) Etrafından kırp ve 128x128'e küçült
"""
import numpy as np
from PIL import Image
from scipy import ndimage

BOYUT = 128      # modelin gördüğü görüntü boyutu
ESIK = 45        # 0-255 arası parlaklık eşiği
KENAR = 0.02     # görüntü çerçevelerini yok saymak için kenar payı (oran)


def gri_oku(yol):
    """Dosyayı okuyup 0-255 arası gri tonlu (float32) matrise çevirir."""
    rgb = np.asarray(Image.open(yol).convert("RGB"), dtype=np.float32)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def kutu_bulaniklastir(a):
    """3x3 ortalama filtresi (kenarlar tekrarlanarak)."""
    p = np.pad(a, 1, mode="edge")
    s = np.zeros_like(a)
    for di in range(3):
        for dj in range(3):
            s += p[di:di + a.shape[0], dj:dj + a.shape[1]]
    return s / 9.0


def beyin_maskesi(gri, esik=ESIK, kenar=KENAR):
    """Eşikleme + kenar temizliği + en büyük bağlı bölge -> ikili maske."""
    b = kutu_bulaniklastir(kutu_bulaniklastir(gri))
    m = b > esik
    H, W = m.shape
    ky, kx = int(H * kenar), int(W * kenar)
    m[:ky, :] = False; m[H - ky:, :] = False
    m[:, :kx] = False; m[:, W - kx:] = False
    etiket, n = ndimage.label(m)          # 4-komşuluk
    if n == 0:
        return np.ones_like(m)
    boyutlar = np.bincount(etiket.ravel())
    boyutlar[0] = 0
    return etiket == boyutlar.argmax()


def alan_boyutla(a, n=BOYUT):
    """Blok ortalaması ile yeniden boyutlandırma (JS ile aynı formül)."""
    H, W = a.shape
    i = np.arange(n)
    y0 = (i * H) // n; y1 = np.maximum(y0 + 1, ((i + 1) * H) // n)
    x0 = (i * W) // n; x1 = np.maximum(x0 + 1, ((i + 1) * W) // n)
    S = np.zeros((H + 1, W + 1), dtype=np.float64)       # integral görüntü
    S[1:, 1:] = a.astype(np.float64).cumsum(0).cumsum(1)
    toplam = (S[y1][:, x1] - S[y0][:, x1] - S[y1][:, x0] + S[y0][:, x0])
    adet = np.outer(y1 - y0, x1 - x0)
    return (toplam / adet).astype(np.float32)


def beyin_kirp(gri):
    """Maskenin sınır kutusundan kırpar; (kırpılmış görüntü, kutu) döndürür."""
    m = beyin_maskesi(gri)
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return gri[y0:y1, x0:x1], (y0, y1, x0, x1)


def on_isle(yol):
    """Dosya yolu -> modele girecek 128x128, 0-1 arası görüntü."""
    kirp, _ = beyin_kirp(gri_oku(yol))
    return alan_boyutla(kirp) / 255.0
