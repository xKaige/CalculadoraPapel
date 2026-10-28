# Calculadora de Papel

App web instalable (PWA) con herramientas para imprenta:

- **Peso de papel**: kilos a partir de hojas, u hojas a partir de kilos.
- **Poses por pliego**: cuántos trabajos entran en un pliego, centrados en la mesa, con pinza y calle.
- **Presupuesto**: costos de impresión y terminaciones, con el dólar oficial actualizado, total y precio unitario.
- **Planilla de papel**: registro de proveedor, material, formato, pliegos y kilos. Requiere ingresar con Google; cada usuario tiene sus propios datos (guardados en Firebase).

## Publicar
Se publica tal cual en Vercel (sitio estático, sin build).

## Actualizar en los celulares
Cada vez que cambies algo, subí el número de `VERSION` en `sw.js` (por ejemplo `papel-v2` → `papel-v3`).

## Configurar el login con Google (Firebase)
1. Entrá a https://console.firebase.google.com y creá un proyecto (Analytics no hace falta).
2. **Authentication** → Comenzar → Método de acceso → **Google** → Habilitar → elegí un correo de soporte → Guardar.
3. **Authentication** → Configuración → **Dominios autorizados** → agregar `calculadorapapel.vercel.app`.
4. **Firestore Database** → Crear base de datos → modo producción → ubicación (por ejemplo `southamerica-east1`).
5. **Firestore Database** → **Reglas** → pegá el contenido de `firestore.rules` → Publicar.
6. ⚙ Configuración del proyecto → Tus apps → ícono **Web** (`</>`) → registrá la app → copiá los valores de `firebaseConfig` en `firebase-config.js`.
7. Subí el cambio (y aumentá `VERSION` en `sw.js`).

Los datos quedan en `usuarios/{uid}/planilla`. Las reglas impiden que un usuario lea o modifique los de otro.
