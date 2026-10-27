"""Losslessly pack Blender's RGBA8 PNG bakes; Python stdlib only.

PNG pixels are copied without colour conversion or resampling. Runtime gets
zero-copy RGBA views after native asynchronous gzip decompression.
"""
from pathlib import Path
import gzip
import hashlib
import json
import struct
import zlib

HERE = Path(__file__).resolve().parent
MAPS = [(family, channel) for family in ('ceramic', 'resin') for channel in ('color', 'normal', 'orm')]


def rgba8(path):
    png = path.read_bytes()
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    offset, payload = 8, bytearray()
    while offset < len(png):
        length = struct.unpack_from('>I', png, offset)[0]
        kind = png[offset+4:offset+8]
        data = png[offset+8:offset+8+length]
        assert zlib.crc32(kind + data) & 0xffffffff == struct.unpack_from('>I', png, offset+8+length)[0]
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            assert (depth, color, compression, filtering, interlace) == (8, 6, 0, 0, 0)
        elif kind == b'IDAT':
            payload.extend(data)
        offset += length + 12
    raw = zlib.decompress(payload)
    stride = width * 4
    assert len(raw) == (stride + 1) * height
    previous = bytearray(stride)
    rows = []
    for y in range(height):
        start = y * (stride + 1)
        mode = raw[start]
        row = bytearray(raw[start+1:start+1+stride])
        for x in range(stride):
            a = row[x-4] if x >= 4 else 0
            b = previous[x]
            c = previous[x-4] if x >= 4 else 0
            if mode == 1:
                predictor = a
            elif mode == 2:
                predictor = b
            elif mode == 3:
                predictor = (a+b)//2
            elif mode == 4:
                p = a+b-c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                predictor = a if pa <= pb and pa <= pc else b if pb <= pc else c
            else:
                assert mode == 0
                predictor = 0
            row[x] = (row[x]+predictor) & 255
        rows.append(row)
        previous = row
    # Blender's glTF exporter already flips V. Retain PNG scanline order to
    # match GLTFLoader's flipY=false convention, including the normal maps.
    return width, height, b''.join(rows)


def main():
    maps = [rgba8(HERE / (family+'-'+channel+'.png')) for family,channel in MAPS]
    header = b'SPCR1001' + b''.join(struct.pack('<II', w, h) for w,h,_ in maps)
    data = header + b''.join(pixels for _,_,pixels in maps)
    packed = gzip.compress(data, compresslevel=9, mtime=0)
    (HERE / 'room-one-maps.bin').write_bytes(packed)
    manifest = {'version':1,'source':'Blender Cycles procedural finish bakes',
        'rawBytes':len(data),'compressedBytes':len(packed),
        'estimatedTextureBytesWithMipmaps':sum(len(p) for _,_,p in maps)*4//3,
        'maps':[{'family':family,'channel':channel,'width':w,'height':h,
                 'sha256':hashlib.sha256(p).hexdigest()} for (family,channel),(w,h,p) in zip(MAPS,maps)]}
    (HERE / 'room-one-maps.validation.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(len(packed),'compressed bytes;',manifest['estimatedTextureBytesWithMipmaps'],'texture bytes including mipmaps')


if __name__ == '__main__':
    main()
