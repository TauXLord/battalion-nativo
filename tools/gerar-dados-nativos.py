"""Export original Battalion maps, artwork, rules and campaign events."""

import csv
import json
import re
import shutil
import struct
import sys
import zlib
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
GHOSTS = "--ghosts" in sys.argv[1:]
MODS = ROOT / ("mods-ghosts" if GHOSTS else "mods")
XML = MODS / "dados"
SOURCE = ROOT / ("work/native-ghost-export" if GHOSTS else "work/native-export")
OUTPUT = ROOT / "nativo"
ASSETS = OUTPUT / "recursos"
ASSETS.mkdir(exist_ok=True, parents=True)


def swf_xml(ids):
    swf = (ROOT / "jogo/battalion-vengeance.swf").read_bytes()
    body = zlib.decompress(swf[8:]) if swf[:3] == b"CWS" else swf[8:]
    pos = (5 + 4 * (body[0] >> 3) + 7) // 8 + 4
    result = {}
    while pos < len(body) and len(result) < len(ids):
        tag, = struct.unpack_from("<H", body, pos)
        size = tag & 63
        pos += 2
        if size == 63:
            size, = struct.unpack_from("<I", body, pos)
            pos += 4
        if tag >> 6 == 87:
            char_id, = struct.unpack_from("<H", body, pos)
            if char_id in ids:
                result[char_id] = ET.fromstring(body[pos + 6:pos + size])
        pos += size
    return [result[key] for key in ids]


if GHOSTS:
    tilesheets = ET.parse(XML / "tileSheets_shared.xml").getroot()
    tilesheets.find("tilesheets").extend(ET.parse(XML / "singleplayer_tileSheets.xml").find("tilesheets"))
    ballistics = ET.parse(XML / "ballisticsTable.xml").getroot()
else:
    tilesheets, ballistics = swf_xml([3316, 3371])
stock = {item.get("name"): item for item in tilesheets.findall("stocktilesheets/tilesheet")}
animations = {item.get("name"): item for item in tilesheets.findall("stockanimations/animation")}
symbol_names = {}
with (SOURCE / "symbolClass/symbols.csv").open(encoding="utf-8-sig", newline="") as source:
    for row in csv.reader(source, delimiter=";"):
        if len(row) == 2 and row[0].isdigit():
            symbol_names.setdefault(int(row[0]), row[1])
assets = {}
sources = {}
common_assets = json.loads((OUTPUT / "dados.json").read_text(encoding="utf-8"))["assets"] if GHOSTS else {}
for directory in ("images", "fonts", "sounds"):
    for path in (SOURCE / directory).glob("*.*"):
        match = re.match(r"(\d+)", path.name)
        if match and int(match[1]) in symbol_names:
            sources[symbol_names[int(match[1])]] = path


def asset(name):
    if name not in assets:
        if name not in sources and name in common_assets:
            assets[name] = common_assets[name]
            return name
        source = sources[name]
        filename = ("ghosts-" if GHOSTS else "") + re.sub(r"[^A-Za-z0-9_.-]", "_", name) + source.suffix
        shutil.copyfile(source, ASSETS / filename)
        assets[name] = filename
    return name


def effect_list(element):
    return [effect.get("value") for effect in element.findall("effect") if effect.get("value")]


def effects(filename):
    root = ET.parse(XML / filename)
    return {
        entry.get("name"): [
            [modify.get("type"), effect_list(modify), [[match.get("type"), match.get("value"), effect_list(match)]
                                                       for match in modify.findall("match")]]
            for modify in entry.findall("modify")
        ]
        for entry in root.findall("modifier")
    }


rules = {
    "units": {}, "terrain": {},
    "unitEffects": effects("unitModifiers.xml"),
    "terrainEffects": effects("terrainModifiers.xml"),
    "ballistics": {entry.get("type"): {a.get("type"): float(a.get("value")) for a in entry.findall("defense")}
                   for entry in ballistics.findall("attack")},
}
sheet_entries = {entry.get("name"): entry for entry in tilesheets.find("tilesheets")}


def value(entry, key, default=""):
    return entry.find(key).get("value", default) if entry.find(key) is not None else default


def sprite(entry):
    layout = stock[entry.get("stockname")] if entry.get("stockname") else entry
    return {
        "image": asset(value(entry, "image")),
        "width": int(layout.get("width")), "height": int(layout.get("height")),
    }

def sequence(entry):
    return {"frames": [int(frame.get("frame")) for frame in entry.findall("frame")],
            "wait": int(entry.get("wait", "80"))}

def explosion(name):
    entry = sheet_entries[name]
    shape = sprite(entry)
    width, height = struct.unpack_from(">II", sources[shape["image"]].read_bytes(), 16)
    count = (width // shape["width"]) * (height // shape["height"])
    timing = sequence(entry.find("animation"))
    # Flash's large explosion XML lists four trailing frames outside the actual bitmap.
    timing["frames"] = [frame for frame in timing["frames"] if 0 <= frame < count]
    return {**shape, **timing}

def variants(prefix):
    return [f"{prefix}{number}" for number in (1, 2, 3)]


movement_sounds = {
    **{name: variants("TankMove") for name in ("Flak Tank", "Scorpion Tank", "Lancer Tank",
                                              "Annihilator Tank", "Stealth Tank")},
    **{name: variants("CommandoMove") for name in ("Heavy Commando", "Strike Commando")},
    **{name: ["ShipMove"] for name in ("Leviathan Barge", "Hunter Support", "Corvette Fighter", "Battlecruiser")},
    "Spider Tank": variants("SpiderTank"),
    "Warmachine": variants("MassiveTankMove"),
    "Raptor Fighter": ["AircraftMove"], "Albatross Transport": ["AlbatrossMove"], "Condor Bomber": ["BlimpMove"],
    "Intrepid": ["BoatMove"], "U-Boat": ["SubmarineMove"],
}


for entry in ET.parse(XML / "units.xml").findall("unit"):
    name = entry.get("name")
    profile = value(entry, "audio")
    movement = movement_sounds.get(profile, movement_sounds.get(name, ["VehicleMove"]))
    sounds = {"move": [asset(sound) for sound in movement]}
    audio_name = profile.replace(" ", "")
    if f"Fire{audio_name}" in sources:
        sounds["fire"] = asset(f"Fire{audio_name}")
    firing = sheet_entries.get(value(entry, "sprite") + " Firing")
    shot = None if firing is None else {
        **sprite(firing), "animations": {item.get("name"): sequence(item) for item in firing.findall("animation")},
    }
    rules["units"][name] = {
        **{key: value(entry, key) for key in ("description", "unitType", "movementType", "weaponType", "armorType")},
        **{key: int(value(entry, key) or "0") for key in ("cost", "range", "health", "damage", "weaponRangeMin", "weaponRangeMax")},
        "mods": [e.get("type") for e in entry.findall("modifier") if e.get("type")],
        "sprite": sprite(sheet_entries[value(entry, "sprite")]), "sounds": sounds, "firing": shot,
    }

for entry in ET.parse(XML / "terrain.xml").findall("terrain"):
    name = entry.get("name")
    rules["terrain"][name] = {
        "cost": float(value(entry, "cost", "1")), "description": value(entry, "description"),
        "mods": [e.get("type") for e in entry.findall("modifier") if e.get("type")],
        "sprite": asset(value(entry, "sprite")) if value(entry, "sprite") else None,
    }

# Native scenario rules. Keep the source terrain and its artwork intact.
forest = rules["terrain"]["Forest"]["mods"]
forest[forest.index("Rugged")] = "Forest Movement"
rules["terrainEffects"]["Forest Movement"] = [
    ["movementCost", [], [["unitType", "ground", ["+1"]]]],
]
rules["terrain"]["Canyon"]["mods"].append("Air Cover")


def decode_image(code):
    if code.startswith("+("):
        names = code[2:-1].split(";")
        return ["join", [asset(f"sea_0_{q}" if name == "sea_0_v1.png" else Path(name).stem)
                         for q, name in zip(("nw", "ne", "se", "sw"), names, strict=True)]]
    if code.startswith("?("):
        return ["random", [asset(Path(name).stem) for name in code[2:-1].split(";")]]
    return ["single", [asset(Path(code).stem)]]


def read_map(path):
    root = ET.parse(path).getroot()
    width, height = int(root.findtext("cols")), int(root.findtext("rows"))
    palette = {entry.get("reference"): (entry.findtext("name"), entry.findtext("imageCode"))
               for entry in root.findall("palette/entry")}
    tiles, structure_tiles, units = [None] * (width * height), [], []
    for tile in root.findall("tile"):
        cell = int(tile.get("r")) * width + int(tile.get("c"))
        for layer in tile.findall("layer"):
            name, code = palette[layer.get("reference")]
            depth = layer.get("depth")
            if depth == "0":
                tiles[cell] = [name, decode_image(code)]
            else:
                prefix, name = name.split(" ", 1)
                team = int(prefix[1:]) if prefix.startswith("P") else 0
                name = {"Corvette": "Corvette Fighter", "Hunter": "Hunter Support"}.get(name, name)
                if depth == "1":
                    structure_tiles.append({"cell": cell, "name": name, "side": team})
                elif depth == "2":
                    assert 1 <= team <= 4 and name in rules["units"], (path, team, name)
                    units.append({"cell": cell, "name": name, "side": team})
    assert all(tiles), path
    board = {"title": root.findtext("name"), "width": width, "height": height,
             "tiles": tiles, "structures": structure_tiles, "units": units}
    if root.get("style", "").lower() == "classic_mode":
        board["classic"] = True
    return board


def script_node(node):
    return {"type": node.attrib["type"], **{child.tag: child.attrib["value"] for child in node}}


def read_scenario(slug):
    board = read_map(ROOT / f"cenarios/{slug}.yimf")
    for structure in board["structures"]:
        if structure["name"] == "Factory":
            structure["name"] = "Oil Refinery"
    board["slots"] = max(unit["side"] for unit in board["units"])
    if slug == "continentes":
        board["coalitions"] = [1, 1, 2, 2]
    return board


map_ids = ["arquipelago", "floresta", "rios", "acido", "delta", "tres-rios", "continentes"]
maps = {} if GHOSTS else {slug: read_scenario(slug) for slug in map_ids}


def read_events(path):
    events = []
    for event in ET.parse(path).findall("script//event"):
        condition, = event.findall("condition")
        assert condition.attrib["type"] in {"startGame", "endGame", "killUnit"}, path
        events.append({"when": script_node(condition), "do": [script_node(r) for r in event.findall("response")]})
    return events


def read_mission(level, group):
    filename = Path(level.find("map").attrib["url"]).name.removeprefix("batut_")
    path = MODS / group / filename
    board = read_map(path)
    title = board["title"] = level.attrib["name"]
    settings = level.find("mapsettings")
    teams = [{key: value(node, key).lower() if key == "color" else value(node, key)
              for key in ("name", "color", "avatar", "allies")}
             for node in settings.findall("teams/team") if node.get("active") == "true"]
    return {"number": int(level.attrib["number"]) + 1, "title": title, "board": board,
            "brief": value(level, "brief"), "objective": value(level, "objective"),
            "teams": teams, "events": read_events(path), "credits": int(settings.attrib["resources"]),
            "medals": [int(settings.attrib[key]) for key in ("silverMedal", "goldMedal")]}


campaign = [read_mission(level, "campanha") for level in ET.parse(XML / "campaign.xml").findall("level")]
bootcamp = [read_mission(level, "bootcamp") for level in ET.parse(XML / "bootcamp.xml").findall("level")]
bonus_path = MODS / "campanha/Kongregate_Bonus_Map.yimf"
bonus_board = read_map(bonus_path)
bonus_board["title"] = "Kongregate Bonus Map"
bonus = {"number": 1, "title": bonus_board["title"], "board": bonus_board, "brief": "",
         "objective": "Destroy the enemy units.", "events": read_events(bonus_path),
         "teams": campaign[0]["teams"], "medals": [5000, 8500], "credits": 500}
arena = None if GHOSTS else read_scenario("arena")


for name in (
    "mainframe", "avatars", "recon_none", "recon_terrain", "recon_unit", "nameplate",
    "reconHealth_black", "reconHealth_green", "reconHealth_overlay", "wm_resources",
    "endturnbutton", "undo_move_button", "nextUnitButton", "optionsButton",
    "unitExtract", "unitRepair", "unitCancel", "unitBuild", "unitLeviathan", "unitAlbatross", "select", "selectRed", "marker", "marker2",
    "selectOrange", "selectMixed", "coverIcon", "attackTargets", "repairIcon",
    "build_background", "build_portrait_frame", "bg_ground", "bg_air", "bg_sea", "build_button_cancel",
    "build_unitFrame_underlay", "build_unitFrame_overlay", "build_unitFrame_unaffordable", "build_unitFrame_unavailable",
    "wm_build_up", "wm_build_down", "wm_build_side", "wm_build_cancel",
    "movement_start", "movement_straight", "movement_turn", "movement_end",
    "minimap_overlay", "ore_deposit_v1", "depleted_ore_deposit_v1", "border_top",
    "border_bottom", "border_left", "border_right",
    "StartTurn", "ExplosionSound", "Capture", "ExtractResources", "VehicleMove", "ConstructUnit",
    "UIWAV", "Jammed",
    "com.gamedozer.battalion.BattalionMain_BERNHC",
    "bg_bootcamp", "spotted_texture", "wood_texture", "frame1", "frame2",
    "medal", "continueButton", "banner_victory", "banner_defeat",
    "VictoryWAV", "DefeatWAV",
):
    asset(name)
asset("ep2_campaign_header" if GHOSTS else "ep3_campaign_header")

icons = sheet_entries["info_icons"]
icon_frames = {entry.attrib["name"].lower(): sequence(entry)["frames"][0] for entry in icons.findall("animation")}


def visible_modifiers(filename):
    return {entry.attrib["name"]: {"index": icon_frames[value(entry, "image").lower()],
                                  "description": value(entry, "description").strip()}
            for entry in ET.parse(XML / filename).findall("modifier")
            if value(entry, "visible") == "true" and value(entry, "image").lower() in icon_frames}


terrain_modifiers = visible_modifiers("terrainModifiers.xml")
unit_modifiers = visible_modifiers("unitModifiers.xml")
terrain_modifiers["Forest Movement"] = {
    "index": terrain_modifiers["Rugged"]["index"],
    "description": "Cada casa de floresta custa um ponto extra de movimento para unidades terrestres.",
}
terrain_modifiers["Air Cover"] = {
    "index": terrain_modifiers["Shielded"]["index"],
    "description": "Unidades terrestres na trincheira ficam protegidas de ataques aéreos.",
}

cursor = sheet_entries["cursor"]
data = {
    "rules": rules, "maps": maps, "arena": arena, "assets": assets,
    "music": [asset(loop + ("2" if GHOSTS else "3")) for loop in ("PlayerLoopWAV_", "AILoopWAV_")],
    "terrainInfo": {**sprite(icons), "modifiers": terrain_modifiers, "unitModifiers": unit_modifiers, "frames": icon_frames},
    "attackCursor": {**sprite(cursor), "frame": sequence(cursor.find("animation[@name='attack']"))["frames"][0]},
    "avatars": {item.attrib["name"]: sequence(item)["frames"][0]
                for item in sheet_entries["avatars"].findall("animation")},
    "explosions": {name: explosion(name)
                   for name in ("Explosion", "Small Explosion")},
    "movement": {name: sequence(animations[name]) for name in
                 ("right_idle", "left_idle", "up_idle", "down_idle", "left", "right", "up", "down", "spin")},
    "palettes": {
        "ffff0000": [4284881502,4289336876,4293473070,4294938757],
        "ff0000ff": [4282200447,4281032647,4282754273,4289318911],
        "ff00ff00": [4280179491,4284453727,4287618661,4294047327],
        "ffffd800": [4287001140,4292453449,4294107496,4294967200],
        "ffffa500": [4284430401,4291248436,4294948366,4294959429],
        "ff008080": [4284438167,4282749795,4288141550,4292673483],
        "fff5f5ff": [4285163405,4289970652,4293257471,4294309375],
        "ff5645a0": [4280757041,4283844000,4287857377,4291543807],
        "ff424144": [4280032551,4280822834,4282532164,4282862472],
        "building": [4282668609,4286604904,4289834363,4293845404],
    },
}
suffix = "-ghosts" if GHOSTS else ""
for name, payload in (("dados", data), ("campanha", campaign), ("bootcamp", bootcamp), ("bonus", [bonus])):
    (OUTPUT / f"{name}{suffix}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"{len(campaign)} capítulos, {len(bootcamp)} treinamentos, {len(rules['units'])} unidades, {len(assets)} recursos")
