// generate_readme_html.mjs
// Script para generar readme.html de forma automática a partir de README.md
import fs from 'fs';
import path from 'path';

const README_PATH = './README.md';
const OUTPUT_PATH = './readme.html';

if (!fs.existsSync(README_PATH)) {
    console.error(`ERROR: No se encontró el archivo ${README_PATH}`);
    process.exit(1);
}

const markdownContent = fs.readFileSync(README_PATH, 'utf-8');

// Escapar caracteres especiales de HTML que puedan romper la etiqueta script de tipo markdown
function escapeHtmlForScript(text) {
    return text
        .replace(/<\/script>/g, '<\\/script>');
}

const escapedMarkdown = escapeHtmlForScript(markdownContent);

const htmlTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Página Arquimedes - Documentación del Proyecto</title>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    
    <!-- Parser de Markdown (Cargado vía CDN) -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(20, 27, 45, 0.7);
            --card-border: rgba(255, 255, 255, 0.08);
            --primary: #6366f1;
            --primary-hover: #4f46e5;
            --primary-glow: rgba(99, 102, 241, 0.15);
            --secondary: #8b5cf6;
            --accent: #10b981;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --code-bg: #05070c;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-main);
            line-height: 1.7;
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 40%);
            background-attachment: fixed;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 50px 20px;
        }

        .header-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--card-border);
        }

        .btn-back {
            background-color: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--card-border);
            color: var(--text-main);
            text-decoration: none;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-back:hover {
            background-color: var(--primary);
            border-color: var(--primary);
            box-shadow: 0 0 12px var(--primary-glow);
        }

        .doc-badge {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        /* Markdown rendered styling */
        #rendered-markdown {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            padding: 40px;
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }

        #rendered-markdown h1 {
            font-size: 2.2rem;
            font-weight: 800;
            margin-bottom: 24px;
            background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            border-bottom: 2px solid var(--card-border);
            padding-bottom: 15px;
        }

        #rendered-markdown h2 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-top: 35px;
            margin-bottom: 18px;
            color: #ffffff;
            border-bottom: 1px solid var(--card-border);
            padding-bottom: 8px;
        }

        #rendered-markdown h3 {
            font-size: 1.2rem;
            font-weight: 600;
            margin-top: 25px;
            margin-bottom: 12px;
            color: #e0e7ff;
        }

        #rendered-markdown p {
            margin-bottom: 16px;
            color: var(--text-main);
            font-size: 1.05rem;
        }

        #rendered-markdown ul, #rendered-markdown ol {
            margin-left: 24px;
            margin-bottom: 20px;
        }

        #rendered-markdown li {
            margin-bottom: 8px;
            color: var(--text-main);
        }

        #rendered-markdown blockquote {
            border-left: 4px solid var(--primary);
            background-color: rgba(99, 102, 241, 0.05);
            padding: 16px 20px;
            margin: 20px 0;
            border-radius: 0 12px 12px 0;
            color: #d1d5db;
        }

        #rendered-markdown blockquote p {
            margin-bottom: 0;
        }

        #rendered-markdown a {
            color: var(--primary);
            text-decoration: none;
            border-bottom: 1px dashed var(--primary);
            transition: all 0.2s ease;
        }

        #rendered-markdown a:hover {
            color: var(--secondary);
            border-bottom-color: var(--secondary);
        }

        #rendered-markdown pre {
            background-color: var(--code-bg);
            border: 1px solid var(--card-border);
            border-radius: 12px;
            padding: 20px;
            overflow-x: auto;
            margin: 20px 0;
            box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
        }

        #rendered-markdown code {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9em;
            color: #a5b4fc;
            background-color: rgba(99, 102, 241, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
        }

        #rendered-markdown pre code {
            background-color: transparent;
            padding: 0;
            color: #e2e8f0;
            border-radius: 0;
            font-size: 0.85rem;
        }

        #rendered-markdown table {
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            font-size: 0.95rem;
        }

        #rendered-markdown th {
            background-color: rgba(99, 102, 241, 0.1);
            color: #ffffff;
            font-weight: 600;
            text-align: left;
            padding: 12px 16px;
            border-bottom: 2px solid var(--card-border);
        }

        #rendered-markdown td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--card-border);
            color: var(--text-main);
        }

        #rendered-markdown tr:hover {
            background-color: rgba(255, 255, 255, 0.02);
        }

        #offline-fallback {
            display: none;
            background-color: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.2);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            color: var(--highlight);
            font-size: 0.9rem;
        }

        footer {
            text-align: center;
            margin-top: 40px;
            color: var(--text-muted);
            font-size: 0.85rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-nav">
            <a href="file:///c:/Antigravity/Pagina%20Arquimedes/purga_datos.html" class="btn-back">⚙️ Ir a Guía de Purga</a>
            <span class="doc-badge">Manual de Proyecto</span>
        </div>

        <div id="offline-fallback">
            ⚠️ Modo Offline: No se pudo cargar el renderizador de Markdown. A continuación se muestra el archivo README.md en formato de texto plano estructurado.
        </div>

        <!-- Div donde se renderizará el markdown -->
        <main id="rendered-markdown">
            Cargando documentación...
        </main>

        <footer>
            <p>Página Arquimedes &copy; 2026. Documento generado dinámicamente desde README.md.</p>
        </footer>
    </div>

    <!-- Contenedor del markdown crudo -->
    <script type="text/markdown" id="raw-markdown">${escapedMarkdown}</script>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const rawMarkdown = document.getElementById('raw-markdown').textContent;
            const container = document.getElementById('rendered-markdown');
            const fallbackAlert = document.getElementById('offline-fallback');

            // Verificar si la librería marked.js está disponible (online)
            if (typeof marked !== 'undefined') {
                try {
                    // Configurar opciones de marked
                    marked.setOptions({
                        breaks: true,
                        gfm: true
                    });
                    container.innerHTML = marked.parse(rawMarkdown);
                } catch (e) {
                    console.error('Error al parsear el markdown: ', e);
                    renderFallback(rawMarkdown, container, fallbackAlert);
                }
            } else {
                // Modo offline: Renderizar en texto plano pre-formateado
                renderFallback(rawMarkdown, container, fallbackAlert);
            }
        });

        function renderFallback(text, container, alertEl) {
            alertEl.style.display = 'block';
            container.innerHTML = \`<pre style="white-space: pre-wrap; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; line-height: 1.5; color: var(--text-main); background: var(--code-bg); padding: 20px; border-radius: 12px;">\${escapeHtml(text)}</pre>\`;
        }

        function escapeHtml(text) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
    </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_PATH, htmlTemplate, 'utf-8');
console.log(`¡Éxito! Archivo ${OUTPUT_PATH} generado a partir de README.md correctamente.`);
