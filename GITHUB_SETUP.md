# Configuración de GitHub

Guía para crear el repositorio, hacer el primer commit limpio, crear el tag de release y configurar las ramas.

---

## 1. Crear el repositorio en GitHub

1. Ve a [github.com](https://github.com) y haz clic en **"New repository"**
2. Configuración recomendada:
   - **Repository name**: `banco-maestro-retos`
   - **Visibility**: **Private** (recomendado — contiene contenido académico y configuraciones del piloto)
   - **Initialize with README**: NO (ya tienes uno)
   - **Add .gitignore**: NO (ya tienes uno)
   - **License**: NO (ya tienes una)
3. Haz clic en **"Create repository"**

---

## 2. Configurar Git localmente

Si es la primera vez en este equipo:

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@upes.edu.sv"
```

---

## 3. Inicializar el repositorio local

Desde la raíz del proyecto (donde está este archivo):

```bash
# Si aún no es un repositorio git
git init

# Verificar qué archivos serán ignorados por .gitignore
git status
```

Verifica que NO aparezcan en la lista:
- `.env` o `.env.local`
- `audit/`
- `chats/`
- `project/.thumbnail`
- `node_modules/`

Si aparecen, revisa el archivo `.gitignore`.

---

## 4. Primer commit limpio

```bash
# Agregar todos los archivos del proyecto
git add .

# Revisar qué está en staging antes de commitear
git status

# Crear el commit inicial
git commit -m "feat: v1.0-rc Banco Maestro de Retos — piloto 2025

- Plataforma completa con 18 semanas x 3 microretos
- Challenge Engine con 16 tipos de componentes interactivos
- Backend en Google Apps Script con 7 hojas de Sheets
- Author Studio, Admin Panel, Component Library
- Content SDK (validate.js + generate.js)
- 13 plantillas de componentes + 39 ejemplos validados
- Documentación completa de despliegue"
```

---

## 5. Conectar con GitHub y hacer push

```bash
# Reemplaza USUARIO y REPO con los tuyos
git remote add origin https://github.com/USUARIO/banco-maestro-retos.git

# Verificar que el remote está correcto
git remote -v

# Push inicial
git push -u origin main
```

Si la rama por defecto de tu Git local se llama `master` en lugar de `main`:
```bash
git branch -M main
git push -u origin main
```

---

## 6. Crear el tag de release

```bash
# Crear tag anotado para v1.0-rc
git tag -a v1.0-rc -m "Release Candidate 1.0 — Piloto Semestre 2025-I

Primera versión completa de la plataforma:
- 54 desafíos (18 semanas x 3 microretos)
- 16 tipos de componentes interactivos
- Sistema de gamificación (XP, niveles, insignias, ranking)
- Backend serverless con Google Apps Script
- Content SDK para creación de contenido sin código"

# Push del tag
git push origin v1.0-rc
```

---

## 7. Crear el release en GitHub

1. Ve a tu repositorio en GitHub
2. En el panel derecho, haz clic en **"Releases"** → **"Create a new release"**
3. En **"Choose a tag"** selecciona `v1.0-rc`
4. **Release title**: `v1.0-rc — Piloto Semestre 2025-I`
5. **Description**: copia el contenido del `CHANGELOG.md` de la sección `[1.0.0-rc]`
6. Marca **"Set as pre-release"** (es un RC, no la versión final estable)
7. Haz clic en **"Publish release"**

---

## 8. Configurar ramas de trabajo

```bash
# Rama para contenido del Banco Maestro (equipo de contenido)
git checkout -b contenido/semana-01
git push -u origin contenido/semana-01
git checkout main

# Rama para hotfixes (si fuera necesario durante el piloto)
# Solo crear si hay un fix urgente:
# git checkout -b fix/descripcion-breve
```

### Estrategia de ramas recomendada para el piloto

| Rama | Propósito |
|---|---|
| `main` | Producción — lo que está desplegado en Vercel |
| `contenido/semana-NN` | Desarrollo de contenido por semana |
| `fix/descripcion` | Correcciones urgentes |

**Regla**: nunca trabajes directamente en `main`. Siempre crea una rama, trabaja allí, y abre un Pull Request.

---

## 9. Configurar protección de rama (recomendado)

En GitHub > Settings > Branches > "Add branch protection rule":

- Branch name pattern: `main`
- Activar: **"Require a pull request before merging"**
- Activar: **"Require status checks to pass before merging"** (si tienes CI)
- Activar: **"Include administrators"**

Esto previene pushes directos a `main` accidentales.

---

## 10. Flujo de trabajo diario

```bash
# 1. Actualizar tu copia local
git pull origin main

# 2. Crear rama para el trabajo
git checkout -b contenido/semana-05-instrumentos

# 3. Hacer cambios (generar, editar, validar)
node content/sdk/generate.js --component matrix --week 5 --microreto 1
# ... editar el JSON ...
node content/sdk/validate.js content/challenge-bank/week05.json

# 4. Commit
git add content/challenge-bank/week05.json
git commit -m "contenido: semana 5 microreto 1 - matriz de clasificacion de instrumentos"

# 5. Push y abrir PR
git push -u origin contenido/semana-05-instrumentos
# Luego abrir el PR en github.com
```

---

## Verificación final

```bash
# Verificar que el repositorio está limpio
git status
# Debe mostrar: "nothing to commit, working tree clean"

# Verificar que el tag existe
git tag -l
# Debe mostrar: v1.0-rc

# Verificar el remote
git remote -v
# Debe mostrar la URL de tu repositorio en GitHub
```
