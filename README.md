# Medicina Integrada I - Caso 1

Web docente pública con acceso mediante Firebase Authentication.

## Seguridad

Este repositorio no debe contener claves iRAT/tRAT, respuestas tAPP ni documentos docentes sensibles. El contenido protegido se carga desde Firestore tras iniciar sesión.

Los usuarios autorizados y sus contraseñas se gestionan exclusivamente en Firebase Authentication. No deben escribirse en este repositorio.

## Configuración local

1. Copia `firebase-config.example.js` como `firebase-config.js`.
2. Rellena los datos de la app web de Firebase.
3. Crea en Firestore el documento `teacherCases/caso1`.
4. Publica reglas equivalentes a `firestore.rules.example`.
5. Abre `index.html` o sirve la carpeta con un servidor local.

## Estructura esperada del documento Firestore

```js
{
  eyebrow: "Medicina Integrada I",
  title: "El curioso caso de Elijah Price",
  subtitle: "Guía docente paso a paso para dirigir la clase",
  causalMap: [
    "COL1A1 alterado",
    "Colágeno tipo I alterado",
    "Matriz extracelular débil"
  ],
  phases: [
    {
      id: "s1-presentacion",
      session: 1,
      number: 1,
      title: "Presentación del caso",
      minutes: 10,
      type: "Apertura",
      objective: "...",
      startPhrase: "...",
      closePhrase: "...",
      minutePlan: ["..."],
      teacherActions: ["..."],
      studentActions: ["..."],
      questions: ["..."],
      expected: ["..."],
      rescue: ["..."],
      board: ["..."],
      collect: ["..."],
      watchFor: ["..."],
      preparedPhrases: ["..."],
      focus: ["..."],
      materials: ["historia"]
    }
  ],
  resources: [
    {
      id: "historia",
      title: "Historia clínica",
      description: "Documento protegido",
      audience: "Docente",
      url: "URL protegida o firmada"
    }
  ]
}
```
