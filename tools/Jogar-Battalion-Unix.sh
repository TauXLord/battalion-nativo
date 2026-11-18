#!/bin/sh
set -eu

folder=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
case "$(uname -s):$(uname -m)" in
    Linux:x86_64) platform=linux-x64 ;;
    Darwin:x86_64) platform=darwin-x64 ;;
    Darwin:arm64) platform=darwin-arm64 ;;
    *)
        printf '%s\n' 'Esta arquitetura não é compatível com o pacote do Battalion.' >&2
        exit 1
        ;;
esac

runtime="$folder/runtime/$platform/node"
if [ ! -x "$runtime" ]; then
    printf '%s\n' 'Use o pacote correspondente ao seu sistema e extraia todos os arquivos.' >&2
    exit 1
fi
unset NODE_OPTIONS
cd -- "$folder"
exec "$runtime" "$folder/nativo/servidor.js" --lan "$@"
