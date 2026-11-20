---
titulo: "Blog personal en PHP"
resumen: "Blog hecho desde cero con PHP y MySQL, desplegado en mi propio servidor Linux en la nube."
tecnologias: ["PHP", "MySQL", "HTML", "CSS", "Linux"]
fecha: 2026-10-01
demo: "https://163-192-132-242.sslip.io/"
destacado: true
---

## Qué es

Un blog personal construido sin frameworks, para entender bien cómo funciona una aplicación PHP de principio a fin: rutas, consultas a la base de datos, plantillas y despliegue.

## Cómo lo hice

- Desarrollo en local con **Laragon**, usando el dominio `blog.test`.
- Base de datos **MySQL**, que gestiono con HeidiSQL a través de un túnel SSH.
- Flujo de trabajo con **Git**: una rama `feature/*` por cada cambio y Pull Requests antes de mezclar en `main`.
- Desplegado en un servidor **Linux** en la nube que configuré yo mismo.

## Qué aprendí

- Organizar un proyecto PHP en carpetas con responsabilidades claras.
- Administrar un servidor: SSH, servidor web y base de datos en producción.
- Trabajar con ramas y revisiones como en un equipo real.
