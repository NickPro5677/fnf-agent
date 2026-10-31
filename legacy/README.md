# legacy/ — FNF-Agent 3.0 (motor Python)

Aquí está, sin borrar, la versión 3.0: motor en Python que dibuja PNG, visor web,
bot en Node y MCP por socket UNIX. Sigue funcionando en Termux:

```sh
cd legacy
pkg install python python-pillow nodejs
bash start_all.sh        # visor en http://127.0.0.1:8787
bash check.sh --quick    # pruebas del motor 3.0
```

Cambios hechos en 4.0 para poder publicar el repo sin problemas legales:

- Se quitaron los charts oficiales (`bopeebo`, `tutorial`). Ahora usa las canciones
  originales `primer-paso` y `luz-de-neon` (CC0), copiadas de `web/canciones/`.
- Los tests calculan los números de notas desde el chart en vez de tenerlos fijos.

La versión nueva (navegador + relay + agentes Python) está en la raíz del repo.
Las ventanas de juicio del motor nuevo se comprueban contra `env/fnf_engine.py`.
Los números de notas que aparecen en `docs/` son de los charts antiguos.
