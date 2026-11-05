from __future__ import annotations

import io
import struct
from pathlib import Path
from typing import Any

import numpy as np

GGUF_MAGIC = b"GGUF"
GGUF_VERSION = 3
ALIGNMENT_DEFAULT = 32

GGML_TYPE_F32 = 0

META_UINT32 = 4
META_FLOAT32 = 6
META_BOOL = 7
META_STRING = 8
META_ARRAY = 9
META_UINT64 = 10


def _write_string(buf: io.BufferedWriter | io.BytesIO, value: str) -> None:
    data = value.encode("utf-8")
    buf.write(struct.pack("<Q", len(data)))
    buf.write(data)


def _read_string(buf: io.BufferedReader | io.BytesIO) -> str:
    (length,) = struct.unpack("<Q", buf.read(8))
    return buf.read(length).decode("utf-8")


def _write_metadata_value(buf: io.BufferedWriter | io.BytesIO, value: Any) -> None:
    if isinstance(value, bool):
        buf.write(struct.pack("<I", META_BOOL))
        buf.write(struct.pack("<B", 1 if value else 0))
    elif isinstance(value, int):
        if value < 0:
            raise ValueError("negative metadata ints are not supported in this minimal writer")
        if value <= 0xFFFFFFFF:
            buf.write(struct.pack("<I", META_UINT32))
            buf.write(struct.pack("<I", value))
        else:
            buf.write(struct.pack("<I", META_UINT64))
            buf.write(struct.pack("<Q", value))
    elif isinstance(value, float):
        buf.write(struct.pack("<I", META_FLOAT32))
        buf.write(struct.pack("<f", value))
    elif isinstance(value, str):
        buf.write(struct.pack("<I", META_STRING))
        _write_string(buf, value)
    elif isinstance(value, (list, tuple)):
        buf.write(struct.pack("<I", META_ARRAY))
        if not value:
            subtype = META_STRING
        else:
            first = value[0]
            if isinstance(first, str):
                subtype = META_STRING
            elif isinstance(first, int):
                subtype = META_UINT32
            else:
                raise TypeError(f"unsupported metadata array subtype: {type(first)!r}")
        buf.write(struct.pack("<I", subtype))
        buf.write(struct.pack("<Q", len(value)))
        for item in value:
            if subtype == META_STRING:
                _write_string(buf, str(item))
            elif subtype == META_UINT32:
                buf.write(struct.pack("<I", int(item)))
    else:
        raise TypeError(f"unsupported metadata value type: {type(value)!r}")


def _read_metadata_value(buf: io.BufferedReader | io.BytesIO) -> Any:
    (value_type,) = struct.unpack("<I", buf.read(4))
    if value_type == META_BOOL:
        return struct.unpack("<B", buf.read(1))[0] != 0
    if value_type == META_UINT32:
        return struct.unpack("<I", buf.read(4))[0]
    if value_type == META_UINT64:
        return struct.unpack("<Q", buf.read(8))[0]
    if value_type == META_FLOAT32:
        return struct.unpack("<f", buf.read(4))[0]
    if value_type == META_STRING:
        return _read_string(buf)
    if value_type == META_ARRAY:
        (subtype,) = struct.unpack("<I", buf.read(4))
        (length,) = struct.unpack("<Q", buf.read(8))
        items: list[Any] = []
        for _ in range(length):
            if subtype == META_STRING:
                items.append(_read_string(buf))
            elif subtype == META_UINT32:
                items.append(struct.unpack("<I", buf.read(4))[0])
            else:
                raise ValueError(f"unsupported metadata array subtype {subtype}")
        return items
    raise ValueError(f"unsupported metadata value type {value_type}")


def _align(offset: int, alignment: int) -> int:
    return offset + ((alignment - (offset % alignment)) % alignment)


def write_gguf(path: str | Path, metadata: dict[str, Any], tensors: dict[str, np.ndarray]) -> None:
    path = Path(path)
    alignment = int(metadata.get("general.alignment", ALIGNMENT_DEFAULT))
    if alignment % 8 != 0:
        raise ValueError("GGUF alignment must be a multiple of 8")

    tensor_items: list[tuple[str, np.ndarray]] = []
    for name, arr in tensors.items():
        arr = np.asarray(arr, dtype=np.float32, order="C")
        tensor_items.append((name, arr))

    header_buf = io.BytesIO()
    header_buf.write(GGUF_MAGIC)
    header_buf.write(struct.pack("<I", GGUF_VERSION))
    header_buf.write(struct.pack("<Q", len(tensor_items)))
    header_buf.write(struct.pack("<Q", len(metadata)))
    for key, value in metadata.items():
        _write_string(header_buf, key)
        _write_metadata_value(header_buf, value)

    tensor_info_buf = io.BytesIO()
    current_offset = 0
    payload_parts: list[bytes] = []
    for name, arr in tensor_items:
        current_offset = _align(current_offset, alignment)
        _write_string(tensor_info_buf, name)
        tensor_info_buf.write(struct.pack("<I", arr.ndim))
        for dim in reversed(arr.shape):
            tensor_info_buf.write(struct.pack("<Q", dim))
        tensor_info_buf.write(struct.pack("<I", GGML_TYPE_F32))
        tensor_info_buf.write(struct.pack("<Q", current_offset))
        payload = arr.astype(np.float32, copy=False).tobytes(order="C")
        payload_parts.append((current_offset, payload))
        current_offset += len(payload)

    metadata_and_infos = header_buf.getvalue() + tensor_info_buf.getvalue()
    padding = _align(len(metadata_and_infos), alignment) - len(metadata_and_infos)

    with path.open("wb") as f:
        f.write(metadata_and_infos)
        f.write(b"\x00" * padding)
        cursor = 0
        for offset, payload in payload_parts:
            if cursor < offset:
                f.write(b"\x00" * (offset - cursor))
                cursor = offset
            f.write(payload)
            cursor += len(payload)


def read_gguf(path: str | Path) -> tuple[dict[str, Any], dict[str, np.ndarray]]:
    path = Path(path)
    with path.open("rb") as f:
        magic = f.read(4)
        if magic != GGUF_MAGIC:
            raise ValueError("not a GGUF file")
        (version,) = struct.unpack("<I", f.read(4))
        if version != GGUF_VERSION:
            raise ValueError(f"unsupported GGUF version {version}")
        tensor_count = struct.unpack("<Q", f.read(8))[0]
        metadata_count = struct.unpack("<Q", f.read(8))[0]
        metadata: dict[str, Any] = {}
        for _ in range(metadata_count):
            key = _read_string(f)
            metadata[key] = _read_metadata_value(f)
        alignment = int(metadata.get("general.alignment", ALIGNMENT_DEFAULT))
        tensor_infos: list[tuple[str, tuple[int, ...], int, int]] = []
        for _ in range(tensor_count):
            name = _read_string(f)
            (ndim,) = struct.unpack("<I", f.read(4))
            dims = tuple(struct.unpack("<Q", f.read(8))[0] for _ in range(ndim))
            (ggml_type,) = struct.unpack("<I", f.read(4))
            if ggml_type != GGML_TYPE_F32:
                raise ValueError(f"unsupported tensor type {ggml_type}")
            (offset,) = struct.unpack("<Q", f.read(8))
            tensor_infos.append((name, dims, ggml_type, offset))
        data_start = _align(f.tell(), alignment)
        tensors: dict[str, np.ndarray] = {}
        for i, (name, dims_rev, _ggml_type, offset) in enumerate(tensor_infos):
            shape = tuple(reversed(dims_rev))
            numel = int(np.prod(shape, dtype=np.int64))
            f.seek(data_start + offset)
            raw = f.read(numel * 4)
            arr = np.frombuffer(raw, dtype=np.float32).copy().reshape(shape)
            tensors[name] = arr
        return metadata, tensors
