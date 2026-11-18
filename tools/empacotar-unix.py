"""Produce Linux and macOS packages from the tested Windows game payload."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from io import BytesIO
from pathlib import Path
import re
import shutil
import tarfile
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = {
    "Linux-x64": ("Jogar-Battalion", ("linux-x64",)),
    "macOS": ("Jogar-Battalion.command", ("darwin-arm64", "darwin-x64")),
}

HELP = """Battalion Nativo

{requirements}

1. Extraia o arquivo .tar.gz inteiro.
2. {launch}
3. Abra http://127.0.0.1:8770/ no navegador e mantenha o Terminal aberto.

Os convidados usam o mesmo link no navegador, seja no Windows, Linux ou Mac.
Para quatro pessoas, abra Multiplayer LAN em Dois Continentes e selecione quatro
jogadores humanos. Cada pessoa marca Pronto antes do início.

Para jogar pela Internet sem VPN, abra o convite Internet enviado pelo anfitrião.
Na mesma rede Wi-Fi ou cabeada, use o convite Mesma rede.
De redes diferentes, uma opção é o ZeroTier em uma rede privada compartilhada.
Configure um IPv4 privado, por exemplo 192.168.193.0/24, antes de abrir o jogo.
Envie o convite Mesma rede cujo IP é o do adaptador virtual do anfitrião.
Guia: https://docs.zerotier.com/start/
"""


def download_runtime(base, filename, checksums, temporary):
    path = temporary / filename
    with urlopen(base + filename, timeout=60) as response, path.open("wb") as out:
        shutil.copyfileobj(response, out)
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != checksums[filename]:
            raise ValueError(f"SHA-256 inválido para {filename}")
    return path


def add_file(package, name, stream, size, mode=0o644):
    entry = tarfile.TarInfo(name)
    entry.size = size
    entry.mode = mode
    package.addfile(entry, stream)


def build_package(target, launcher, runtimes, windows, temporary, version):
    root = f"Battalion-Nativo-{target}"
    draft = temporary / f"{root}.tar.gz"
    instructions = HELP.format(
        requirements=("Linux x64 (Intel/AMD), kernel 4.18+, glibc 2.28+ e libstdc++ 6.0.25+."
                      if target == "Linux-x64" else "macOS 13.5 ou posterior, Apple Silicon ou Intel."),
        launch=("Abra o terminal na pasta extraída e rode ./Jogar-Battalion."
                if target == "Linux-x64" else
                "Abra Jogar-Battalion.command ou rode ./Jogar-Battalion.command no Terminal."),
    ).encode("utf-8")
    script = (ROOT / "tools/Jogar-Battalion-Unix.sh").read_text(encoding="utf-8").encode("utf-8")
    with tarfile.open(draft, "w:gz", compresslevel=6) as package:
        add_file(package, f"{root}/{launcher}", BytesIO(script), len(script), 0o755)
        add_file(package, f"{root}/LEIA-ME.txt", BytesIO(instructions), len(instructions))
        for info in windows.infolist():
            if not (info.filename.startswith("nativo/") or
                    info.filename in {"camera.js", "lan.js", "launcher.css"}):
                continue
            with windows.open(info) as stream:
                add_file(package, f"{root}/{info.filename}", stream, info.file_size)
        for index, (platform, path) in enumerate(runtimes):
            directory = f"node-{version}-{platform}"
            with tarfile.open(path, "r:xz") as runtime:
                binary = runtime.getmember(f"{directory}/bin/node")
                with runtime.extractfile(binary) as stream:
                    add_file(package, f"{root}/runtime/{platform}/node", stream, binary.size, 0o755)
                if index == 0:
                    license_file = runtime.getmember(f"{directory}/LICENSE")
                    with runtime.extractfile(license_file) as stream:
                        add_file(package, f"{root}/LICENSE-Node.js.txt", stream, license_file.size)
    destination = ROOT / draft.name
    draft.replace(destination)
    print(destination, destination.stat().st_size, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--node-version", default="v24.22.1")
    parser.add_argument("--windows-exe", type=Path, default=ROOT / "Battalion-Nativo.exe")
    args = parser.parse_args()
    version = args.node_version
    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", version):
        parser.error("use uma versão oficial no formato v24.22.1")
    base = f"https://nodejs.org/dist/{version}/"
    with urlopen(base + "SHASUMS256.txt", timeout=60) as response:
        checksums = {name: digest for digest, name in map(str.split, response.read().decode().splitlines())}
    with TemporaryDirectory(prefix="battalion-unix-", dir=ROOT) as folder, ZipFile(args.windows_exe) as windows:
        temporary = Path(folder)
        platforms = [platform for _, group in PACKAGES.values() for platform in group]
        with ThreadPoolExecutor(max_workers=len(platforms)) as pool:
            pending = {platform: pool.submit(download_runtime,base,f"node-{version}-{platform}.tar.xz",checksums,temporary)
                       for platform in platforms}
            for target, (launcher, group) in PACKAGES.items():
                build_package(target,launcher,[(platform,pending[platform].result()) for platform in group],
                              windows,temporary,version)


if __name__ == "__main__":
    main()
