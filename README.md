# Sistema de Gestión Documental

Proyecto #2 · Manejo e Implementación de Archivos · USAC CUNOC

Sistema para almacenar, organizar, consultar y compartir archivos digitales (`.txt` y `.md`) entre usuarios. Arquitectura cliente-servidor con dos aplicaciones independientes.

| Componente | Tecnología |
|---|---|
| Cliente | Angular 21 LTS + Bootstrap 5 |
| Servidor | Node.js + Express + TypeScript |
| Base de datos | MongoDB (el contenido de los archivos se guarda en GridFS) |
| Comunicación | API REST (HTTP / JSON) con autenticación JWT |

```
Angular (localhost:4200)  ->  Express (localhost:3000)  ->  MongoDB (localhost:27017)
```

El cliente nunca se conecta a la base de datos: solo el servidor habla con MongoDB.

## Estructura del repositorio

```
Proyecto02/
├── cliente/     Aplicación Angular
└── servidor/    API REST en Node.js
    └── src/
        ├── Model/        Clases de los documentos (Usuario, Carpeta, Archivo, ...)
        ├── DB/           Acceso a MongoDB (consultas, sin reglas de negocio)
        ├── Services/     Reglas de negocio
        ├── Controller/   Endpoints REST
        ├── Middleware/   Validación del token JWT y control de rol
        ├── index.ts      Arranque del servidor
        └── seed.ts       Carga inicial de datos
```

## Requisitos previos

| Herramienta | Versión | Verificar con |
|---|---|---|
| Node.js | 20.19+, 22.12+ o 24+ (LTS) | `node -v` |
| npm | incluido con Node.js | `npm -v` |
| Angular CLI | 21 | `ng version` |
| MongoDB Community Server | probado con 9.0 | `mongosh --version` |

Instalar el Angular CLI (una sola vez):

```bash
npm install -g @angular/cli@21
```

MongoDB debe estar corriendo en `localhost:27017`. Con el instalador de Windows se instala como servicio y arranca solo. Para comprobarlo:

```bash
mongosh
```

o conectarse desde MongoDB Compass a `mongodb://localhost:27017`. Si no conecta, abrir `services.msc` y verificar que **MongoDB Server** esté en ejecución.

## Instalación y ejecución

### 1. Servidor

```bash
cd servidor
npm install
```

Crear el archivo `servidor/.env` (se puede copiar de `.env.example`):

```
PORT=3000
MONGO_URI=mongodb://localhost:27017
DB_NAME=proy2
JWT_SECRET=cambia_esto
```

Cargar los datos iniciales:

```bash
npm run seed
```

Iniciar el servidor:

```bash
npm run dev
```

Debe mostrar:

```
Conectado a MongoDB
Servidor en http://localhost:3000
```

Comprobación rápida: abrir `http://localhost:3000/api/ping` en el navegador; debe responder `{"ok":true}`.

### 2. Cliente

En otra terminal:

```bash
cd cliente
npm install
ng serve
```

Abrir `http://localhost:4200`.

> El cliente espera el servidor en `http://localhost:3000`. Esa dirección está en los servicios de `cliente/src/app/services/`.

## Carga inicial de datos (seed)

`npm run seed` crea los índices y carga:

- 3 usuarios
- Carpetas y subcarpetas distribuidas entre los usuarios
- 50 archivos activos (`.txt` y `.md`), con su contenido en GridFS
- 22 comparticiones entre usuarios, con permisos de lectura, comentar y edición
- Carpetas y archivos en la papelera
- Historial de actividad de unos 45 días

El seed se puede ejecutar varias veces. Cada ejecución **borra y vuelve a cargar** carpetas, archivos, comparticiones, actividad y el contenido de GridFS. Los usuarios se conservan.

## Usuarios de prueba

Los tres usuarios tienen la misma contraseña: `123456`.

| Correo | Rol | Qué puede hacer |
|---|---|---|
| `admin@docs.com` | ADMIN | Todo lo del usuario, más reportes y administración de usuarios |
| `uno@docs.com` | USUARIO | Administrar sus archivos y carpetas, compartir, papelera y actividad propia |
| `dos@docs.com` | USUARIO | Igual que el anterior |

## Funcionalidades

- **Autenticación**: login con JWT (sesión de 8 horas) y control de acceso por rol.
- **Carpetas**: crear, renombrar y mover, con jerarquía de subcarpetas sin ciclos.
- **Archivos**: subir, descargar, ver, renombrar y mover. Solo `.txt` y `.md`, máximo 5 MB. Búsqueda por nombre y filtro por tipo.
- **Compartición**: por usuario, con permisos de lectura, comentar y edición. Lo compartido sobre una carpeta se hereda a su contenido.
- **Papelera**: eliminar envía a la papelera; desde ahí se restaura o se elimina definitivamente.
- **Historial de actividad**: quién hizo qué, sobre qué recurso y cuándo.
- **Reportes** (solo ADMIN): 12 reportes con agregaciones de MongoDB.
- **Administración de usuarios** (solo ADMIN): activar y desactivar usuarios. Desactivar no borra su información.

## Scripts del servidor

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia el servidor y lo reinicia al guardar cambios |
| `npm run seed` | Crea índices y carga los datos iniciales |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la versión compilada |

## Solución de problemas

| Problema | Causa probable y solución |
|---|---|
| `MongoServerSelectionError` al iniciar | MongoDB no está corriendo. Iniciar el servicio **MongoDB Server**. |
| Login responde 500 | Falta el `.env` o no se ejecutó `npm run seed`. |
| "Credenciales inválidas" con `admin@docs.com` | Ejecutar `npm run seed`. Si el usuario fue desactivado, reactivarlo desde la pantalla de usuarios. |
| Error de CORS en la consola del navegador | El servidor no está corriendo en el puerto 3000. |
| No aparece el botón **Reportes** o **Usuarios** | Esos botones son solo para ADMIN. Cerrar sesión y entrar con `admin@docs.com`. |
| El navegador muestra datos de sesión viejos | En la consola del navegador: `localStorage.clear()` y volver a iniciar sesión. |
| `npm install` falla | Verificar la versión de Node con `node -v` (debe ser 20.19 o superior). |

## Limitaciones conocidas

- El permiso **comentar** se guarda y se muestra, pero todavía no existe una función de comentarios.
- Si un administrador desactiva a un usuario con sesión abierta, su token sigue siendo válido hasta que expire (8 horas).