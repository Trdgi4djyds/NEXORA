#!/usr/bin/env python3
# NEXORA #067 : vraies photos de mise en situation pour le site vitrine.
#   python3 scripts/maquettes-vitrine.py        (après node scripts/ecrans-vitrine.mjs)
# Place les vraies captures de NEXORA (site/src/assets/ecrans/) dans l'écran de photos libres de droits
# (scripts/vitrine/maquettes/, Unsplash) : perspective calculée à partir des 4 coins de l'écran, éclairage de la
# photo conservé (écrans blancs : la capture est multipliée par la lumière d'origine, encoche et coins arrondis
# gardés ; écran noir : léger reflet). Écrit des WebP dans site/src/assets/maquettes/.
import os
from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS = os.path.join(ROOT, "scripts", "vitrine", "maquettes")
SHOTS = os.path.join(ROOT, "site", "src", "assets", "ecrans")
OUT = os.path.join(ROOT, "site", "src", "assets", "maquettes")

# Écran de chaque photo : coins haut-gauche, haut-droit, bas-droit, bas-gauche (pixels de la photo de 2000 px).
PORTABLE_COUVERCLE = [(453, 113), (1342, 84), (1398, 662), (512, 758)]
SCENES = {
    # Portable sur bureau en bois : écran noir, dalle en retrait du couvercle (bordures du MacBook).
    "portable-bois": {"photo": "portable-bois.jpg", "quad": PORTABLE_COUVERCLE, "inset": (0.043, 0.062, 0.043, 0.095), "mode": "sombre"},
    "tablette-soleil": {"photo": "tablette-soleil.jpg", "quad": [(699, 349), (1289, 343), (1281, 758), (711, 765)], "mode": "clair"},
    "tablette-soleil-tel": {"photo": "tablette-soleil.jpg", "quad": [(1367, 851), (1503, 849), (1553, 1137), (1398, 1146)], "mode": "clair"},
    "telephone-main": {"photo": "telephone-main.jpg", "quad": [(668, 182), (1380, 187), (1367, 1720), (656, 1722)], "mode": "clair"},
}


def solve(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def perspective(dst, src):
    """Coefficients PIL : point de la photo (dst) -> point de la capture (src)."""
    a, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return solve(a, b)


def inset_quad(q, l, t, r, bt):
    """Retrait relatif dans le quadrilatère (interpolation bilinéaire, suffisant pour de petites bordures)."""
    def at(u, v):
        tl, tr, br, bl = q
        top = (tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u)
        bot = (bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u)
        return (top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v)
    return [at(l, t), at(1 - r, t), at(1 - r, 1 - bt), at(l, 1 - bt)]


def cover(img, ratio):
    """Recadre la capture au rapport de l'écran (en gardant le haut et la gauche : logo et titre)."""
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        return img.crop((0, 0, nw, h))
    nh = int(w / ratio)
    return img.crop((0, 0, w, nh))


def compose(scene, shot_path, out_name, width=1600, photo=None):
    cfg = SCENES[scene]
    base = photo or Image.open(os.path.join(PHOTOS, cfg["photo"])).convert("RGB")
    quad = cfg["quad"]
    if "inset" in cfg:
        quad = inset_quad(quad, *cfg["inset"])
    # Rapport de l'écran d'après ses côtés (moyennes), pour recadrer la capture sans la déformer.
    wq = ((quad[1][0] - quad[0][0]) ** 2 + (quad[1][1] - quad[0][1]) ** 2) ** 0.5 / 2 + ((quad[2][0] - quad[3][0]) ** 2 + (quad[2][1] - quad[3][1]) ** 2) ** 0.5 / 2
    hq = ((quad[3][0] - quad[0][0]) ** 2 + (quad[3][1] - quad[0][1]) ** 2) ** 0.5 / 2 + ((quad[2][0] - quad[1][0]) ** 2 + (quad[2][1] - quad[1][1]) ** 2) ** 0.5 / 2
    shot = Image.open(shot_path).convert("RGB")
    if cfg["mode"] == "sombre":
        shot = shot.resize((1600, 1000), Image.LANCZOS)  # dalle 16:10 du portable
    else:
        shot = cover(shot, wq / hq)
    sw, sh = shot.size
    coeffs = perspective(quad, [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    # Rendu au double puis réduit : bords nets sans crénelage.
    k = 2
    big = (base.width * k, base.height * k)
    ck = perspective([(x * k, y * k) for x, y in quad], [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    warped = shot.transform(big, Image.PERSPECTIVE, ck, Image.BICUBIC).resize(base.size, Image.LANCZOS)
    mask = Image.new("L", shot.size, 255).transform(big, Image.PERSPECTIVE, ck, Image.BILINEAR).resize(base.size, Image.LANCZOS)
    if cfg["mode"] == "clair":
        # Éclairage d'origine : la capture est multipliée par la lumière de l'écran blanc photographié.
        lum = ImageOps.grayscale(base)
        stat = sorted(ImageChops.multiply(lum, mask).getdata())
        top = stat[int(len(stat) * 0.995)] or 255
        light = lum.point(lambda v: min(255, int(v * 255 / top * 1.04)))
        warped = ImageChops.multiply(warped, Image.merge("RGB", (light, light, light)))
        # Seulement là où l'écran est clair : encoche, bord et coins arrondis de la photo conservés.
        bright = lum.point(lambda v: 255 if v > top * 0.62 else 0).filter(ImageFilter.GaussianBlur(1.2))
        mask = ImageChops.multiply(mask, bright)
    out = Image.composite(warped, base, mask)
    if cfg["mode"] == "sombre":
        # Reflets de la vitre : un peu de la photo d'origine ajoutée en « écran ».
        glare = base.point(lambda v: int(v * 0.32))
        out = Image.composite(ImageChops.screen(out, glare), out, mask)
    return out


def save(img, name, width):
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=80, method=6)
    print(f"  {name}.webp ({os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024} Ko)")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for slug in ["accueil", "responsive", "browser", "dev", "apps", "studio", "design", "securite", "desktop"]:
        save(compose("portable-bois", os.path.join(SHOTS, slug + ".webp"), slug), f"portable-{slug}", 1600)
    tab = compose("tablette-soleil", os.path.join(SHOTS, "kora-bureau.webp"), "")
    tab = compose("tablette-soleil-tel", os.path.join(SHOTS, "kora-mobile.webp"), "", photo=tab)
    save(tab, "tablette-soleil", 1600)
    save(compose("telephone-main", os.path.join(SHOTS, "kora-mobile.webp"), ""), "telephone-main", 1200)
