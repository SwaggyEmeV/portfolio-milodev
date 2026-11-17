// Datos personales en un solo sitio: edítalos aquí y se actualizan en toda la web
// (el mapa de red del home, los expedientes, el contacto y las páginas de proyecto).
export const site = {
  nombre: "Miller Ochoa",
  usuario: "miller", // aparece en el prompt de la consola: miller@milodev:~$
  host: "milodev", // nombre de la "máquina": miller@milodev
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
  // Ficha del host `miller` (el nodo central del mapa)
  ficha: [
    ["Rol", "desarrollador web (backend)"],
    ["Stack", "PHP · MySQL · Linux"],
    ["Ahora", "Astro · Tailwind CSS"],
    ["Fuera", "motos · mecánica · Mr. Robot"],
  ] as [string, string][],
  // Host `stack`: cada tecnología es un "puerto" del escaneo nmap.
  // estado "open" = la uso a diario · "filtered" = la estoy aprendiendo
  tecnologias: [
    { nombre: "PHP", puerto: 9000, capa: "backend", estado: "open" },
    { nombre: "MySQL", puerto: 3306, capa: "datos", estado: "open" },
    { nombre: "Linux", puerto: 22, capa: "servidor", estado: "open" },
    { nombre: "Git", puerto: 9418, capa: "flujo de trabajo", estado: "open" },
    { nombre: "JavaScript", puerto: 443, capa: "cliente", estado: "open" },
    { nombre: "HTML · CSS", puerto: 80, capa: "interfaz", estado: "open" },
    { nombre: "Astro", puerto: 4321, capa: "aprendiendo", estado: "filtered" },
    { nombre: "Tailwind CSS", puerto: 5173, capa: "aprendiendo", estado: "filtered" },
  ],
  // Host `garaje`: un archivo .txt por interés
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

// Los "hosts" del mapa de red: el nodo central (core) y un nodo por sección.
// `id` es también el #hash de la URL (/#proyectos abre ese expediente).
export const hosts = [
  { id: "core", ip: "10.13.37.1", nombre: "miller" },
  { id: "proyectos", ip: "10.13.37.10", nombre: "proyectos" },
  { id: "stack", ip: "10.13.37.20", nombre: "stack" },
  { id: "sobre-mi", ip: "10.13.37.30", nombre: "sobre_mi" },
  { id: "garaje", ip: "10.13.37.40", nombre: "garaje" },
  { id: "contacto", ip: "10.13.37.50", nombre: "contacto" },
];

// Barra de estado inferior (estilo tmux): una pestaña por host.
export const tabs = hosts.map((h, i) => ({
  id: h.id,
  etiqueta: `${i}:${h.nombre}`,
  href: h.id === "core" ? "/" : `/#${h.id}`,
}));
