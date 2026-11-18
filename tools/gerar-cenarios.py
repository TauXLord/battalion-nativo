from pathlib import Path
from math import hypot, sin
from collections import Counter, defaultdict
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "cenarios"
OUT.mkdir(exist_ok=True)
palette = {}
shore_patterns = defaultdict(Counter)
directions = ((0,-1),(1,0),(0,1),(-1,0))
wet = {"Sea","Shore","Reef","Rock Formation","Archipelago"}
for directory in (ROOT / "mods/campanha", ROOT / "mods/bootcamp"):
    for path in sorted(directory.glob("*.yimf")):
        document = ET.parse(path)
        entries = {}
        for entry in document.findall("palette/entry"):
            name, image = entry.findtext("name"), entry.findtext("imageCode")
            if name and image:
                palette.setdefault(name, image)
                entries[entry.get("reference")] = name, image
        cells = {(int(tile.get("c")),int(tile.get("r"))):entries[tile.find("layer").get("reference")]
                 for tile in document.findall("tile") if tile.find("layer").get("reference") in entries}
        for (x,y),(name,image) in cells.items():
            if name == "Shore":
                mask = tuple(cells.get((x+dx,y+dy),("Sea",))[0] not in wet for dx,dy in directions)
                shore_patterns[mask][image] += 1

palette["Sea"] = "+(sea_0_v1.png;sea_0_v1.png;sea_0_v1.png;sea_0_v1.png)"
palette["Road"] = "road_12_v1.png"
palette["Bridge"] = "bridge_5_v1.png"
palette["High Bridge"] = "high_bridge_4_v1.png"
palette["P1 Strike Commando"] = "@(1;commando.png)"
palette["P1 Leviathan Barge"] = "@(1;leviathan.png)"
roads = {"NESW":1,"EW":2,"SW":3,"NW":4,"ES":5,"NE":6,"ESW":7,"NSW":8,"NES":9,"NEW":10,
         "NS":11,"E":12,"S":13,"W":14,"N":15}

def islands(w, h):
    return [(5, 6), (w-6, h-7), (w//2, h//2), (7, h-8), (w-8, 7)]


def river_bed(x, y, w, h):
    channel = w//2 + round(2*sin(y/6))
    return (2 <= y < h-2 and channel-1 <= x <= channel or
            8 <= y <= 9 and 8 <= x <= w-9 or
            22 <= y <= 23 and 10 <= x <= w-11)


def river_crossing(x, y, w, h):
    if y in (6, 15, 27, 33):
        return any(river_bed(x+dx,y,w,h) for dx in (-1,0,1))
    if x in (12, w-13):
        return any(river_bed(x,y+dy,w,h) for dy in (-1,0,1))
    return False


def terrain(style, x, y, w, h):
    n = (x * 41 + y * 83 + x * y * 29) % 100
    mx, my = w / 2, h / 2
    if style == "continents":
        if x in range(15, 25) and y in (11, 26):
            return "High Bridge"
        if 16 <= x <= 23:
            return "Sea" if n < 88 else "Reef"
        if x in (15, 24):
            return "Shore"
        if y in (11, 26) or x in (7, w-8):
            return "Road"
        return "Plains" if n < 43 else "Forest" if n < 63 else "Hill" if n < 83 else "Mountain" if n < 93 else "Canyon"
    if style == "triple":
        if river_crossing(x,y,w,h):
            return "High Bridge"
        if river_bed(x,y,w,h):
            return "Sea"
        if any(river_bed(x+dx,y+dy,w,h) for dx,dy in directions):
            return "Shore"
        if y in (6, 15, 27, 33) or x in (6,w-7) or x in (12,w-13) and 5 <= y <= 29:
            return "Road"
        return "Plains" if n < 48 else "Forest" if n < 69 else "Hill" if n < 88 else "Mountain" if n < 95 else "Canyon"
    if style == "sea":
        d = min(hypot(x-a, y-b) for a,b in islands(w, h))
        if d == 0:
            return "Volcano"
        if d < 4:
            return "Mountain" if d < 2 and n < 33 else "Forest" if n < 25 else "Plains"
        if d < 5:
            return "Shore"
        if d < 7:
            return "Reef" if n < 32 else "Sea"
        return "Archipelago" if n < 3 else "Rock Formation" if n < 6 else "Reef" if n < 15 else "Sea"
    if style == "forest":
        pass_x = mx + 3 * sin(y / 5)
        if y in (7, 16, 17, h-8) or abs(x - pass_x) < 1.5:
            return "Plains"
        if hypot(x-11, y-20) < 4 or hypot(x-22, y-13) < 4:
            return "Volcano" if (x,y) in ((11,20),(22,13)) else "Wasteland"
        if abs(x - pass_x) < 3.5 or n < 11:
            return "Mountain"
        grove = sin(x / 2.9) * sin(y / 3.2)
        return "Forest" if grove > 0.23 else "Hill" if n < 28 else "Plains"
    if style == "river":
        river = mx + 3 * sin(y / 4)
        if abs(x - river) <= 2:
            return "High Bridge" if y in (6, h//2, h-7) else "Sea"
        if abs(x - river) <= 3:
            return "Road" if y in (6, h//2, h-7) else "Shore"
        if y in (6, h//2, h-7) or x in (5, w-6):
            return "Road"
        return "Forest" if n < 25 else "Hill" if n < 39 else "Plains"
    if style == "acid":
        if hypot((x-mx)*.77, y-my) < 7 and y not in (h//2-2, h//2+2):
            return "Wasteland"
        if abs(x-mx) < 5 and n < 28 and y not in (h//2-2,h//2+2):
            return "Volcano"
        if y in (h//2-2,h//2+2):
            return "Canyon"
        return "Canyon" if n < 24 else "Wasteland" if n < 36 else "Hill" if n < 58 else "Plains"
    if style == "delta":
        if 8 < y < h-8 and (abs(x - mx + 6 + 2*sin(y/3)) < 1.5 or abs(x-mx-6-2*sin(y/3)) < 1.5):
            return "High Bridge" if y in (10,h//2,h-11) else "Sea"
        if x == w//2 or y in (10,h//2,h-11):
            return "Road"
        return "Forest" if n < 24 else "Canyon" if n < 32 else "Hill" if n < 52 else "Plains"
    if x in (7,w-8,w//2) or y in (7,h-8,h//2):
        return "Road"
    if hypot(x-mx, y-my) < 6:
        return "Canyon" if n < 40 else "Plains"
    return "Mountain" if n < 11 else "Forest" if n < 37 else "Hill" if n < 58 else "Plains"

def make(slug, name, size, style, starts, deposits, factories):
    w,h = size
    ground = [[terrain(style,x,y,w,h) for x in range(w)] for y in range(h)]
    units = {}
    structures = {point: (0, "Factory") for point in factories}
    naval = {"Battlecruiser", "Corvette", "U-Boat", "Leviathan Barge"}
    for team,(x,y,dx,dy) in enumerate(starts,1):
        if style == "sea":
            fleet = [("Warmachine",0,1),("Warmachine",1,1),("Warmachine",-1,0),
                     ("Heavy Commando",2,0),("Strike Commando",0,-2),("Turret",2,2),
                     ("Battlecruiser",6,0),("Corvette",5,-2),("U-Boat",6,2),("Leviathan Barge",5,1)]
            c,r = x+3*dx,y-dy
            structures[c,r] = (team, "Sea Control")
            ground[r][c] = "Plains"
        elif style == "forest":
            fleet = [("Warmachine",0,0),("Warmachine",1,0),("Warmachine",0,1),
                     ("Spider Tank",2,0),("Spider Tank",0,2),("Heavy Commando",1,1),
                     ("Strike Commando",2,2),("Stealth Tank",1,2),("Jammer Truck",3,0),("Turret",4,2)]
        else:
            fleet = [("Warmachine",0,0),("Warmachine",1,0),("Warmachine",0,1),
                     ("Scorpion Tank",2,0),("Heavy Commando",0,2),("Mortar Truck",1,1),
                     ("Flak Tank",2,2),("Stealth Tank",1,2),("Strike Commando",3,0),("Turret",4,2)]
        for unit,ox,oy in fleet:
            c,r = x+ox*dx,y+oy*dy
            base = "Sea" if unit in naval else "Hill" if unit == "Turret" else "Plains"
            ground[r][c] = base
            units[c,r] = (team,unit)
        if style == "sea":
            for ox,oy in ((3,0),(3,1),(4,0),(4,1)):
                ground[y+oy*dy][x+ox*dx] = "Plains" if ox == 3 else "Shore"
    if style == "sea":
        deposits = [(x+ox,y+oy,rich) for x,y in islands(w,h)
                    for ox,oy,rich in ((-2,-2,0),(2,-2,1),(-2,2,1),(0,3,0)) if (x+ox,y+oy) not in units]
    for c,r,rich in deposits:
        if (c,r) in units or (c,r) in structures:
            raise ValueError((slug,c,r))
        ground[r][c] = "Enriched Ore Deposit" if rich else "Ore Deposit"
    for c,r in factories:
        if (c,r) in units:
            raise ValueError((slug,c,r))
        ground[r][c] = "Plains"
    root = ET.Element("map")
    for label,value in [("description",""),("name",name),("author","Battalion local"),("mode","Battalion Map Editor"),("rows",h),("cols",w),("layers",3)]:
        ET.SubElement(root,label).text = str(value)
    swatches = ET.SubElement(root,"palette")
    aliases = {}
    def add(label,image):
        key = label,image
        if key not in aliases:
            aliases[key] = str(len(aliases))
            entry = ET.SubElement(swatches,"entry",reference=aliases[key])
            ET.SubElement(entry,"name").text = label
            ET.SubElement(entry,"imageCode").text = image
        return aliases[key]
    for r,row in enumerate(ground):
        for c,label in enumerate(row):
            tile = ET.SubElement(root,"tile",c=str(c),r=str(r))
            def adjacent(dx,dy):
                return ground[r+dy][c+dx] if 0 <= r+dy < h and 0 <= c+dx < w else "Sea"
            image = palette[label]
            if label == "Road":
                neighbors = "".join(k for k,(dx,dy) in zip("NESW",directions) if adjacent(dx,dy) in ("Road","Bridge","High Bridge"))
                image = f"road_{roads.get(neighbors,2)}_v1.png"
            if label == "High Bridge" and style in ("triple", "continents"):
                if style == "triple" and r not in (6, 15, 27, 33):
                    image = "high_bridge_5_v1.png"
                else:
                    end = 1 if adjacent(-1,0) != "High Bridge" else 2 if adjacent(1,0) != "High Bridge" else 4
                    image = f"high_bridge_{end}_v1.png"
            if label == "Shore":
                edges = tuple(adjacent(dx,dy) not in wet for dx,dy in directions)
                pattern = min(shore_patterns,key=lambda other: sum(a != b for a,b in zip(edges,other)))
                image = shore_patterns[pattern].most_common(1)[0][0]
            ET.SubElement(tile,"layer",reference=add(label,image),depth="0")
            if (c,r) in structures:
                team,structure = structures[c,r]
                sprite = {"Factory":"factory", "Sea Control":"seacontrol"}[structure]
                owner = f"P{team}" if team else "Neutral"
                ET.SubElement(tile,"layer",reference=add(f"{owner} {structure}",f"@({team};{sprite}.png)"),depth="1")
            if (c,r) in units:
                team,unit = units[c,r]
                source = palette.get("P1 "+unit) or palette["P2 "+unit]
                image = source.split(";",1)[1]
                ET.SubElement(tile,"layer",reference=add(f"P{team} {unit}",f"@({team};{image}"),depth="2")
    ET.SubElement(root,"script")
    ET.indent(root)
    ET.ElementTree(root).write(OUT/(slug+".yimf"),encoding="utf-8",xml_declaration=True)

make("arquipelago","Arquipélago de Coral",(36,34),"sea",[(5,6,1,1),(30,27,-1,-1)],[],
     [(18,15),(7,23),(28,4)])
make("floresta","Cordilheira das Aranhas",(34,34),"forest",[(4,7,1,1),(29,26,-1,-1)],
     [(7,8,0),(26,25,0),(10,15,0),(23,18,0),(16,12,1),(17,21,1),(17,7,1),(16,26,1)],
     [(12,18),(21,15),(17,17)])
make("rios","Três Travessias",(36,32),"river",[(4,14,1,1),(31,17,-1,-1)],
     [(7,12,0),(28,19,0),(12,6,0),(24,25,0),(14,16,1),(22,16,1),(24,6,1),(12,25,1)],
     [(15,6),(22,25),(20,16)])
make("acido","Caldeira Ácida",(34,34),"acid",[(4,14,1,1),(29,19,-1,-1)],
     [(7,13,0),(26,20,0),(10,8,0),(23,25,0),(15,15,1),(18,19,1),(18,9,1),(15,24,1)],
     [(13,15),(21,19),(17,17)])
make("delta","Delta dos Comboios",(36,36),"delta",[(4,15,1,1),(31,20,-1,-1)],
     [(7,13,0),(28,22,0),(11,10,0),(24,25,0),(16,18,1),(20,18,1),(19,10,1),(17,25,1)],
     [(13,10),(23,25),(18,18)])
make("arena","Cerco dos Quatro Cantos",(40,40),"arena",[(4,4,1,1),(35,35,-1,-1),(35,4,-1,1),(4,35,1,-1)],
     [(7,7,0),(32,32,0),(32,7,0),(7,32,0),(12,12,1),(27,27,1),(27,12,1),(12,27,1),(19,18,1),(20,21,1)],
     [(13,17),(26,17),(13,22),(26,22)])

make("tres-rios","Bacia dos Três Rios",(40,38),"triple",[(5,13,1,1),(34,13,-1,1),(18,34,-1,-1)],
     [(7,12,0),(32,12,0),(15,32,0),(11,17,1),(28,17,1),(22,30,1),(17,6,1),(25,25,0)],
     [(11,12),(28,12),(14,28),(25,19),(16,19)])

make("continentes","Dois Continentes",(40,38),"continents",[(5,6,1,1),(5,31,1,-1),(34,6,-1,1),(34,31,-1,-1)],
     [(8,5,0),(8,32,0),(31,5,0),(31,32,0),(13,10,1),(13,27,1),(26,10,1),(26,27,1),
      (10,19,0),(29,19,0),(13,22,0),(26,22,0)],
     [(12,12),(27,12),(12,25),(27,25),(9,18),(30,18)])
