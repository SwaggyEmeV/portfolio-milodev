// Datos personales en un solo sitio: edítalos aquí y se actualizan en toda la web
// (el mapa de red del home, los expedientes, el contacto y las páginas de proyecto).
export const site = {
  nombre: "Miller Ochoa",
  usuario: "miller", // aparece en el prompt de la consola: miller@milodev:~$
  host: "milodev", // nombre de la "máquina": miller@milodev
  rol: "Desarrollador Backend",
  ubicacion: "Barranquilla, Colombia",
  frase:
    "Escribo código como reparo motos: desarmo el problema, entiendo cada pieza y no paro hasta que todo arranca a la primera.",
  sobreMi: [
    "Soy desarrollador backend con más de 3 años de experiencia construyendo aplicaciones web y APIs con .NET (C#, ASP.NET Core) y PHP (Laravel). Trabajo con arquitectura limpia y en capas, diseño y optimizo bases de datos SQL Server y MySQL, e implemento autenticación segura (2FA) y comunicación en tiempo real con SignalR.",
    "Me importa escribir código mantenible: principios SOLID, pruebas unitarias e integración continua. También despliego y administro mis propios servidores Linux.",
    "Me gusta entender cómo funcionan las cosas por dentro, tanto un backend como un motor de dos tiempos. Esa curiosidad es la que me hace mejorar como programador cada día.",
  ],
  email: "ochoamiller78@gmail.com",
  github: "https://github.com/SwaggyEmeV",
  linkedin: "https://www.linkedin.com/in/milodevv/",
  // CV descargable (el archivo está en public/cv/)
  cv: "/cv/Miller_Ochoa_Backend_Developer_CV.pdf",
  // Ficha del host `miller` (el nodo central del mapa)
  ficha: [
    ["Rol", "desarrollador backend · +3 años"],
    ["Stack", ".NET (C#) · PHP (Laravel) · SQL Server · MySQL"],
    ["Ahora", "Magnificat · freelance .NET"],
    ["Base", "Barranquilla, Colombia · remoto"],
    ["Fuera", "motos · mecánica · Mr. Robot"],
  ] as [string, string][],
  // Experiencia (sale como un `git log` en el expediente "sobre mí")
  experiencia: [
    {
      periodo: "nov 2026 – hoy",
      puesto: "Desarrollador Web",
      empresa: "Magnificat",
      lugar: "Barranquilla",
      logros: [
        "Desarrollo y mantenimiento de aplicaciones web con PHP y Laravel.",
        "Diseño de bases de datos e implementación de nuevas funcionalidades backend.",
      ],
    },
    {
      periodo: "ago 2025 – hoy",
      puesto: "Desarrollador .NET",
      empresa: "Freelance",
      lugar: "remoto",
      logros: [
        "Buscador Andino: plataforma para organismos acreditadores regionales (ONAC, INACAL, SAE, IBMETRO).",
        "Arquitectura en capas, autenticación 2FA y SignalR; diseño y optimización de bases de datos SQL Server.",
      ],
    },
    {
      periodo: "ago 2024 – jul 2025",
      puesto: "Auxiliar de Soluciones de Negocio",
      empresa: "Oben Group",
      lugar: "Galapa",
      logros: [
        "Desarrollé e implementé ObenMas App, reduciendo los tiempos operativos un 25%.",
        "Procedimientos almacenados en SQL Server y control de acceso en el ERP Oracle NetSuite.",
        "SOLID, pruebas unitarias, arquitectura y control de versiones: código optimizado un 30%.",
      ],
    },
    {
      periodo: "oct 2023 – ago 2024",
      puesto: "Auxiliar Administrativo",
      empresa: "Extras",
      lugar: "Galapa",
      logros: ["Tareas administrativas y soporte de primer nivel del sistema interno Oben Mas."],
    },
    {
      periodo: "mar 2023 – sep 2023",
      puesto: "Practicante",
      empresa: "Oben Group",
      lugar: "Galapa",
      logros: ["Desarrollo y mantenimiento de aplicaciones internas, con foco en rendimiento y usabilidad."],
    },
  ],
  formacion: "Técnico en Programación de Software · SENA (2022)",
  // Host `stack`: cada tecnología es un "puerto" del escaneo nmap.
  // estado "open" = la uso a diario · "filtered" = la estoy aprendiendo
  tecnologias: [
    { nombre: "C# · .NET", puerto: 5000, capa: "backend", estado: "open" },
    { nombre: "ASP.NET Core", puerto: 443, capa: "APIs REST", estado: "open" },
    { nombre: "PHP · Laravel", puerto: 8000, capa: "backend", estado: "open" },
    { nombre: "SQL Server", puerto: 1433, capa: "datos", estado: "open" },
    { nombre: "MySQL", puerto: 3306, capa: "datos", estado: "open" },
    { nombre: "SignalR", puerto: 5001, capa: "tiempo real", estado: "open" },
    { nombre: "Docker", puerto: 2375, capa: "contenedores", estado: "open" },
    { nombre: "Linux", puerto: 22, capa: "servidor", estado: "open" },
    { nombre: "Git", puerto: 9418, capa: "flujo de trabajo", estado: "open" },
    { nombre: "Angular", puerto: 4200, capa: "cliente", estado: "open" },
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
// `secreto` es el "archivo cifrado" de cada host: se muestra al ganar el
// minijuego de intrusión (breach). Cámbialos por lo que quieras.
export const hosts = [
  { id: "core", ip: "10.13.37.1", nombre: "miller", secreto: "root:x:0:0:miller:/home/miller:/bin/zsh — la contraseña no es \"password\". probablemente." },
  { id: "proyectos", ip: "10.13.37.10", nombre: "proyectos", secreto: "git log --oneline | head -1  →  \"arreglo definitivo (esta vez sí)\"" },
  { id: "stack", ip: "10.13.37.20", nombre: "stack", secreto: "regla del stack: si funciona en producción, nadie lo toca un viernes." },
  { id: "sobre-mi", ip: "10.13.37.30", nombre: "sobre_mi", secreto: "// TODO: acortar esta bio. las secciones \"sobre mí\" siempre suenan escritas por un robot muy serio." },
  { id: "garaje", ip: "10.13.37.40", nombre: "garaje", secreto: "el ruido del motor es el mejor monitor de latencia: si suena raro, algo va mal." },
  { id: "contacto", ip: "10.13.37.50", nombre: "contacto", secreto: "canal prioritario: si llegaste hasta aquí rompiendo cosas, pon \"Hello, friend.\" de asunto." },
];

// Barra de estado inferior (estilo tmux): una pestaña por host.
export const tabs = hosts.map((h, i) => ({
  id: h.id,
  etiqueta: `${i}:${h.nombre}`,
  href: h.id === "core" ? "/" : `/#${h.id}`,
}));
