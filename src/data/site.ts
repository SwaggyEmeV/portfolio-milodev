// Datos personales en un solo sitio: edítalos aquí y se actualizan en toda la web
// (la terminal del home, la ficha de neofetch, el contacto y las páginas de proyecto).
export const site = {
  nombre: "Miller Ochoa",
  usuario: "miller", // aparece en el prompt de la terminal: miller@garaje:~$
  rol: "Desarrollador Web",
  frase:
    "Escribo código como reparo motos: desarmo el problema, entiendo cada pieza y no paro hasta que todo arranca a la primera.",
  sobreMi: [
    "Soy desarrollador web. Trabajo sobre todo con PHP y MySQL, y monto y mantengo mis propios servidores Linux. Ahora estoy aprendiendo Astro y Tailwind CSS, y con ellos construí este portfolio.",
    "Me gusta entender cómo funcionan las cosas por dentro, tanto un backend como un motor de dos tiempos. Esa curiosidad es la que me hace mejorar como programador cada día.",
  ],
  // TODO: cambia estos tres por tus datos reales antes de publicar
  email: "tu-correo@ejemplo.com",
  github: "https://github.com/tu-usuario",
  linkedin: "https://www.linkedin.com/in/tu-usuario",
  // Ficha que imprime el comando `neofetch` junto a la "M" en ASCII
  ficha: [
    ["Rol", "desarrollador web (backend)"],
    ["Stack", "PHP · MySQL · Linux"],
    ["Ahora", "Astro · Tailwind CSS"],
    ["Fuera", "motos · mecánica · Mr. Robot"],
  ] as [string, string][],
  // Comando `cat stack.txt`: tecnología y la capa en la que la uso
  tecnologias: [
    { nombre: "PHP", capa: "backend" },
    { nombre: "MySQL", capa: "datos" },
    { nombre: "Linux", capa: "servidor" },
    { nombre: "Git", capa: "flujo de trabajo" },
    { nombre: "JavaScript", capa: "cliente" },
    { nombre: "HTML · CSS", capa: "interfaz" },
    { nombre: "Astro", capa: "aprendiendo" },
    { nombre: "Tailwind CSS", capa: "aprendiendo" },
  ],
  // Carpeta `garaje/`: un archivo .txt por interés
  intereses: [
    {
      archivo: "motos.txt",
      titulo: "Motos",
      texto: "Nada me despeja tanto como rodar. Muchas soluciones se me ocurren con el casco puesto.",
    },
    {
      archivo: "mecanica.txt",
      titulo: "Mecánica",
      texto: "Desarmar, diagnosticar y volver a montar. Debuggear un carburador se parece mucho a debuggear código.",
    },
    {
      archivo: "rick-and-morty.txt",
      titulo: "Rick and Morty",
      texto: "Ciencia, caos y multiversos. Mi serie para desconectar, y la culpa de mi verde favorito.",
    },
    {
      archivo: "mr-robot.txt",
      titulo: "Mr. Robot",
      texto: "La serie que mejor retrata la cultura hacker y la seguridad informática. Me hizo mirar la terminal con otros ojos.",
    },
  ],
};

// Barra inferior estilo tmux = una pestaña por ETAPA del scroll (mismo orden que
// ETAPAS en src/scripts/escenario.ts). `href` es a dónde lleva desde las demás
// páginas: el home lee el #hash y salta a esa etapa.
export const tabs = [
  { etiqueta: "0:home", href: "/" },
  { etiqueta: "1:proyectos", href: "/#proyectos" },
  { etiqueta: "2:sobre_mi", href: "/#sobre-mi" },
  { etiqueta: "3:garaje", href: "/#garaje" },
  { etiqueta: "4:contacto", href: "/#contacto" },
];
