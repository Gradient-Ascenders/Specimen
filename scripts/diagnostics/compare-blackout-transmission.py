"""Compare native before/after PNGs; differences include live simulation/effect noise."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageDraw

root = Path(sys.argv[1])
results = {}
for profile in ("medium", "high"):
    before_dir, after_dir = root / ("before-" + profile), root / ("after-" + profile)
    before = json.loads((before_dir / "results.json").read_text())
    after = json.loads((after_dir / "results.json").read_text())
    rows, previews = [], []
    for b, a in zip(before["frames"], after["frames"], strict=True):
        assert b["name"] == a["name"]
        paths = [directory / (a["name"] + ".png") for directory in (before_dir, after_dir)]
        images = [Image.open(path).convert("RGB") for path in paths]
        diff = ImageChops.difference(*images)
        red, green, blue = diff.split()
        maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        camera_delta = max(abs(x - y) for key in ("position", "quaternion", "projection")
                           for x, y in zip(b["camera"][key], a["camera"][key]))
        fingerprints = lambda f: {json.dumps(p, sort_keys=True) for p in f["programs"]}
        bp, ap = fingerprints(b), fingerprints(a)
        rows.append({"name": a["name"], "size": list(images[0].size),
                     "sha256": [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths],
                     "meanAbsoluteChannelDelta": sum(ImageStat.Stat(diff).mean) / 3,
                     "fractionPixelsOver8": sum(maximum.histogram()[9:]) / (diff.width * diff.height),
                     "cameraMaxDelta": camera_delta, "layersEqual": b["camera"]["layers"] == a["camera"]["layers"],
                     "baselinePrograms": len(bp), "afterPrograms": len(ap),
                     "missingPrograms": len(bp - ap), "extraPrograms": len(ap - bp)})
        if a["name"] in ("research-gallery", "research-chase", "research-fusion", "research-arena",
                         "ending-balanced-beams", "ending-collapse", "ending-daylight"):
            previews.append((a["name"], images))
    sheet = Image.new("RGB", (960, len(previews) * 292), "#181818")
    draw = ImageDraw.Draw(sheet)
    for index, (name, images) in enumerate(previews):
        draw.text((8, index * 292 + 4), name + " | baseline (left), fixed (right)", fill="white")
        for column, im in enumerate(images):
            sheet.paste(im.resize((480, 270)), (column * 480, index * 292 + 22))
    sheet.save(root / (profile + "-comparison.png"))
    results[profile] = rows
    print(profile, "frames", len(rows), "max camera delta", max(r["cameraMaxDelta"] for r in rows),
          "missing programs", max(r["missingPrograms"] for r in rows))
(root / "visual-comparison.json").write_text(json.dumps(results, indent=2) + "\n")

if (root / "fixed-high-controlled" / "results.json").exists():
    baseline = json.loads((root / "main-high-controlled" / "results.json").read_text())
    fixed = json.loads((root / "fixed-high-controlled" / "results.json").read_text())
    controlled = []
    for b, a in zip(baseline["frames"], fixed["frames"], strict=True):
        name = a["name"]
        paths = [root / directory / (name + ".png") for directory in ("main-high-controlled", "fixed-high-controlled")]
        diff = ImageChops.difference(*[Image.open(path).convert("RGB") for path in paths])
        red, green, blue = diff.split()
        maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        controlled.append({"name": name, "baselineBoss": b["boss"], "fixedBoss": a["boss"],
                           "meanAbsoluteChannelDelta": sum(ImageStat.Stat(diff).mean) / 3,
                           "fractionPixelsOver8": sum(maximum.histogram()[9:]) / (diff.width * diff.height),
                           "sha256": [hashlib.sha256(path.read_bytes()).hexdigest() for path in paths]})
    (root / "controlled-high-comparison.json").write_text(json.dumps(controlled, indent=2) + "\n")
    print("controlled boss handoff:", next(row for row in controlled if row["name"] == "research-boss-handoff"))
