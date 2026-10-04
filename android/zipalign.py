"""Reescribe un APK alineando a 4 bytes las entradas sin comprimir
(equivalente a `zipalign -p 4`); resources.arsc debe ir sin comprimir y
alineado para targetSdk >= 30. Uso: python zipalign.py entrada.apk salida.apk"""
import sys
import zipfile

SIN_COMPRIMIR = ("resources.arsc", ".png")

entrada, salida = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(entrada) as zin, open(salida, "wb") as f:
    centrales = []
    for info in zin.infolist():
        datos = zin.read(info.filename)
        guardar = info.filename == "resources.arsc" or info.filename.endswith(SIN_COMPRIMIR[1])
        zi = zipfile.ZipInfo(info.filename, date_time=(2008, 1, 1, 0, 0, 0))
        zi.external_attr = info.external_attr
        zi.compress_type = zipfile.ZIP_STORED if guardar else zipfile.ZIP_DEFLATED
        centrales.append((zi, datos))

    # Escribe con zipfile y ajusta el campo "extra" para alinear los datos.
    with zipfile.ZipFile(f, "w") as zout:
        for zi, datos in centrales:
            if zi.compress_type == zipfile.ZIP_STORED:
                cabecera = 30 + len(zi.filename.encode())
                inicio = zout.fp.tell() + cabecera
                relleno = (-inicio) % 4
                zi.extra = b"\x00" * relleno
            zout.writestr(zi, datos)
print("Alineado:", salida)
