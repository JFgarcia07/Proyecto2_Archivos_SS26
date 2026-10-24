# Manual Técnico — Sistema de Gestión Documental

**Universidad de San Carlos de Guatemala**
Centro Universitario de Occidente · División Ciencias de la Ingeniería
Ingeniería en Ciencias y Sistemas · Manejo e Implementación de Archivos
Proyecto #2

---

## Índice

1. [Objetivo del documento](#1-objetivo-del-documento)
2. [Arquitectura general](#2-arquitectura-general)
3. [Tecnologías utilizadas](#3-tecnologías-utilizadas)
4. [Estructura del código](#4-estructura-del-código)
5. [Instalación y ejecución](#5-instalación-y-ejecución)
6. [Modelo de datos (MongoDB)](#6-modelo-de-datos-mongodb)
7. [Reglas de negocio](#7-reglas-de-negocio)
8. [Seguridad](#8-seguridad)
9. [API REST](#9-api-rest)
10. [Reportes](#10-reportes)
11. [Aplicación cliente (Angular)](#11-aplicación-cliente-angular)
12. [Carga inicial de datos](#12-carga-inicial-de-datos)
13. [Manejo de errores](#13-manejo-de-errores)
14. [Limitaciones conocidas](#14-limitaciones-conocidas)

---

## 1. Objetivo del documento

Describe la construcción interna del sistema: cómo está organizado el código, qué decisiones técnicas se tomaron y qué hace cada pieza. Está dirigido a quien deba mantener, corregir o ampliar el sistema. Cómo se **usa** el sistema se explica en el manual de usuario (`MANUAL_USUARIO.md`).

El sistema es un gestor documental tipo "unidad en la nube": permite almacenar archivos `.txt` y `.md`, organizarlos en carpetas, compartirlos con otros usuarios con distintos permisos, recuperarlos desde una papelera y auditar la actividad de cada usuario.

---

## 2. Arquitectura general

Arquitectura **cliente-servidor** con dos aplicaciones independientes que se comunican por HTTP mediante una API REST con datos en JSON.

```
┌──────────────────┐     HTTP / JSON      ┌──────────────────┐    Driver     ┌──────────────┐
│     CLIENTE      │ ───────────────────▶ │     SERVIDOR     │ ────────────▶ │ BASE DE DATOS│
│                  │                      │                  │               │              │
│  Angular 21 LTS  │ ◀─────────────────── │ Node.js + Express│ ◀──────────── │   MongoDB    │
│  Bootstrap 5     │      API REST        │   TypeScript     │               │ (+ GridFS)   │
│ localhost:4200   │                      │ localhost:3000   │               │ puerto 27017 │
└──────────────────┘                      └──────────────────┘               └──────────────┘
```

Puntos clave:

- **El cliente nunca se conecta a la base de datos.** Solo conoce las URL de la API.
- **El servidor es el único que habla con MongoDB.** Todas las reglas de negocio (permisos, validaciones, herencia de accesos) viven en el servidor, porque el código del navegador puede ser manipulado.
- Cada aplicación se ejecuta por separado, en su propio puerto.

### Capas del servidor

Cada petición recorre las mismas capas, con una responsabilidad por capa:

```
Petición HTTP
   │
   ▼
Middleware   ── valida el token JWT y el rol (autenticar, soloAdmin)
   │
   ▼
Controller   ── recibe la petición, extrae parámetros, responde (sin reglas de negocio)
   │
   ▼
Service      ── reglas de negocio, validaciones y permisos
   │
   ▼
DB           ── consultas a MongoDB (sin reglas de negocio)
   │
   ▼
MongoDB
```

Los **Model** son las clases que representan cada documento.

---

## 3. Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Lenguaje del servidor | TypeScript sobre Node.js (módulos ES) |
| Framework del servidor | Express |
| Base de datos | MongoDB Community Server |
| Acceso a datos | Driver oficial `mongodb` (sin ODM) |
| Contenido de archivos | GridFS (bucket `contenidos`) |
| Autenticación | JWT (`jsonwebtoken`) |
| Contraseñas | `bcryptjs` (factor de costo 10) |
| Carga de archivos | `multer` (en memoria, máximo 5 MB) |
| Variables de entorno | `dotenv` |
| Ejecución en desarrollo | `tsx watch` |
| Framework del cliente | Angular 21 LTS (componentes standalone y signals) |
| Estilos | Bootstrap 5 |

---

## 4. Estructura del código

```
Proyecto02/
├── README.md
├── docs/                  Manuales y diagramas
├── cliente/               Aplicación Angular
└── servidor/              API REST
    ├── .env               Variables de entorno (no se sube a Git)
    ├── .env.example       Plantilla de variables
    └── src/
        ├── index.ts       Arranque: Express, CORS, rutas y conexión a MongoDB
        ├── seed.ts        Carga inicial de datos
        ├── Model/         Usuario, Carpeta, Archivo, Comparticion, Actividad, ErrorApp
        ├── DB/            Conexion (Singleton), UsuarioDB, CarpetaDB, ArchivoDB,
        │                  ComparticionDB, ActividadDB, ReporteDB
        ├── Services/      AuthService, UsuarioService, CarpetaService, ArchivoService,
        │                  PapeleraService, ComparticionService, AccesoService,
        │                  ActividadService, ReporteService
        ├── Controller/    AuthController, UsuarioController, CarpetaController,
        │                  ArchivoController, PapeleraController, ComparticionController,
        │                  ActividadController, ReporteController
        └── Middleware/    AuthMiddleware (autenticar, soloAdmin)
```

### Clases destacadas

| Clase | Responsabilidad |
|---|---|
| `Conexion` | Singleton: una sola conexión a MongoDB compartida por todo el servidor. |
| `ErrorApp` | Error de negocio con código HTTP. Los Services la lanzan y los Controllers la traducen a respuesta. |
| `AccesoService` | Calcula el nivel de acceso de un usuario sobre una carpeta o archivo, incluyendo herencia. |
| `ActividadService` | Registra cada acción en el historial; los demás Services lo invocan. |
| `ReporteDB` | Contiene las agregaciones de MongoDB de los reportes. |

---

## 5. Instalación y ejecución

Los pasos completos están en el archivo `README.md` de la raíz del repositorio. Resumen:

```bash
# Servidor
cd servidor
npm install
# crear servidor/.env a partir de .env.example
npm run seed
npm run dev

# Cliente (otra terminal)
cd cliente
npm install
ng serve
```

Variables de `servidor/.env`:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (3000) |
| `MONGO_URI` | Cadena de conexión (`mongodb://localhost:27017`) |
| `DB_NAME` | Nombre de la base de datos (`proy2`) |
| `JWT_SECRET` | Secreto con el que se firman los tokens |

---

## 6. Modelo de datos (MongoDB)

MongoDB es una base **orientada a documentos**: no hay tablas ni claves foráneas. Las colecciones guardan documentos JSON y las relaciones se resuelven con **referencias** (guardar el `_id` de otro documento) o con **datos embebidos**. La integridad que en SQL garantizan las claves foráneas aquí la garantizan los **Services**.

### 6.1 Colecciones

```
usuarios ──< carpetas ──< archivos ──── contenidos.files ──< contenidos.chunks (GridFS)
   │            │              │
   │            └─(parentId, ancestros: la carpeta se relaciona consigo misma)
   │
   ├──< comparticiones >── apunta a un archivo o a una carpeta (recursoId)
   └──< actividad
```

#### `usuarios`

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `nombre` | string | Nombre visible |
| `email` | string | Correo (único); se usa para iniciar sesión |
| `passwordHash` | string | Contraseña cifrada con bcrypt (nunca en texto plano) |
| `rol` | `"ADMIN"` \| `"USUARIO"` | Rol del sistema |
| `activo` | boolean | `false` impide iniciar sesión sin borrar el historial |
| `fechaCreacion` | Date | Fecha de alta |

#### `carpetas`

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `nombre` | string | Nombre de la carpeta |
| `ownerId` | ObjectId | Propietario (referencia a `usuarios`) |
| `parentId` | ObjectId \| null | Carpeta padre; `null` si está en la raíz |
| `ancestros` | ObjectId[] | Ruta completa desde la raíz hasta el padre |
| `eliminada` | boolean | `true` si está en la papelera |
| `eliminadaDirecta` | boolean | `true` si el usuario la eliminó directamente (no por arrastre de su padre) |
| `fechaEliminacion` | Date \| null | Momento en que pasó a la papelera |
| `fechaCreacion` | Date | Fecha de creación |

#### `archivos` (metadatos)

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `nombre` | string | Nombre con extensión |
| `tipo` | `"txt"` \| `"md"` | Extensión permitida |
| `tamano` | number | Tamaño en bytes |
| `ownerId` | ObjectId | Propietario (referencia a `usuarios`) |
| `carpetaId` | ObjectId \| null | Carpeta que lo contiene; `null` si está en la raíz |
| `gridfsId` | ObjectId | Referencia al contenido en GridFS |
| `eliminado` | boolean | `true` si está en la papelera |
| `eliminadoDirecto` | boolean | `true` si el usuario lo eliminó directamente |
| `fechaEliminacion` | Date \| null | Momento en que pasó a la papelera |
| `fechaCreacion` / `fechaModificacion` | Date | Fechas relevantes |

#### `contenidos.files` y `contenidos.chunks` (GridFS)

Colecciones internas de MongoDB. GridFS divide el contenido de cada archivo en fragmentos (`chunks`) y registra sus datos en `files`. El contenido se recupera completo, sin pérdida de información. No se guarda una ruta a un archivo local del servidor.

#### `comparticiones`

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `tipoRecurso` | `"archivo"` \| `"carpeta"` | Qué se compartió |
| `recursoId` | ObjectId | Archivo o carpeta compartido |
| `ownerId` | ObjectId | Quien comparte (propietario del recurso) |
| `destinatarioId` | ObjectId | Quien recibe el acceso |
| `permiso` | `"lectura"` \| `"comentar"` \| `"edicion"` | Nivel concedido |
| `fechaCreacion` | Date | Fecha en que se compartió |

#### `actividad` (historial)

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `usuarioId` | ObjectId | Quién realizó la acción |
| `accion` | string | Tipo de acción (ver 6.3) |
| `tipoRecurso` | string \| null | `archivo`, `carpeta` o `usuario` |
| `recursoId` | ObjectId \| null | Sobre qué recurso |
| `nombreRecurso` | string \| null | **Copia** del nombre en el momento de la acción |
| `detalle` | string \| null | Información adicional (ej. "Antes: viejo.txt") |
| `fecha` | Date | Cuándo ocurrió |

### 6.2 Índices

| Colección | Índice | Para qué sirve |
|---|---|---|
| `usuarios` | `{ email: 1 }` **único** | Impide correos duplicados; acelera el login |
| `carpetas` | `{ ownerId: 1, parentId: 1, eliminada: 1 }` | Listar el contenido de una carpeta |
| `carpetas` | `{ ancestros: 1 }` | Encontrar todas las subcarpetas de una carpeta con una sola consulta |
| `archivos` | `{ ownerId: 1, carpetaId: 1, eliminado: 1 }` | Listar los archivos de una carpeta |
| `archivos` | `{ tipo: 1 }` | Filtro por tipo y reporte por tipo |
| `archivos` | `{ fechaCreacion: 1 }` | Reporte por rango de fechas |
| `comparticiones` | `{ recursoId: 1, destinatarioId: 1 }` **único** | Un recurso se comparte una sola vez con cada usuario |
| `comparticiones` | `{ destinatarioId: 1 }` | Lo recibido por un usuario |
| `comparticiones` | `{ ownerId: 1 }` | Lo compartido por un usuario |
| `actividad` | `{ usuarioId: 1, fecha: -1 }` | Historial de un usuario, del más reciente al más antiguo |
| `actividad` | `{ recursoId: 1 }` | Historial de un recurso |
| `actividad` | `{ accion: 1 }` | Reportes por tipo de acción |
| `actividad` | `{ fecha: 1 }` | Reportes por período y por rango de fechas |

### 6.3 Acciones del historial

`LOGIN`, `CREAR_CARPETA`, `SUBIR_ARCHIVO`, `DESCARGAR_ARCHIVO`, `RENOMBRAR`, `MOVER`, `ELIMINAR`, `RESTAURAR`, `ELIMINAR_DEFINITIVO`, `COMPARTIR`, `CAMBIAR_PERMISO`, `RETIRAR_ACCESO`, `ACTIVAR_USUARIO`, `DESACTIVAR_USUARIO`.

### 6.4 Decisiones de diseño: referencias vs. documentos embebidos

| Decisión | Justificación |
|---|---|
| **Contenido del archivo en GridFS, no dentro de `archivos`** | Es lo que exige el enunciado. Además separa los metadatos livianos del contenido pesado: listar archivos no carga ningún contenido, y GridFS maneja archivos que superan el límite de 16 MB de un documento. |
| **`archivos.ownerId` y `archivos.carpetaId` como referencias** | Un usuario tiene muchos archivos y una carpeta tiene muchos archivos. Embeberlos haría crecer el documento del usuario o de la carpeta sin límite, y mover un archivo implicaría reescribir documentos grandes. |
| **Carpetas: `parentId` + `ancestros`** | `parentId` (referencia al padre) permite listar el contenido directo. `ancestros` (arreglo embebido de ids) guarda la ruta completa: permite detectar ciclos al mover, encontrar todos los descendientes con una consulta (`{ ancestros: id }`) y calcular la herencia de permisos sin recorrer el árbol nivel por nivel. El costo es actualizar los `ancestros` de las subcarpetas al mover una carpeta, lo que ocurre en `CarpetaService.mover`. |
| **`comparticiones` como colección aparte** | Es una relación muchos a muchos (un recurso con varios usuarios; un usuario con varios recursos) con datos propios (permiso, fecha). Los reportes agrupan por recurso y por usuario, y un índice único evita duplicados. Embeberla en archivos y carpetas dificultaría esas consultas. |
| **`actividad` como colección aparte, solo de inserción** | Crece sin límite, y embeberla en usuarios o archivos produciría documentos que crecen indefinidamente. Los reportes la agrupan y filtran por fecha, usuario y acción. |
| **`actividad.nombreRecurso` duplicado a propósito** | Es una desnormalización deliberada: si el recurso se renombra o se elimina definitivamente, el historial conserva el nombre que tenía. El enunciado exige conservar la información histórica para auditoría. |
| **Papelera con indicadores (`eliminada`, `eliminadaDirecta`), no mover a otra colección** | Restaurar es cambiar un campo y no hay que reconstruir el documento. `eliminadaDirecta` distingue lo que el usuario eliminó de lo que se fue por arrastre de su carpeta, de modo que la papelera muestra solo el elemento raíz. |
| **Usuarios con `activo`, nunca se borran** | Desactivar no debe provocar la pérdida del historial relacionado con sus documentos y actividades. |

---

## 7. Reglas de negocio

| Regla | Dónde se aplica |
|---|---|
| Solo se aceptan archivos `.txt` y `.md` (máximo 5 MB) | `ArchivoService.obtenerTipo`, límite en `multer` |
| Nombre único por carpeta (archivos y carpetas), sin contar lo eliminado | `existeNombre` en `ArchivoDB` y `CarpetaDB` |
| Un usuario solo accede a lo propio o a lo compartido con él | `buscarCarpetaPropia`, `buscarArchivoPropio` y `AccesoService` |
| La jerarquía de carpetas no admite ciclos | `CarpetaService.mover`: el destino no puede ser la misma carpeta ni una de sus subcarpetas |
| Al mover una carpeta se actualizan los `ancestros` de todas sus subcarpetas | `CarpetaService.mover` |
| Lo eliminado no aparece en las consultas normales | Filtros `eliminada: false` / `eliminado: false` |
| Eliminar una carpeta lleva a la papelera sus subcarpetas y archivos, con la misma fecha | `PapeleraService.enviarCarpeta` |
| Restaurar una carpeta devuelve lo que se fue con ella (misma fecha de eliminación) | `CarpetaDB.restaurar`, `ArchivoDB.restaurarPorCarpetas` |
| No se puede restaurar si la carpeta contenedora sigue en la papelera, ni si el nombre ya está en uso | `PapeleraService.restaurarCarpeta` / `restaurarArchivo` |
| Eliminar definitivamente borra metadatos, contenido en GridFS y comparticiones asociadas | `PapeleraService.eliminar*Definitivo` |
| Solo el propietario comparte, cambia permisos o retira accesos | `ComparticionService.compartir`, `buscarComparticionPropia` |
| No se puede compartir con uno mismo ni con usuarios inactivos o inexistentes | `ComparticionService.compartir` |
| Los permisos sobre una carpeta se heredan a su contenido | `AccesoService` |
| Los recursos en la papelera no son accesibles para otros usuarios | `AccesoService` (devuelve acceso nulo si el recurso está eliminado) |
| Un administrador no puede desactivar su propia cuenta | `UsuarioService.cambiarActivo` |
| Un usuario inactivo no puede iniciar sesión | `AuthService.login` |
| El historial no cancela la operación si falla al guardar | `ActividadService.registrar` (captura el error) |

### 7.1 Niveles de acceso y herencia

`AccesoService` devuelve un nivel numérico:

| Nivel | Valor | Permite |
|---|---|---|
| Ninguno | 0 | Nada (el recurso se responde como "no encontrado") |
| Lectura | 1 | Navegar y descargar |
| Comentar | 2 | Lo mismo que lectura (la función de comentarios no está implementada) |
| Edición | 3 | Lo anterior, más renombrar archivos |
| Dueño | 4 | Todo, incluida la compartición |

Cómo se calcula:

- **Carpeta:** si el usuario es el dueño, nivel dueño. Si no, se buscan comparticiones del usuario sobre cualquiera de los ids `[...carpeta.ancestros, carpeta._id]` y se toma el mayor permiso.
- **Archivo:** igual, sobre los ids `[archivo._id, carpeta del archivo, ...ancestros de esa carpeta]`.

Gracias al arreglo `ancestros`, la herencia se resuelve con **una sola consulta** a `comparticiones`.

---

## 8. Seguridad

- **Autenticación con JWT.** `POST /api/auth/login` valida el correo y la contraseña (`bcrypt.compare`) y devuelve un token firmado con `JWT_SECRET`, con duración de **8 horas**. El token lleva `id` y `rol` del usuario.
- **Middleware `autenticar`.** Lee el encabezado `Authorization: Bearer <token>`, valida la firma y la expiración y deja la sesión en `req.sesion`. Sin token válido responde **401**.
- **Middleware `soloAdmin`.** Se aplica después de `autenticar`; si el rol no es `ADMIN` responde **403**. Protege `/api/reportes` y `/api/usuarios`.
- **Contraseñas.** Se guardan solo como hash bcrypt; las respuestas de la API nunca incluyen el hash.
- **Propiedad de los recursos.** Los Services siempre verifican el propietario o el permiso; un recurso al que el usuario no tiene acceso responde **404**, sin revelar que existe.
- **Búsquedas.** El texto buscado se escapa antes de usarse como expresión regular, para que los símbolos especiales se traten como texto.
- **Cliente.** El interceptor `authInterceptor` agrega el token a cada petición. El `authGuard` bloquea las rutas sin sesión y el `adminGuard` las exclusivas del administrador. Si el servidor responde 401, el cliente cierra la sesión.

---

## 9. API REST

Todas las rutas, salvo el login, exigen el encabezado `Authorization: Bearer <token>`. Las respuestas de error tienen la forma `{ "error": "mensaje" }`.

### Autenticación

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Body `{ email, password }`. Devuelve `{ token, usuario }` |

### Carpetas

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/carpetas?parentId=` | Lista las subcarpetas (sin `parentId` = raíz) |
| POST | `/api/carpetas` | Crea. Body `{ nombre, parentId }` |
| PATCH | `/api/carpetas/:id` | Renombra. Body `{ nombre }` |
| PATCH | `/api/carpetas/:id/mover` | Mueve. Body `{ parentId }` (`null` = raíz) |

### Archivos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/archivos?carpetaId=&q=&tipo=` | Lista, con búsqueda por nombre y filtro por tipo |
| POST | `/api/archivos` | Sube un archivo. `multipart/form-data`: campo `archivo` y opcional `carpetaId` |
| GET | `/api/archivos/:id/descargar` | Descarga el contenido |
| PATCH | `/api/archivos/:id` | Renombra. Body `{ nombre }` |
| PATCH | `/api/archivos/:id/mover` | Mueve. Body `{ carpetaId }` |

### Papelera

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/papelera` | Lista lo eliminado directamente: `{ carpetas, archivos }` |
| POST | `/api/papelera/carpetas/:id` | Envía una carpeta (con su contenido) a la papelera |
| POST | `/api/papelera/archivos/:id` | Envía un archivo a la papelera |
| POST | `/api/papelera/carpetas/:id/restaurar` | Restaura una carpeta y lo que se fue con ella |
| POST | `/api/papelera/archivos/:id/restaurar` | Restaura un archivo |
| DELETE | `/api/papelera/carpetas/:id` | Elimina definitivamente una carpeta y su contenido |
| DELETE | `/api/papelera/archivos/:id` | Elimina definitivamente un archivo y su contenido en GridFS |

### Compartición

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/comparticiones` | Comparte. Body `{ tipoRecurso, recursoId, email, permiso }`. Si ya estaba compartido, actualiza el permiso |
| GET | `/api/comparticiones/enviadas` | Lo que el usuario compartió |
| GET | `/api/comparticiones/recibidas` | Lo que le compartieron |
| PATCH | `/api/comparticiones/:id` | Cambia el permiso. Body `{ permiso }` |
| DELETE | `/api/comparticiones/:id` | Retira el acceso |
| GET | `/api/comparticiones/carpetas/:id/contenido` | Contenido de una carpeta compartida |
| GET | `/api/comparticiones/archivos/:id/descargar` | Descarga un archivo compartido (lectura o superior) |
| PATCH | `/api/comparticiones/archivos/:id` | Renombra un archivo compartido (requiere edición) |

### Historial

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/actividad?usuarioId=&desde=&hasta=&accion=` | Historial (máximo 200 registros). Un usuario ve solo el suyo; el ADMIN ve todos o el de un usuario. Fechas `AAAA-MM-DD` |
| GET | `/api/actividad/recurso/:id` | Historial de un archivo o carpeta (propietario o ADMIN) |

### Usuarios (solo ADMIN)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/usuarios` | Lista los usuarios (sin contraseña) |
| PATCH | `/api/usuarios/:id/activo` | Activa o desactiva. Body `{ activo: true \| false }` |

### Reportes (solo ADMIN)

Ver la sección siguiente.

### Códigos de respuesta

| Código | Significado |
|---|---|
| 200 / 201 | Operación correcta / recurso creado |
| 400 | Datos inválidos (nombre vacío, extensión no permitida, id mal formado, ciclo en carpetas) |
| 401 | Token ausente, inválido o expirado; o credenciales incorrectas en el login |
| 403 | Sin permiso para la operación |
| 404 | El recurso no existe o el usuario no tiene acceso a él |
| 409 | Conflicto (nombre repetido, restauración bloqueada) |
| 500 | Error interno |

---

## 10. Reportes

Todos son de solo lectura, exclusivos del ADMIN y se calculan con el **framework de agregación** de MongoDB (`$match` filtra, `$group` agrupa y acumula, `$sort` ordena, `$limit` recorta, `$lookup` une con otra colección, `$project` da forma a la salida). Se implementan en `ReporteDB`.

| # | Reporte | Ruta (`/api/reportes/...`) | Colección base | Etapas principales |
|---|---|---|---|---|
| 1 | Cantidad de archivos por tipo | `archivos-por-tipo` | `archivos` | `$match`, `$group` por `tipo` (cuenta y suma de tamaño), `$sort` |
| 2 | Archivos en un rango de fechas | `archivos-por-fechas?desde=&hasta=` | `archivos` | `$match` por `fechaCreacion`, `$sort`, `$limit`, `$lookup` a `usuarios` |
| 3 | Archivos con más operaciones | `archivos-mas-operaciones` | `actividad` | `$match`, `$group` por `recursoId`, `$sort`, `$limit`, `$lookup` a `archivos` (indica si aún existe) |
| 4 | Top 10 usuarios con más archivos | `usuarios-mas-archivos` | `archivos` | `$match`, `$group` por `ownerId`, `$sort`, `$limit 10`, `$lookup` a `usuarios` |
| 5 | Usuarios con más recursos compartidos | `usuarios-mas-compartidos` | `comparticiones` | `$group` por `ownerId` con `$addToSet`, `$size`, `$sort`, `$lookup` |
| 6 | Archivos compartidos con más usuarios | `archivos-mas-compartidos` | `comparticiones` | `$match`, `$group` por `recursoId`, `$sort`, `$limit`, `$lookup` a `archivos` |
| 7 | Recursos compartidos por un usuario | `compartidos-por/:usuarioId` | `comparticiones` | `$match` por `ownerId`, `$lookup` a `usuarios`, `archivos` y `carpetas` |
| 8 | Recursos recibidos por un usuario | `recibidos-por/:usuarioId` | `comparticiones` | `$match` por `destinatarioId`, `$lookup` a `usuarios`, `archivos` y `carpetas` |
| 9 | Historial de un usuario en un rango de fechas | `actividad-usuario/:usuarioId?desde=&hasta=` | `actividad` | Reutiliza `ActividadService.listar` |
| 10 | Operaciones agrupadas por tipo | `operaciones-por-tipo?desde=&hasta=` | `actividad` | `$match`, `$group` por `accion`, `$sort` |
| 11 | Operaciones agrupadas por período | `operaciones-por-periodo?periodo=dia\|mes&desde=&hasta=` | `actividad` | `$match`, `$group` con `$dateToString` (zona `America/Guatemala`), `$sort` |
| 12 | Principales acciones del sistema | `principales-acciones?desde=&hasta=` | `actividad` | `$match`, `$group` por (`usuarioId`, `accion`), `$sort`, `$limit 10`, `$lookup` |

Auxiliar: `GET /api/reportes/usuarios` devuelve la lista de usuarios para los selectores de la pantalla.

---

## 11. Aplicación cliente (Angular)

### Estructura

```
cliente/src/app/
├── models/modelos.ts            Interfaces: Carpeta, Archivo, Recibido, Enviado, ...
├── services/                    auth, carpetas, archivos, papelera-api, comparticiones-api,
│                                actividad-api, reportes-api, usuarios-api
├── interceptors/auth.interceptor.ts
├── guards/auth.guard.ts         authGuard y adminGuard
└── pages/                       login, explorador, compartidos, papelera, actividad,
                                 reportes, admin-usuarios
```

### Rutas

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/login` | Inicio de sesión | Público |
| `/explorador` | Carpetas y archivos propios | Con sesión |
| `/compartidos` | Compartidos conmigo y por mí | Con sesión |
| `/papelera` | Papelera | Con sesión |
| `/actividad` | Historial de actividad | Con sesión |
| `/reportes` | Reportes | Solo ADMIN |
| `/usuarios` | Administración de usuarios | Solo ADMIN |

### Piezas importantes

- **`Auth` (servicio):** guarda el token y el usuario en `localStorage` al iniciar sesión, expone el usuario como *signal* y calcula `esAdmin()`. `logout()` limpia todo y redirige al login.
- **`authInterceptor`:** agrega `Authorization: Bearer <token>` a cada petición HTTP.
- **`authGuard` / `adminGuard`:** protegen las rutas; sin sesión redirigen al login y sin rol de administrador al explorador.
- **Servicios `*-api`:** una clase por grupo de endpoints; devuelven `Observable` y no tienen lógica de pantalla.
- **Pantalla de reportes:** los 12 reportes se definen en un catálogo (ruta, parámetros que pide y columnas a mostrar), de modo que agregar un reporte es agregar un elemento al catálogo y su endpoint.
- **Mover:** se hace en dos pasos sin endpoint adicional: se marca el elemento, se navega a la carpeta destino y se confirma con "Mover aquí".

---

## 12. Carga inicial de datos

`npm run seed` ejecuta `src/seed.ts`, que crea los índices y carga:

- 3 usuarios (`admin@docs.com`, `uno@docs.com`, `dos@docs.com`; contraseña `123456`).
- 17 carpetas (15 activas y 2 en la papelera) con subcarpetas, repartidas entre los usuarios.
- 57 archivos `.txt` y `.md` con contenido en GridFS: 50 activos y 7 en la papelera.
- 22 comparticiones vigentes, con los tres permisos.
- Alrededor de 190 registros de historial repartidos en unos 45 días, coherentes con los datos cargados (incluye un renombrado, un movimiento y una eliminación definitiva).

El script **borra y vuelve a cargar** carpetas, archivos, comparticiones, actividad y GridFS en cada ejecución; los usuarios existentes se conservan. Se puede ejecutar las veces que se necesite.

---

## 13. Manejo de errores

- Los Services lanzan `ErrorApp(mensaje, status)` ante cualquier violación de una regla de negocio.
- Cada Controller captura los errores en un método `responderError`: si es un `ErrorApp` responde con su código y mensaje; cualquier otro error se registra en consola y se responde **500** con un mensaje genérico, sin exponer detalles internos.
- Los identificadores se validan con `ObjectId.isValid` antes de consultar la base.
- El cliente muestra el mensaje del servidor en un aviso; ante un 401 cierra la sesión.
- El historial se registra en un `try/catch` propio: un fallo al registrar no cancela la operación principal.

---

## 14. Limitaciones conocidas

- El permiso **comentar** se guarda y se muestra, pero no existe una función de comentarios; hoy equivale a lectura.
- Si un administrador desactiva a un usuario con sesión abierta, su token sigue siendo válido hasta que expire (8 horas). Para evitarlo habría que consultar el estado del usuario en cada petición.
- No hay edición del contenido de los archivos dentro de la aplicación: el permiso de edición permite renombrar. Para cambiar el contenido hay que subir una nueva versión.
- Los usuarios se crean únicamente con la carga inicial; la pantalla de administración solo activa y desactiva.
- La URL del servidor (`http://localhost:3000`) está escrita en los servicios del cliente; para desplegar en otra máquina habría que moverla a un archivo de configuración de entorno.
- El historial consulta como máximo 200 registros por petición.
