from fnfws import TEXTO, armar_frame, clave_aceptar, leer_frame_desde


def leer_de(datos):
    pos = [0]

    def leer(n):
        d = datos[pos[0]:pos[0] + n]
        pos[0] += n
        return d
    return leer


def test_clave_del_rfc_6455():
    assert clave_aceptar("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="


def test_frames_ida_y_vuelta_con_y_sin_mascara():
    for n in (0, 5, 125, 126, 65535, 70000):
        datos = bytes(i % 251 for i in range(n))
        for mascara in (False, True):
            op, vuelta = leer_frame_desde(leer_de(armar_frame(TEXTO, datos, mascara)))
            assert op == TEXTO and vuelta == datos


def test_mensaje_gigante_se_rechaza():
    import pytest
    with pytest.raises(ValueError):
        leer_frame_desde(leer_de(armar_frame(TEXTO, b"x" * (300 * 1024))))
