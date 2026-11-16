// "Content collections": Astro lee archivos Markdown y comprueba que tengan
// los campos correctos. Si un proyecto no tiene "titulo", la build falla
// y te avisa (así no publicas una tarjeta rota).
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const proyectos = defineCollection({
  // Lee todos los .md de src/content/proyectos
  loader: glob({ pattern: "**/*.md", base: "./src/content/proyectos" }),
  // El "schema" describe el bloque de datos (frontmatter) de cada archivo.
  schema: z.object({
    titulo: z.string(),
    resumen: z.string(),
    tecnologias: z.array(z.string()),
    fecha: z.coerce.date(),
    demo: z.string().url().optional(),
    repo: z.string().url().optional(),
    destacado: z.boolean().default(false),
  }),
});

export const collections = { proyectos };
